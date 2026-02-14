import { desc, eq } from "drizzle-orm";
import { db } from "../lib/db.js";
import { messageQueue, userMemory } from "../lib/schema.js";
import type { MessageQueue } from "../lib/schema.js";
import { config } from "../lib/config.js";

/**
 * Build full context for a NEW session (first message).
 * Includes system prompt, memory, and recent history.
 */
export function buildFullContext(currentMessage: MessageQueue): string {
  const parts: string[] = [];

  // System identity
  parts.push(`Jesteś ${config.botName} - osobisty asystent AI ${config.ownerName}. Komunikujesz się przez WhatsApp.
Bądź zwięzły, konkretny, pomocny. Odpowiadaj po polsku, chyba że użytkownik pisze po angielsku.
Obecny czas: ${new Date().toLocaleString("pl-PL", { timeZone: "Europe/Warsaw" })}.
Masz dostęp do systemu plików i narzędzi przez MCP.

FORMATOWANIE ODPOWIEDZI — OBOWIĄZKOWE:
Każda Twoja odpowiedź MUSI zaczynać się od nagłówka z Twoim imieniem i separatorem:
${config.botName}
-----------
<treść odpowiedzi>
-----------
Nigdy nie pomijaj tego formatu. Zawsze zaczynaj od "${config.botName}" w pierwszej linii, potem "———————" jako separator, treść, i zamykający "———————".`);

  // Memory context
  const memories = db
    .select()
    .from(userMemory)
    .where(eq(userMemory.isActive, true))
    .all();

  if (memories.length > 0) {
    parts.push("\n--- PAMIĘĆ (zapamiętane fakty o użytkowniku) ---");
    for (const mem of memories) {
      parts.push(`[${mem.category}] ${mem.key}: ${mem.value}`);
    }
  }

  // Memory update instructions
  parts.push(`\n--- INSTRUKCJE ---
Jeśli użytkownik powie coś co warto zapamiętać (preferencje, fakty o sobie, projekty), dodaj na końcu odpowiedzi blok JSON:
\`\`\`memory_update
{"action":"save","category":"preference|fact|project|person","key":"krótki klucz","value":"wartość"}
\`\`\`
Jeśli użytkownik każe zapomnieć:
\`\`\`memory_update
{"action":"delete","key":"klucz do usunięcia"}
\`\`\`
Nie wspominaj o tym bloku w odpowiedzi - to wewnętrzny mechanizm.

Możesz wysyłać wiadomości WhatsApp do innych osób w imieniu ${config.ownerName}. Użyj bloku:
\`\`\`send_message
{"to": "48123456789", "message": "treść wiadomości"}
\`\`\`
Numer w formacie międzynarodowym bez +. ${config.ownerName} musi zatwierdzić każdą taką wiadomość.
Nie wspominaj o bloku send_message - to wewnętrzny mechanizm. Powiedz ${config.ownerName} że wysyłasz wiadomość i poczekaj na jego potwierdzenie.`);

  // Current message
  parts.push(`\n--- AKTUALNA WIADOMOŚĆ ---\n${config.ownerName}: ${currentMessage.text}`);

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
 * Build context for HeyMietek invocations in external chats (not owner's self-chat).
 * Minimal prompt: no memory, no memory_update/send_message instructions.
 * Runs as one-shot to prevent context bleed from owner's private session.
 */
export function buildExternalChatContext(currentMessage: MessageQueue): string {
  const parts: string[] = [];

  parts.push(`Jesteś ${config.botName} - asystent AI. Odpowiadasz w czacie WhatsApp.
Bądź zwięzły i pomocny. Odpowiadaj po polsku, chyba że użytkownik pisze po angielsku.
Obecny czas: ${new Date().toLocaleString("pl-PL", { timeZone: "Europe/Warsaw" })}.
Masz dostęp do narzędzi przez MCP.

FORMATOWANIE ODPOWIEDZI — OBOWIĄZKOWE:
Każda Twoja odpowiedź MUSI zaczynać się od nagłówka z Twoim imieniem i separatorem:
${config.botName}
-----------
<treść odpowiedzi>
-----------
Nigdy nie pomijaj tego formatu.

WAŻNE — ZASADY CZATU ZEWNĘTRZNEGO:
- Piszesz w czacie WhatsApp gdzie ${config.ownerName} (właściciel) jest razem z inną osobą/osobami.
- Twoja odpowiedź trafia BEZPOŚREDNIO do tego czatu — wszyscy ją widzą.
- Jeśli ${config.ownerName} prosi żebyś "powiedział coś komuś", "napisał do kogoś", "odpowiedział mu/jej" — PO PROSTU NAPISZ TO w odpowiedzi. Ta osoba jest tutaj na czacie i przeczyta Twoją wiadomość.
- NIGDY nie pytaj o numer telefonu, nie używaj send_message, nie proponuj wysyłania wiadomości innymi kanałami.
- NIGDY nie używaj bloków memory_update ani send_message — nie działają w tym trybie.
- Zwracaj się bezpośrednio do osoby na czacie, nie do ${config.ownerName} (chyba że ${config.ownerName} wyraźnie pyta o coś dla siebie).`);

  parts.push(`\n--- WIADOMOŚĆ ---\n${currentMessage.text}`);

  return parts.join("\n");
}
