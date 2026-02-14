export const silentLogger = {
  info: () => {},
  warn: () => {},
  error: (...args: unknown[]) => console.error("[BAILEYS]", ...args),
  debug: () => {},
  trace: () => {},
  fatal: (...args: unknown[]) => console.error("[BAILEYS FATAL]", ...args),
  child: () => silentLogger,
  level: "silent",
} as any;
