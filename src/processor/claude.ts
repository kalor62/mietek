import { execFileSync } from "child_process";
import { randomUUID } from "crypto";
import { existsSync } from "fs";
import { desc, eq, isNotNull } from "drizzle-orm";
import { config } from "../lib/config.js";
import { db } from "../lib/db.js";
import { messageQueue } from "../lib/schema.js";
import { createLogger } from "../lib/logger.js";

const log = createLogger("processor");

export interface ClaudeResult {
  success: boolean;
  response: string;
  sessionId?: string;
  error?: string;
  retryWithFullContext?: boolean;
}

// Active session - persists across messages, reset by /clear or new day
let currentSessionId: string | null = null;

export function getSessionId(): string | null {
  return currentSessionId;
}

export function clearSession(): void {
  currentSessionId = null;
  log.action("Session cleared");
}

export function resumeLastSession(): void {
  const last = db
    .select({ sessionId: messageQueue.sessionId, createdAt: messageQueue.createdAt })
    .from(messageQueue)
    .where(isNotNull(messageQueue.sessionId))
    .orderBy(desc(messageQueue.id))
    .limit(1)
    .get();

  if (last?.sessionId) {
    // Don't resume sessions older than 1 hour
    const oneHourMs = 60 * 60 * 1000;
    const messageAge = last.createdAt ? Date.now() - new Date(last.createdAt).getTime() : Infinity;
    if (messageAge > oneHourMs) {
      log.info(`Last session ${last.sessionId.slice(0, 8)} is stale (${Math.round(messageAge / 60000)}min old), starting fresh`);
      return;
    }
    currentSessionId = last.sessionId;
    log.action(`Resumed previous session: ${currentSessionId.slice(0, 8)}`);
  } else {
    log.info("No previous session found, starting fresh");
  }
}

export function invokeClaude(
  prompt: string,
  options: { sudo?: boolean; forceNewSession?: boolean; oneShot?: boolean } = {}
): ClaudeResult {
  const { sudo = false, forceNewSession = false, oneShot = false } = options;

  const isResume = !oneShot && currentSessionId !== null && !forceNewSession;

  const args: string[] = [];
  let sessionIdForThisCall: string | null = null;

  if (oneShot) {
    // One-shot: fresh session UUID, does NOT touch currentSessionId
    sessionIdForThisCall = randomUUID();
    args.push("-p", prompt, "--session-id", sessionIdForThisCall);
  } else if (isResume) {
    // Resume existing session - just send the new message
    sessionIdForThisCall = currentSessionId;
    args.push("-p", prompt, "--resume", currentSessionId!);
  } else {
    // New session - generate UUID, full context prompt
    currentSessionId = randomUUID();
    sessionIdForThisCall = currentSessionId;
    args.push("-p", prompt, "--session-id", currentSessionId);
  }

  args.push("--max-turns", String(config.maxTurns));
  args.push("--output-format", "text");
  args.push("--dangerously-skip-permissions");

  if (existsSync(config.mcpConfigPath)) {
    args.push("--mcp-config", config.mcpConfigPath);
  }

  if (!sudo) {
    args.push("--allowedTools", "Read,Glob,Grep,WebSearch,WebFetch,mcp__*");
  }

  log.info(
    `Invoking claude -p (resume=${isResume}, oneShot=${oneShot}, session=${sessionIdForThisCall?.slice(0, 8)}, sudo=${sudo}, prompt=${prompt.length} chars)`
  );

  try {
    const env = { ...process.env };
    delete env.CLAUDECODE;

    const result = execFileSync("claude", args, {
      cwd: process.cwd(),
      timeout: config.claudeTimeout,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "inherit"],
      env,
    });

    const response = result?.trim() || "(no response)";
    log.info(`Claude responded (${response.length} chars, session=${sessionIdForThisCall?.slice(0, 8)})`);

    return { success: true, response, sessionId: sessionIdForThisCall! };
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string; message?: string };
    const errMsg =
      err.stderr?.trim().slice(-500) ||
      err.stdout?.trim().slice(-500) ||
      err.message ||
      "unknown error";

    log.error(`Claude invocation failed: ${errMsg}`);

    // If resume failed, signal caller to retry with full context
    if (isResume && !forceNewSession) {
      log.warn("Resume failed, signaling retry with full context");
      currentSessionId = null;
      return {
        success: false,
        response: "",
        error: errMsg,
        retryWithFullContext: true,
      };
    }

    return {
      success: false,
      response: `Przepraszam, wystąpił błąd: ${errMsg.slice(0, 200)}`,
      error: errMsg,
    };
  }
}
