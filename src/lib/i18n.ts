import { config } from "./config.js";

interface Translations {
  // System prompt
  systemIdentity: string;
  genderInstruction: { male: string; female: string };
  toneInstruction: string;
  responseFormat: string;
  memoryHeader: string;
  memoryInstructions: string;
  sendMessageInstructions: string;
  currentMessageHeader: string;
  externalChatRules: string;
  messageHeader: string;

  // Commands
  noMemory: string;
  memoryTitle: string;
  forgetUsage: string;
  forgetNotFound: (key: string) => string;
  forgot: (key: string) => string;
  remindUsage: string;
  reminderSet: (text: string, time: string) => string;
  sessionCleared: string;
  noActiveSession: string;
  outboundNotFound: string;
  outboundAlreadyHandled: (id: number, status: string) => string;
  outboundApproved: (phone: string) => string;
  outboundRejected: (phone: string) => string;

  // Remind regex + units
  remindPattern: RegExp;
  remindUnitMinute: (unit: string) => boolean;
  remindUnitHour: (unit: string) => boolean;
  remindUnitSecond: (unit: string) => boolean;
  remindUnitDay: (unit: string) => boolean;

  // Daily summary
  goodMorning: string;
  systemStatus: string;
  overnightAlerts: string;
  yesterdayActivity: string;
  messagesProcessed: (count: number) => string;
  dateLocale: string;
  timezone: string;

  // Heartbeat
  reminder: (text: string) => string;
}

