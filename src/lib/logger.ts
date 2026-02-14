import { sqlite } from "./db.js";

type LogLevel = "info" | "warn" | "error" | "action";
type LogSource = "bridge" | "processor" | "heartbeat" | "system";

export function createLogger(source: LogSource) {
  return {
    info: (msg: string) => log(msg, "info", source),
    warn: (msg: string) => log(msg, "warn", source),
    error: (msg: string) => log(msg, "error", source),
    action: (msg: string) => log(msg, "action", source),
  };
}

function log(message: string, level: LogLevel, source: LogSource): void {
  const ts = new Date().toLocaleTimeString("en-GB", { hour12: false });
  const prefix = `[${source.toUpperCase()} ${ts}]`;

  if (level === "error") {
    console.error(`${prefix} ${message}`);
  } else if (level === "warn") {
    console.warn(`${prefix} ${message}`);
  } else {
    console.log(`${prefix} ${message}`);
  }

  try {
    sqlite
      .prepare("INSERT INTO bot_logs (level, source, message, created_at) VALUES (?, ?, ?, ?)")
      .run(level, source, message, Date.now());
    sqlite
      .prepare("DELETE FROM bot_logs WHERE id NOT IN (SELECT id FROM bot_logs ORDER BY id DESC LIMIT 1000)")
      .run();
  } catch {
    // don't fail if log write fails
  }
}
