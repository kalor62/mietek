import { desc, eq, and, gt, inArray } from "drizzle-orm";
import { db } from "../lib/db.js";
import { alertHistory, pendingSummaryItems } from "../lib/schema.js";
import { config } from "../lib/config.js";
import { createLogger } from "../lib/logger.js";
import type { CheckResult } from "./checks.js";

const log = createLogger("heartbeat");

// Cooldowns per alert type (in ms)
const COOLDOWNS: Record<string, number> = {
  docker: 30 * 60_000,   // 30 min
  disk: 60 * 60_000,     // 1 hour
  pm2: 5 * 60_000,       // 5 min
  reminder: 0,           // No cooldown
};

export function isQuietHours(): boolean {
  const hour = new Date().getHours();
  if (config.quietHourStart > config.quietHourEnd) {
    // Wraps midnight (e.g., 23-7)
    return hour >= config.quietHourStart || hour < config.quietHourEnd;
  }
  return hour >= config.quietHourStart && hour < config.quietHourEnd;
}

export function shouldSendAlert(check: CheckResult): boolean {
  const cooldownMs = COOLDOWNS[check.type] ?? 30 * 60_000;

  if (cooldownMs === 0) return true;

  const cutoff = new Date(Date.now() - cooldownMs);

  const recent = db
    .select()
    .from(alertHistory)
    .where(
      and(
        eq(alertHistory.dedupKey, check.dedupKey),
        gt(alertHistory.sentAt, cutoff)
      )
    )
    .get();

  return !recent;
}

export function recordAlert(check: CheckResult): void {
  db.insert(alertHistory)
    .values({
      dedupKey: check.dedupKey,
      type: check.type,
      severity: check.severity,
      message: check.message,
      sentAt: new Date(),
    })
    .run();
}

export function queueForSummary(check: CheckResult): void {
  db.insert(pendingSummaryItems)
    .values({
      type: check.type,
      message: check.message,
      createdAt: new Date(),
    })
    .run();
  log.info(`Queued for morning summary: ${check.dedupKey}`);
}

export function getPendingSummaryItems(): { type: string; message: string }[] {
  const items = db.select().from(pendingSummaryItems).all();

  // Delete only the specific IDs we read to avoid race condition
  if (items.length > 0) {
    const ids = items.map((item) => item.id);
    db.delete(pendingSummaryItems)
      .where(inArray(pendingSummaryItems.id, ids))
      .run();
  }

  return items;
}
