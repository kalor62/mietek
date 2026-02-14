import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const messageQueue = sqliteTable("message_queue", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  waMessageId: text("wa_message_id").notNull(),
  senderJid: text("sender_jid").notNull(),
  text: text("text").notNull(),
  response: text("response"),
  status: text("status").notNull().default("pending"), // pending | processing | completed | failed
  sessionId: text("session_id"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  completedAt: integer("completed_at", { mode: "timestamp" }),
  sentAt: integer("sent_at", { mode: "timestamp" }),
});

export const userMemory = sqliteTable("user_memory", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  category: text("category").notNull().default("fact"), // preference | fact | project | person
  key: text("key").notNull(),
  value: text("value").notNull(),
  source: text("source").notNull().default("explicit"), // explicit | inferred
  isActive: integer("is_active", { mode: "boolean" }).default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

export const activeSessions = sqliteTable("active_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  senderJid: text("sender_jid").notNull(),
  sessionId: text("session_id").notNull(),
  topic: text("topic"),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
});

export const reminders = sqliteTable("reminders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  text: text("text").notNull(),
  dueAt: integer("due_at", { mode: "timestamp" }).notNull(),
  recurrence: text("recurrence"), // daily | weekly | cron expression
  status: text("status").notNull().default("pending"), // pending | sent | cancelled
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

export const outboundMessages = sqliteTable("outbound_messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  targetPhone: text("target_phone").notNull(),
  message: text("message").notNull(),
  status: text("status").notNull().default("pending_approval"), // pending_approval | approved | rejected | sent
  sessionId: text("session_id"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  approvedAt: integer("approved_at", { mode: "timestamp" }),
  sentAt: integer("sent_at", { mode: "timestamp" }),
});

export const alertHistory = sqliteTable("alert_history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  dedupKey: text("dedup_key").notNull(),
  type: text("type").notNull(), // docker | disk | pm2 | reminder
  severity: text("severity").notNull().default("warning"), // info | warning | critical
  message: text("message").notNull(),
  sentAt: integer("sent_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

export const pendingSummaryItems = sqliteTable("pending_summary_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  type: text("type").notNull(),
  message: text("message").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

export const botLogs = sqliteTable("bot_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  level: text("level").notNull().default("info"), // info | warn | error | action
  source: text("source").notNull().default("system"), // bridge | processor | heartbeat | system
  message: text("message").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).$defaultFn(() => new Date()),
});

// Types
export type MessageQueue = typeof messageQueue.$inferSelect;
export type NewMessageQueue = typeof messageQueue.$inferInsert;
export type UserMemory = typeof userMemory.$inferSelect;
export type ActiveSession = typeof activeSessions.$inferSelect;
export type Reminder = typeof reminders.$inferSelect;
export type OutboundMessage = typeof outboundMessages.$inferSelect;
export type AlertHistoryEntry = typeof alertHistory.$inferSelect;
export type BotLog = typeof botLogs.$inferSelect;
