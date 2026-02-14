import { execSync } from "child_process";
import { eq } from "drizzle-orm";
import { db } from "../lib/db.js";
import { userMemory, reminders, outboundMessages } from "../lib/schema.js";
import { createLogger } from "../lib/logger.js";
import { clearSession, getSessionId } from "./claude.js";

const log = createLogger("processor");

export interface CommandResult {
  handled: boolean;
  response?: string;
}

export function handleCommand(text: string): CommandResult {
  const trimmed = text.trim();

  if (trimmed === "/status") return handleStatus();
  if (trimmed === "/memory") return handleMemory();
  if (trimmed === "/clear") return handleClear();
  if (trimmed.startsWith("/forget ")) return handleForget(trimmed.slice(8).trim());
  if (trimmed.startsWith("/remind ")) return handleRemind(trimmed.slice(8).trim());

  // Normalize Polish characters for command matching
  const normalized = trimmed.replace(/ś/g, "s").replace(/Ś/g, "S");
  if (normalized.startsWith("/wyslij")) return handleApproveOutbound(normalized.slice(7).trim());
  if (normalized.startsWith("/odrzuc")) return handleRejectOutbound(normalized.slice(7).trim());

  // /sudo is handled in the processor loop (needs Claude invocation)
  return { handled: false };
}

function handleStatus(): CommandResult {
  const lines: string[] = ["*System Status*\n"];

  // Disk
  try {
    const disk = execSync("df -h / | tail -1", { encoding: "utf8" }).trim();
    const parts = disk.split(/\s+/);
    lines.push(`💾 Disk: ${parts[4]} used (${parts[2]}/${parts[1]})`);
  } catch {
    lines.push("💾 Disk: error checking");
  }

  // Docker
  try {
    const docker = execSync("docker ps --format '{{.Names}}: {{.Status}}'", {
      encoding: "utf8",
      timeout: 5000,
    }).trim();
    if (docker) {
      lines.push(`\n🐳 *Docker:*\n${docker}`);
    } else {
      lines.push("🐳 Docker: no containers");
    }
  } catch {
    lines.push("🐳 Docker: not available");
  }

  // PM2
  try {
    const pm2 = execSync("pm2 jlist 2>/dev/null", { encoding: "utf8", timeout: 5000 });
    const processes = JSON.parse(pm2);
    const pm2Lines = processes.map(
      (p: { name: string; pm2_env?: { status?: string; restart_time?: number } }) => `${p.name}: ${p.pm2_env?.status || "unknown"} (restarts: ${p.pm2_env?.restart_time || 0})`
    );
    lines.push(`\n⚙️ *PM2:*\n${pm2Lines.join("\n")}`);
  } catch {
    lines.push("⚙️ PM2: not available");
  }

  // Memory
  try {
    const mem = execSync("free -h | grep Mem", { encoding: "utf8" }).trim();
    const parts = mem.split(/\s+/);
    lines.push(`\n🧠 RAM: ${parts[2]} used / ${parts[1]} total`);
  } catch {
    lines.push("🧠 RAM: error checking");
  }

  // Uptime
  try {
    const uptime = execSync("uptime -p", { encoding: "utf8" }).trim();
    lines.push(`⏱️ Uptime: ${uptime}`);
  } catch {}

  return { handled: true, response: lines.join("\n") };
}

function handleMemory(): CommandResult {
  const memories = db
    .select()
    .from(userMemory)
    .where(eq(userMemory.isActive, true))
    .all();

  if (memories.length === 0) {
    return { handled: true, response: "Nie mam jeszcze żadnych zapamiętanych faktów." };
  }

  const lines = ["*Zapamiętane fakty:*\n"];
  const grouped: Record<string, typeof memories> = {};

  for (const mem of memories) {
    if (!grouped[mem.category]) grouped[mem.category] = [];
    grouped[mem.category].push(mem);
  }

  for (const [category, items] of Object.entries(grouped)) {
    lines.push(`*${category}:*`);
    for (const item of items) {
      lines.push(`• ${item.key}: ${item.value}`);
    }
    lines.push("");
  }

  return { handled: true, response: lines.join("\n").trim() };
}

