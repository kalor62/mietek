import { desc, gte } from "drizzle-orm";
import { db } from "../lib/db.js";
import { messageQueue } from "../lib/schema.js";
import { config } from "../lib/config.js";
import { getSystemSummary } from "./checks.js";
import { getPendingSummaryItems } from "./notifier.js";

export function buildDailySummary(): string {
  const parts: string[] = [];

  // System status
  parts.push(`☀️ *Dzień dobry ${config.ownerName}!*\n`);
  parts.push("*Status systemu:*");
  parts.push(getSystemSummary());

  // Overnight alerts
  const overnightItems = getPendingSummaryItems();
  if (overnightItems.length > 0) {
    parts.push("\n*Alerty z nocy:*");
    for (const item of overnightItems) {
      parts.push(`• ${item.message}`);
    }
  }

  // Yesterday's activity
  const yesterday = new Date(Date.now() - 86_400_000);
  const recentMessages = db
    .select()
    .from(messageQueue)
    .where(gte(messageQueue.createdAt, yesterday))
    .orderBy(desc(messageQueue.createdAt))
    .all();

  parts.push(`\n*Wczorajsza aktywność:*`);
  parts.push(`• ${recentMessages.length} wiadomości przetworzonych`);

  // Date
  const today = new Date().toLocaleDateString("pl-PL", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "Europe/Warsaw",
  });
  parts.push(`\n📅 ${today}`);

  return parts.join("\n");
}

