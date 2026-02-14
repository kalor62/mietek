import { desc, gte } from "drizzle-orm";
import { db } from "../lib/db.js";
import { messageQueue } from "../lib/schema.js";
import { getSystemSummary } from "./checks.js";
import { getPendingSummaryItems } from "./notifier.js";
import { t, r } from "../lib/i18n.js";

export function buildDailySummary(): string {
  const parts: string[] = [];
  const lang = t();

  // System status
  parts.push(`${r(lang.goodMorning)}\n`);
  parts.push(lang.systemStatus);
  parts.push(getSystemSummary());

  // Overnight alerts
  const overnightItems = getPendingSummaryItems();
  if (overnightItems.length > 0) {
    parts.push(`\n${lang.overnightAlerts}`);
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

  parts.push(`\n${lang.yesterdayActivity}`);
  parts.push(lang.messagesProcessed(recentMessages.length));

  // Date
  const today = new Date().toLocaleDateString(lang.dateLocale, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: lang.timezone,
  });
  parts.push(`\n📅 ${today}`);

  return parts.join("\n");
}
