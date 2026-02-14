import { eq } from "drizzle-orm";
import { db } from "../lib/db.js";
import { userMemory } from "../lib/schema.js";
import type { MessageQueue } from "../lib/schema.js";
import { config } from "../lib/config.js";
import { t, r } from "../lib/i18n.js";

/**
 * Build full context for a NEW session (first message).
 * Includes system prompt, memory, and recent history.
 */
export function buildFullContext(currentMessage: MessageQueue): string {
  const parts: string[] = [];
  const lang = t();

  // System identity
  parts.push(`${r(lang.systemIdentity)}
${lang.genderInstruction[config.botGender]}
${lang.toneInstruction}
${config.botLang === "pl" ? "Obecny czas" : "Current time"}: ${new Date().toLocaleString(lang.dateLocale, { timeZone: lang.timezone })}.

${r(lang.responseFormat)}`);

  // Memory context
  const memories = db
    .select()
    .from(userMemory)
    .where(eq(userMemory.isActive, true))
    .all();

  if (memories.length > 0) {
    parts.push(`\n${lang.memoryHeader}`);
    for (const mem of memories) {
      parts.push(`[${mem.category}] ${mem.key}: ${mem.value}`);
    }
  }

  // Memory update + send_message instructions
  parts.push(`\n${lang.memoryInstructions}

${r(lang.sendMessageInstructions)}`);

  // Current message
  parts.push(`\n${lang.currentMessageHeader}\n${config.ownerName}: ${currentMessage.text}`);

  return parts.join("\n");
}

/**
 * Build a short prompt for RESUMED sessions.
 * Claude already has the full context from the initial message.
 * Just send the new user message.
 */
export function buildResumePrompt(currentMessage: MessageQueue): string {
  return currentMessage.text;
}

/**
 * Build context for trigger word invocations in external chats (not owner's self-chat).
 * Minimal prompt: no memory, no memory_update/send_message instructions.
 * Runs as one-shot to prevent context bleed from owner's private session.
 */
export function buildExternalChatContext(currentMessage: MessageQueue): string {
  const parts: string[] = [];
  const lang = t();

  parts.push(`${r(lang.systemIdentity)}
${lang.genderInstruction[config.botGender]}
${lang.toneInstruction}
${config.botLang === "pl" ? "Obecny czas" : "Current time"}: ${new Date().toLocaleString(lang.dateLocale, { timeZone: lang.timezone })}.

${r(lang.responseFormat)}

${r(lang.externalChatRules)}`);

  parts.push(`\n${lang.messageHeader}\n${currentMessage.text}`);

  return parts.join("\n");
}