const pl: Translations = {
  systemIdentity: `Jesteś {botName} - osobisty asystent AI {ownerName}. Komunikujesz się przez WhatsApp.`,
  genderInstruction: {
    male: `Jesteś mężczyzną — używaj męskich form gramatycznych (np. "zrobiłem", "sprawdziłem", "jestem gotowy").`,
    female: `Jesteś kobietą — używaj żeńskich form gramatycznych (np. "zrobiłam", "sprawdziłam", "jestem gotowa").`,
  },
  toneInstruction: `Bądź zwięzły, konkretny, pomocny. Odpowiadaj po polsku, chyba że użytkownik pisze po angielsku.`,
  responseFormat: `FORMATOWANIE ODPOWIEDZI — OBOWIĄZKOWE:
Każda Twoja odpowiedź MUSI zaczynać się od nagłówka z Twoim imieniem i separatorem:
{botName}
-----------
<treść odpowiedzi>
-----------
Nigdy nie pomijaj tego formatu. Zawsze zaczynaj od "{botName}" w pierwszej linii, potem "-----------" jako separator, treść, i zamykający "-----------".`,
  memoryHeader: `--- PAMIĘĆ (zapamiętane fakty o użytkowniku) ---`,
  memoryInstructions: `--- INSTRUKCJE ---
Jeśli użytkownik powie coś co warto zapamiętać (preferencje, fakty o sobie, projekty), dodaj na końcu odpowiedzi blok JSON:
\`\`\`memory_update
{"action":"save","category":"preference|fact|project|person","key":"krótki klucz","value":"wartość"}
\`\`\`
Jeśli użytkownik każe zapomnieć:
\`\`\`memory_update
{"action":"delete","key":"klucz do usunięcia"}
\`\`\`
Nie wspominaj o tym bloku w odpowiedzi - to wewnętrzny mechanizm.`,
  sendMessageInstructions: `Możesz wysyłać wiadomości WhatsApp do innych osób w imieniu {ownerName}. Użyj bloku:
\`\`\`send_message
{"to": "48123456789", "message": "treść wiadomości"}
\`\`\`
Numer w formacie międzynarodowym bez +. {ownerName} musi zatwierdzić każdą taką wiadomość.
Nie wspominaj o bloku send_message - to wewnętrzny mechanizm. Powiedz {ownerName} że wysyłasz wiadomość i poczekaj na jego potwierdzenie.`,
  currentMessageHeader: `--- AKTUALNA WIADOMOŚĆ ---`,
  externalChatRules: `WAŻNE — ZASADY CZATU ZEWNĘTRZNEGO:
- Piszesz w czacie WhatsApp gdzie {ownerName} (właściciel) jest razem z inną osobą/osobami.
- Twoja odpowiedź trafia BEZPOŚREDNIO do tego czatu — wszyscy ją widzą.
- Jeśli {ownerName} prosi żebyś "powiedział coś komuś", "napisał do kogoś", "odpowiedział mu/jej" — PO PROSTU NAPISZ TO w odpowiedzi. Ta osoba jest tutaj na czacie i przeczyta Twoją wiadomość.
- NIGDY nie pytaj o numer telefonu, nie używaj send_message, nie proponuj wysyłania wiadomości innymi kanałami.
- NIGDY nie używaj bloków memory_update ani send_message — nie działają w tym trybie.
- Zwracaj się bezpośrednio do osoby na czacie, nie do {ownerName} (chyba że {ownerName} wyraźnie pyta o coś dla siebie).`,
  messageHeader: `--- WIADOMOŚĆ ---`,

  // Commands
  noMemory: "Nie mam jeszcze żadnych zapamiętanych faktów.",
  memoryTitle: "*Zapamiętane fakty:*\n",
  forgetUsage: "Użycie: /forget <klucz>",
  forgetNotFound: (key) => `Nie znalazłem klucza "${key}" w pamięci.`,
  forgot: (key) => `Zapomniałem: ${key}`,
  remindUsage: "Użycie: /remind <tekst> za <liczba> <min/godz/dni>\nNp: /remind spotkanie za 30 min",
  reminderSet: (text, time) => `⏰ Przypomnienie ustawione: "${text}" o ${time}`,
  sessionCleared: "Sesja wyczyszczona. Następna wiadomość zacznie nową rozmowę.",
  noActiveSession: "Brak aktywnej sesji. Następna wiadomość zacznie nową rozmowę.",
  outboundNotFound: "Nie znaleziono wiadomości do wysłania.",
  outboundAlreadyHandled: (id, status) => `Wiadomość #${id} już obsłużona (${status}).`,
  outboundApproved: (phone) => `✅ Zatwierdzono wysłanie do ${phone}.`,
  outboundRejected: (phone) => `❌ Odrzucono wiadomość do ${phone}.`,

  // Remind parsing
  remindPattern: /^(.+?)\s+za\s+(\d+)\s*(min(?:ut[ęy]?)?|godz(?:in[ęy]?)?|h|sekund[ęy]?|s|dni|dzień|d)\s*$/i,
  remindUnitMinute: (u) => u.startsWith("min") || u === "m",
  remindUnitHour: (u) => u.startsWith("godz") || u === "h",
  remindUnitSecond: (u) => u.startsWith("sekund") || u === "s",
  remindUnitDay: (u) => u.startsWith("dn") || u.startsWith("dzie") || u === "d",

  // Daily summary
  goodMorning: `☀️ *Dzień dobry {ownerName}!*`,
  systemStatus: "*Status systemu:*",
  overnightAlerts: "*Alerty z nocy:*",
  yesterdayActivity: "*Wczorajsza aktywność:*",
  messagesProcessed: (count) => `• ${count} wiadomości przetworzonych`,
  dateLocale: "pl-PL",
  timezone: "Europe/Warsaw",

  // Heartbeat
  reminder: (text) => `⏰ Przypomnienie: ${text}`,
};