function handleForget(key: string): CommandResult {
  if (!key) return { handled: true, response: "Użycie: /forget <klucz>" };

  const existing = db
    .select()
    .from(userMemory)
    .where(eq(userMemory.key, key))
    .get();

  if (!existing) {
    return { handled: true, response: `Nie znalazłem klucza "${key}" w pamięci.` };
  }

  db.update(userMemory)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(userMemory.id, existing.id))
    .run();

  log.info(`Forgot memory: ${key}`);
  return { handled: true, response: `Zapomniałem: ${key}` };
}

function handleRemind(input: string): CommandResult {
  // Parse: /remind <text> za <number> <unit>
  const zaMatch = input.match(/^(.+?)\s+za\s+(\d+)\s*(min(?:ut[ęy]?)?|godz(?:in[ęy]?)?|h|sekund[ęy]?|s|dni|dzień|d)\s*$/i);

  if (!zaMatch) {
    return {
      handled: true,
      response: "Użycie: /remind <tekst> za <liczba> <min/godz/dni>\nNp: /remind spotkanie za 30 min",
    };
  }

  const text = zaMatch[1].trim();
  const amount = parseInt(zaMatch[2]);
  const unitRaw = zaMatch[3].toLowerCase();

  let ms: number;
  if (unitRaw.startsWith("min") || unitRaw === "m") {
    ms = amount * 60_000;
  } else if (unitRaw.startsWith("godz") || unitRaw === "h") {
    ms = amount * 3_600_000;
  } else if (unitRaw.startsWith("sekund") || unitRaw === "s") {
    ms = amount * 1_000;
  } else if (unitRaw.startsWith("dn") || unitRaw.startsWith("dzie") || unitRaw === "d") {
    ms = amount * 86_400_000;
  } else {
    ms = amount * 60_000; // default minutes
  }

  const dueAt = new Date(Date.now() + ms);

  db.insert(reminders)
    .values({
      text,
      dueAt,
      status: "pending",
      createdAt: new Date(),
    })
    .run();

  const timeStr = dueAt.toLocaleTimeString("pl-PL", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Warsaw",
  });

  log.info(`Reminder set: "${text}" at ${dueAt.toISOString()}`);
  return {
    handled: true,
    response: `⏰ Przypomnienie ustawione: "${text}" o ${timeStr}`,
  };
}

function handleClear(): CommandResult {
  const hadSession = getSessionId() !== null;
  clearSession();
  return {
    handled: true,
    response: hadSession
      ? "Sesja wyczyszczona. Następna wiadomość zacznie nową rozmowę."
      : "Brak aktywnej sesji. Następna wiadomość zacznie nową rozmowę.",
  };
}

function handleApproveOutbound(idStr: string): CommandResult {
  // If no ID given, approve the latest pending
  const msg = idStr
    ? db.select().from(outboundMessages).where(eq(outboundMessages.id, Number(idStr))).get()
    : db.select().from(outboundMessages).where(eq(outboundMessages.status, "pending_approval")).orderBy(outboundMessages.id).limit(1).get();

  if (!msg) return { handled: true, response: "Nie znaleziono wiadomości do wysłania." };
  if (msg.status !== "pending_approval") return { handled: true, response: `Wiadomość #${msg.id} już obsłużona (${msg.status}).` };

  db.update(outboundMessages)
    .set({ status: "approved", approvedAt: new Date() })
    .where(eq(outboundMessages.id, msg.id))
    .run();

  log.action(`Outbound #${msg.id} approved -> ${msg.targetPhone}`);
  return { handled: true, response: `✅ Zatwierdzono wysłanie do ${msg.targetPhone}.` };
}

function handleRejectOutbound(idStr: string): CommandResult {
  const msg = idStr
    ? db.select().from(outboundMessages).where(eq(outboundMessages.id, Number(idStr))).get()
    : db.select().from(outboundMessages).where(eq(outboundMessages.status, "pending_approval")).orderBy(outboundMessages.id).limit(1).get();

  if (!msg) return { handled: true, response: "Nie znaleziono wiadomości do odrzucenia." };
  if (msg.status !== "pending_approval") return { handled: true, response: `Wiadomość #${msg.id} już obsłużona (${msg.status}).` };

  db.update(outboundMessages)
    .set({ status: "rejected" })
    .where(eq(outboundMessages.id, msg.id))
    .run();

  log.action(`Outbound #${msg.id} rejected`);
  return { handled: true, response: `❌ Odrzucono wiadomość do ${msg.targetPhone}.` };
}
