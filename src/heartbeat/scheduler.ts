import { readFileSync, writeFileSync } from "fs";
import { eq, lte } from "drizzle-orm";
import { db } from "../lib/db.js";
import { messageQueue, reminders } from "../lib/schema.js";
import { config } from "../lib/config.js";
import { createLogger } from "../lib/logger.js";
import { checkDocker, checkDisk, checkPM2 } from "./checks.js";
import { isQuietHours, shouldSendAlert, recordAlert, queueForSummary } from "./notifier.js";
import { buildDailySummary } from "./daily-summary.js";

const LAST_DAILY_SUMMARY_PATH = "data/last-daily-summary.txt";

const log = createLogger("heartbeat");

interface ScheduledCheck {
  name: string;
  intervalMs: number;
  lastRun: number;
  fn: () => void;
}

export function createScheduler(): { run: () => void } {
  let lastDailySummary = "";
  try {
    lastDailySummary = readFileSync(LAST_DAILY_SUMMARY_PATH, "utf8").trim();
  } catch {
    // File doesn't exist yet, will be created on first summary
  }

  const checks: ScheduledCheck[] = [
    {
      name: "docker",
      intervalMs: 5 * 60_000, // 5 min
      lastRun: 0,
      fn: () => runChecks(checkDocker()),
    },
    {
      name: "disk",
      intervalMs: 30 * 60_000, // 30 min
      lastRun: 0,
      fn: () => runChecks(checkDisk()),
    },
    {
      name: "pm2",
      intervalMs: 5 * 60_000, // 5 min
      lastRun: 0,
      fn: () => runChecks(checkPM2()),
    },
    {
      name: "reminders",
      intervalMs: 60_000, // 1 min
      lastRun: 0,
      fn: checkReminders,
    },
    {
      name: "daily_summary",
      intervalMs: 60_000, // Check every minute (triggers once at 8:00)
      lastRun: 0,
      fn: () => {
        const now = new Date();
        const today = now.toISOString().slice(0, 10);
        const hour = now.getHours();
        const minute = now.getMinutes();

        // Send daily summary at 8:00
        if (hour === 8 && minute < 2 && lastDailySummary !== today) {
          lastDailySummary = today;
          writeFileSync(LAST_DAILY_SUMMARY_PATH, today);
          log.action("Generating daily summary");

          const summary = buildDailySummary();
          enqueueMessage(summary);
        }
      },
    },
  ];

  function run() {
    const now = Date.now();

    for (const check of checks) {
      if (now - check.lastRun >= check.intervalMs) {
        check.lastRun = now;
        try {
          check.fn();
        } catch (err) {
          log.error(`Check ${check.name} failed: ${err}`);
        }
      }
    }
  }

  return { run };
}

function runChecks(results: import("./checks.js").CheckResult[]): void {
  for (const check of results) {
    if (isQuietHours() && check.severity !== "critical") {
      queueForSummary(check);
      continue;
    }

    if (shouldSendAlert(check)) {
      recordAlert(check);
      enqueueMessage(check.message);
      log.action(`Alert sent: ${check.dedupKey}`);
    }
  }
}

function checkReminders(): void {
  const now = new Date();
  const dueReminders = db
    .select()
    .from(reminders)
    .where(eq(reminders.status, "pending"))
    .all()
    .filter((r) => r.dueAt <= now);

  for (const reminder of dueReminders) {
    enqueueMessage(`⏰ Przypomnienie: ${reminder.text}`);

    if (reminder.recurrence) {
      // Reschedule recurring reminders
      const nextDue = calculateNextDue(reminder.dueAt, reminder.recurrence);
      db.update(reminders)
        .set({ dueAt: nextDue })
        .where(eq(reminders.id, reminder.id))
        .run();
      log.info(`Recurring reminder rescheduled: ${reminder.text}`);
    } else {
      db.update(reminders)
        .set({ status: "sent" })
        .where(eq(reminders.id, reminder.id))
        .run();
    }

    log.action(`Reminder fired: ${reminder.text}`);
  }
}

function calculateNextDue(current: Date, recurrence: string): Date {
  const next = new Date(current);

  if (recurrence === "daily") {
    next.setDate(next.getDate() + 1);
  } else if (recurrence === "weekly") {
    next.setDate(next.getDate() + 7);
  } else {
    log.warn(`Unknown recurrence value "${recurrence}", defaulting to daily`);
    next.setDate(next.getDate() + 1);
  }

  return next;
}

function enqueueMessage(text: string): void {
  if (!config.ownerJid) {
    log.warn("No OWNER_JID set, cannot enqueue message");
    return;
  }

  db.insert(messageQueue)
    .values({
      waMessageId: `system-${Date.now()}`,
      senderJid: "system",
      text: "(system notification)",
      response: text,
      status: "completed",
      completedAt: new Date(),
      createdAt: new Date(),
    })
    .run();
}