const en: Translations = {
  systemIdentity: `You are {botName} - {ownerName}'s personal AI assistant. You communicate via WhatsApp.`,
  genderInstruction: {
    male: `You are male.`,
    female: `You are female.`,
  },
  toneInstruction: `Be concise, specific, and helpful. Respond in English unless the user writes in another language.`,
  responseFormat: `RESPONSE FORMAT — MANDATORY:
Every response MUST start with a header containing your name and a separator:
{botName}
-----------
<response content>
-----------
Never skip this format. Always start with "{botName}" on the first line, then "-----------" as separator, content, and closing "-----------".`,
  memoryHeader: `--- MEMORY (stored facts about the user) ---`,
  memoryInstructions: `--- INSTRUCTIONS ---
If the user says something worth remembering (preferences, facts about themselves, projects), add a JSON block at the end of your response:
\`\`\`memory_update
{"action":"save","category":"preference|fact|project|person","key":"short key","value":"value"}
\`\`\`
If the user asks to forget:
\`\`\`memory_update
{"action":"delete","key":"key to delete"}
\`\`\`
Do not mention this block in your response - it's an internal mechanism.`,
  sendMessageInstructions: `You can send WhatsApp messages to other people on behalf of {ownerName}. Use this block:
\`\`\`send_message
{"to": "48123456789", "message": "message content"}
\`\`\`
Number in international format without +. {ownerName} must approve each such message.
Do not mention the send_message block - it's an internal mechanism. Tell {ownerName} you're sending a message and wait for confirmation.`,
  currentMessageHeader: `--- CURRENT MESSAGE ---`,
  externalChatRules: `IMPORTANT — EXTERNAL CHAT RULES:
- You are in a WhatsApp chat where {ownerName} (the owner) is together with another person/people.
- Your response goes DIRECTLY to this chat — everyone sees it.
- If {ownerName} asks you to "tell someone something", "write to someone", "reply to them" — JUST WRITE IT in your response. That person is right here in the chat and will read your message.
- NEVER ask for phone numbers, don't use send_message, don't suggest sending messages through other channels.
- NEVER use memory_update or send_message blocks — they don't work in this mode.
- Address the person in the chat directly, not {ownerName} (unless {ownerName} explicitly asks something for themselves).`,
  messageHeader: `--- MESSAGE ---`,

  // Commands
  noMemory: "I don't have any stored facts yet.",
  memoryTitle: "*Stored facts:*\n",
  forgetUsage: "Usage: /forget <key>",
  forgetNotFound: (key) => `Key "${key}" not found in memory.`,
  forgot: (key) => `Forgot: ${key}`,
  remindUsage: "Usage: /remind <text> in <number> <min/hours/days>\nExample: /remind meeting in 30 min",
  reminderSet: (text, time) => `⏰ Reminder set: "${text}" at ${time}`,
  sessionCleared: "Session cleared. Next message will start a new conversation.",
  noActiveSession: "No active session. Next message will start a new conversation.",
  outboundNotFound: "No message found to send.",
  outboundAlreadyHandled: (id, status) => `Message #${id} already handled (${status}).`,
  outboundApproved: (phone) => `✅ Approved sending to ${phone}.`,
  outboundRejected: (phone) => `❌ Rejected message to ${phone}.`,

  // Remind parsing
  remindPattern: /^(.+?)\s+in\s+(\d+)\s*(min(?:utes?)?|hours?|h|seconds?|s|days?|d)\s*$/i,
  remindUnitMinute: (u) => u.startsWith("min") || u === "m",
  remindUnitHour: (u) => u.startsWith("hour") || u === "h",
  remindUnitSecond: (u) => u.startsWith("second") || u === "s",
  remindUnitDay: (u) => u.startsWith("day") || u === "d",

  // Daily summary
  goodMorning: `☀️ *Good morning {ownerName}!*`,
  systemStatus: "*System status:*",
  overnightAlerts: "*Overnight alerts:*",
  yesterdayActivity: "*Yesterday's activity:*",
  messagesProcessed: (count) => `• ${count} messages processed`,
  dateLocale: "en-US",
  timezone: "UTC",

  // Heartbeat
  reminder: (text) => `⏰ Reminder: ${text}`,
};

const translations: Record<string, Translations> = { pl, en };

function resolve(text: string): string {
  return text
    .replace(/\{botName\}/g, config.botName)
    .replace(/\{ownerName\}/g, config.ownerName);
}

/** Get translation strings for the configured language. Falls back to English. */
export function t(): Translations {
  return translations[config.botLang] || translations.en;
}

/** Resolve placeholders ({botName}, {ownerName}) in a translation string. */
export { resolve as r };
