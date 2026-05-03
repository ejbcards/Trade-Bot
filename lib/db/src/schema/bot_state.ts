import { pgTable, text, serial, timestamp, boolean, integer, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const botStateTable = pgTable("bot_state", {
  id: serial("id").primaryKey(),
  isRunning: boolean("is_running").notNull().default(false),
  startedAt: timestamp("started_at", { withTimezone: true }),
  activeStrategyId: integer("active_strategy_id"),
  activeBrokerId: integer("active_broker_id"),
  tradesExecutedToday: integer("trades_executed_today").notNull().default(0),
  dailyPnl: numeric("daily_pnl", { precision: 18, scale: 4 }).notNull().default("0"),
  lastHeartbeat: timestamp("last_heartbeat", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertBotStateSchema = createInsertSchema(botStateTable).omit({ id: true });
export type InsertBotState = z.infer<typeof insertBotStateSchema>;
export type BotState = typeof botStateTable.$inferSelect;
