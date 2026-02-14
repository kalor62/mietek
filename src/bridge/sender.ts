import { eq, and, isNull, isNotNull } from "drizzle-orm";
import { db } from "../lib/db.js";
import { messageQueue, outboundMessages } from "../lib/schema.js";
import { config } from "../lib/config.js";
import { createLogger } from "../lib/logger.js";
import { getSocket } from "./whatsapp.js";

const log = createLogger("bridge");

// Track whether we're currently showing typing indicator
let isShowingTyping = false;

export function chunkMessage(text: string): string[] {
  if (text.length <= config.maxMessageLength) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= config.maxMessageLength) {
      chunks.push(remaining);
      break;
    }

    // Try to split at a newline
    let splitIdx = remaining.lastIndexOf("\n", config.maxMessageLength);
    if (splitIdx < config.maxMessageLength * 0.5) {
      // No good newline break, try space
      splitIdx = remaining.lastIndexOf(" ", config.maxMessageLength);
    }
    if (splitIdx < config.maxMessageLength * 0.3) {
      // No good break point, force split
      splitIdx = config.maxMessageLength;
    }

    chunks.push(remaining.slice(0, splitIdx));
    remaining = remaining.slice(splitIdx).trimStart();
  }

  return chunks;
}

export async function pollAndSendResponses(): Promise<void> {
  const sock = getSocket();
  if (!sock) return;

  // Find completed messages that haven't been sent yet
  const completed = db
    .select()
    .from(messageQueue)
    .where(
      and(
        eq(messageQueue.status, "completed"),
        isNotNull(messageQueue.response),
        isNull(messageQueue.sentAt)
      )
    )
    .all();

  for (const msg of completed) {
    if (!msg.response) continue;

    try {
      // Send to the original chat: @s.whatsapp.net or @g.us go directly, @lid falls back to owner
      const ownerJid = config.ownerJid?.replace(/:\d+@/, "@");
      if (!ownerJid) continue;
      const targetJid = msg.senderJid.endsWith("@lid")
        ? ownerJid
        : msg.senderJid.replace(/:\d+@/, "@");

      const chunks = chunkMessage(msg.response);

      log.info(`Sending to JID: ${targetJid} (original sender: ${msg.senderJid})`);

      for (const chunk of chunks) {
        const result = await sock.sendMessage(targetJid, { text: chunk });
        log.info(`sendMessage result: ${JSON.stringify(result?.key || "no key")}`);
        // Small delay between chunks
        if (chunks.length > 1) {
          await new Promise((r) => setTimeout(r, 500));
        }
      }

      db.update(messageQueue)
        .set({ sentAt: new Date() })
        .where(eq(messageQueue.id, msg.id))
        .run();

      log.info(`Sent response for message ${msg.id} (${chunks.length} chunk(s))`);
    } catch (err) {
      log.error(`Failed to send response for message ${msg.id}: ${err}`);
    }
  }
}

export async function sendApprovedOutbound(): Promise<void> {
  const sock = getSocket();
  if (!sock) return;

  const approved = db
    .select()
    .from(outboundMessages)
    .where(eq(outboundMessages.status, "approved"))
    .all();

  for (const msg of approved) {
    try {
      const targetJid = `${msg.targetPhone}@s.whatsapp.net`;
      const chunks = chunkMessage(msg.message);

      log.info(`Sending outbound #${msg.id} to ${targetJid} (${chunks.length} chunk(s))`);

      for (const chunk of chunks) {
        await sock.sendMessage(targetJid, { text: chunk });
        if (chunks.length > 1) {
          await new Promise((r) => setTimeout(r, 500));
        }
      }

      db.update(outboundMessages)
        .set({ status: "sent", sentAt: new Date() })
        .where(eq(outboundMessages.id, msg.id))
        .run();

      log.action(`Outbound #${msg.id} sent to ${msg.targetPhone}`);
    } catch (err) {
      log.error(`Failed to send outbound #${msg.id}: ${err}`);
    }
  }
}

export async function showTypingForProcessing(): Promise<void> {
  const sock = getSocket();
  if (!sock) return;

  const ownerJid = config.ownerJid?.replace(/:\d+@/, "@");
  if (!ownerJid) return;

  // Check if any message is currently being processed
  const processing = db
    .select()
    .from(messageQueue)
    .where(eq(messageQueue.status, "processing"))
    .limit(1)
    .get();

  if (processing) {
    // Re-send composing every poll cycle to keep the indicator alive
    try {
      if (!isShowingTyping) {
        await sock.presenceSubscribe(ownerJid);
        isShowingTyping = true;
      }
      await sock.sendPresenceUpdate("composing", ownerJid);
    } catch { /* non-critical: typing indicator */ }
  } else if (isShowingTyping) {
    // No longer processing - stop typing indicator
    try {
      await sock.sendPresenceUpdate("paused", ownerJid);
    } catch { /* non-critical: typing indicator */ }
    isShowingTyping = false;
  }
}
