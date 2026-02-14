import { eq } from "drizzle-orm";
import { db } from "../lib/db.js";
import { messageQueue } from "../lib/schema.js";
import { config } from "../lib/config.js";
import { createLogger } from "../lib/logger.js";
import { invokeClaude, getSessionId, clearSession, resumeLastSession } from "./claude.js";
import { buildFullContext, buildResumePrompt, buildExternalChatContext } from "./context.js";
import { extractAndApplyMemoryUpdates } from "./memory.js";
import { extractAndQueueOutbound } from "./outbound.js";
import { handleCommand } from "./commands.js";

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
  // Get next pending message
  const msg = db
    .select()
    .from(messageQueue)
    .where(eq(messageQueue.status, "pending"))
    .limit(1)
    .get();

  if (!msg) return;

  log.info(`Processing message ${msg.id}: ${msg.text.slice(0, 80)}`);

  // Mark as processing
  db.update(messageQueue)
    .set({ status: "processing" })
    .where(eq(messageQueue.id, msg.id))
    .run();

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

    const result = invokeClaude(prompt, { sudo: isSudo });

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
