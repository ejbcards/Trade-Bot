import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const botLogsTable = pgTable("bot_logs", {
  id: serial("id").primaryKey(),
  level: text("level").notNull().default("info"),
  message: text("message").notNull(),
  symbol: text("symbol"),
  action: text("action"),
  details: text("details"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertBotLogSchema = createInsertSchema(botLogsTable).omit({ id: true, createdAt: true });
export type InsertBotLog = z.infer<typeof insertBotLogSchema>;
export type BotLog = typeof botLogsTable.$inferSelect;
