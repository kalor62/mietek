import { db } from "../lib/db.js";
import { outboundMessages } from "../lib/schema.js";
import { getSessionId } from "./claude.js";
import { createLogger } from "../lib/logger.js";

const log = createLogger("processor");

interface SendRequest {
  to: string;
  message: string;
}

export function extractAndQueueOutbound(response: string): string {
  const sendBlockRegex = /```send_message\s*\n?([\s\S]*?)```/g;
  let cleanResponse = response;
  let match: RegExpExecArray | null;

  while ((match = sendBlockRegex.exec(response)) !== null) {
    try {
      const request: SendRequest = JSON.parse(match[1].trim());
      if (!request.to || !request.message) {
        log.warn("send_message block missing 'to' or 'message'");
        continue;
      }

      // Normalize phone: strip +, spaces, dashes
      const phone = request.to.replace(/[\s\-+]/g, "");

      const inserted = db
        .insert(outboundMessages)
        .values({
          targetPhone: phone,
          message: request.message,
          status: "pending_approval",
          sessionId: getSessionId(),
          createdAt: new Date(),
        })
        .returning()
        .get();

      log.action(`Outbound #${inserted.id} queued: ${phone} (${request.message.length} chars)`);

      // Replace the block with a confirmation prompt for the owner
      const confirmText = [
        `\n📨 *Wiadomość do wysłania (#${inserted.id}):*`,
        `Do: ${phone}`,
        `Treść: ${request.message.length > 200 ? request.message.slice(0, 200) + "..." : request.message}`,
        `\nNapisz /wyślij ${inserted.id} lub /odrzuć ${inserted.id}`,
      ].join("\n");

      cleanResponse = cleanResponse.replace(match[0], confirmText);
    } catch (err) {
      log.warn(`Failed to parse send_message block: ${err}`);
    }
  }

  return cleanResponse;
}
