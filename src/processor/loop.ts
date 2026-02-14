import { eq } from "drizzle-orm";
import { db, sqlite } from "../lib/db.js";
import { messageQueue } from "../lib/schema.js";
import { config } from "../lib/config.js";
import { createLogger } from "../lib/logger.js";
import { invokeClaude, getSessionId, clearSession, resumeLastSession } from "./claude.js";
import { buildFullContext, buildResumePrompt, buildExternalChatContext } from "./context.js";
import { extractAndApplyMemoryUpdates } from "./memory.js";
import { extractAndQueueOutbound } from "./outbound.js";
import { handleCommand } from "./commands.js";
import type { MessageQueue } from "../lib/schema.js";

interface RawMessageRow {
  id: number;
  wa_message_id: string;
  sender_jid: string;
  text: string;
  response: string | null;
  status: string;
  session_id: string | null;
  created_at: number | null;
  completed_at: number | null;
  sent_at: number | null;
}

function rawToMessage(raw: RawMessageRow): MessageQueue {
  return {
    id: raw.id,
    waMessageId: raw.wa_message_id,
    senderJid: raw.sender_jid,
    text: raw.text,
    response: raw.response,
    status: raw.status,
    sessionId: raw.session_id,
    createdAt: raw.created_at ? new Date(raw.created_at) : null,
    completedAt: raw.completed_at ? new Date(raw.completed_at) : null,
    sentAt: raw.sent_at ? new Date(raw.sent_at) : null,
  };
}

function isOwnerChat(senderJid: string): boolean {
  // LID JIDs are always the owner (only owner messages get queued)
  if (senderJid.endsWith("@lid")) return true;
  // Compare normalized JIDs
  const ownerNorm = config.ownerJid?.replace(/:\d+@/, "@");
  const senderNorm = senderJid.replace(/:\d+@/, "@");
  return !!ownerNorm && senderNorm === ownerNorm;
}

const log = createLogger("processor");

export async function processingLoop(): Promise<void> {
  log.action(`Processor started (PID: ${process.pid})`);

  // Reset messages stuck in 'processing' from a previous crash
  const stuck = sqlite
    .prepare("UPDATE message_queue SET status = 'pending' WHERE status = 'processing' RETURNING id")
    .all() as { id: number }[];
  if (stuck.length > 0) {
    log.warn(`Reset ${stuck.length} stuck message(s) from 'processing' to 'pending': ${stuck.map(r => r.id).join(", ")}`);
  }

  resumeLastSession();

  while (true) {
    try {
      await processNextMessage();
    } catch (err) {
      log.error(`Processing loop error: ${err}`);
    }

    await new Promise((r) => setTimeout(r, config.pollInterval));
  }
}

async function processNextMessage(): Promise<void> {
  // Atomically claim the next pending message (ordered by id)
  const raw = sqlite
    .prepare(
      "UPDATE message_queue SET status = 'processing' WHERE id = (SELECT id FROM message_queue WHERE status = 'pending' ORDER BY id ASC LIMIT 1) RETURNING *"
    )
    .get() as RawMessageRow | undefined;

  if (!raw) return;

  const msg = rawToMessage(raw);

  log.info(`Processing message ${msg.id}: ${msg.text.slice(0, 80)}`);

  try {
    // External chat (HeyMietek) — one-shot, no commands, no memory
    if (!isOwnerChat(msg.senderJid)) {
      const prompt = buildExternalChatContext(msg);
      const result = invokeClaude(prompt, { oneShot: true });

      db.update(messageQueue)
        .set({
          response: result.response,
          status: result.success ? "completed" : "failed",
          sessionId: result.sessionId || null,
          completedAt: new Date(),
        })
        .where(eq(messageQueue.id, msg.id))
        .run();

      log.info(`[HeyMietek] Message ${msg.id} ${result.success ? "completed" : "failed"}`);
      return;
    }

    // --- Owner's self-chat flow ---

    // Check for prefix commands
    const cmdResult = handleCommand(msg.text);
    if (cmdResult.handled) {
      db.update(messageQueue)
        .set({
          response: cmdResult.response || "(no response)",
          status: "completed",
          completedAt: new Date(),
        })
        .where(eq(messageQueue.id, msg.id))
        .run();

      log.info(`Command handled: ${msg.text.slice(0, 30)}`);
      return;
    }

    // Check for /sudo prefix
    const isSudo = msg.text.trim().startsWith("/sudo ");
    const actualText = isSudo ? msg.text.trim().slice(6) : msg.text;

    // Build prompt based on whether we have an active session
    const hasSession = getSessionId() !== null;
    const contextMsg = { ...msg, text: actualText };
    const prompt = hasSession
      ? buildResumePrompt(contextMsg)
      : buildFullContext(contextMsg);

    let result = invokeClaude(prompt, { sudo: isSudo });

    // If resume failed, retry with full context for the new session
    if (result.retryWithFullContext) {
      log.warn(`Message ${msg.id}: resume failed, retrying with full context`);
      const fullPrompt = buildFullContext(contextMsg);
      result = invokeClaude(fullPrompt, { sudo: isSudo, forceNewSession: true });
    }

    // Extract memory updates and outbound messages, clean response
    const afterMemory = extractAndApplyMemoryUpdates(result.response);
    const cleanResponse = extractAndQueueOutbound(afterMemory);

    // Save response
    db.update(messageQueue)
      .set({
        response: cleanResponse,
        status: result.success ? "completed" : "failed",
        sessionId: result.sessionId || null,
        completedAt: new Date(),
      })
      .where(eq(messageQueue.id, msg.id))
      .run();

    log.info(`Message ${msg.id} ${result.success ? "completed" : "failed"} (session=${result.sessionId?.slice(0, 8)})`);
  } catch (err) {
    log.error(`Failed to process message ${msg.id}: ${err}`);

    db.update(messageQueue)
      .set({
        response: `Błąd przetwarzania: ${String(err).slice(0, 200)}`,
        status: "failed",
        completedAt: new Date(),
      })
      .where(eq(messageQueue.id, msg.id))
      .run();
  }
}
