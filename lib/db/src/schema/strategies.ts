import { pgTable, text, serial, timestamp, boolean, numeric, integer, json } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { brokersTable } from "./brokers";

export const strategiesTable = pgTable("strategies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  brokerId: integer("broker_id").references(() => brokersTable.id, { onDelete: "set null" }),
  assetType: text("asset_type").notNull().default("stocks"),
  symbols: json("symbols").$type<string[]>().notNull().default([]),
  isActive: boolean("is_active").notNull().default(true),
  maxPositionSize: numeric("max_position_size", { precision: 18, scale: 4 }).notNull().default("1000"),
  maxDailyLoss: numeric("max_daily_loss", { precision: 18, scale: 4 }).notNull().default("500"),
  stopLossPercent: numeric("stop_loss_percent", { precision: 8, scale: 4 }).notNull().default("2"),
  takeProfitPercent: numeric("take_profit_percent", { precision: 8, scale: 4 }).notNull().default("5"),
  rollingStopPercent: numeric("rolling_stop_percent", { precision: 8, scale: 4 }).notNull().default("20"),
  aiEnabled: boolean("ai_enabled").notNull().default(true),
  aiModel: text("ai_model"),
  aiSignalThreshold: numeric("ai_signal_threshold", { precision: 5, scale: 4 }).notNull().default("0.7"),
  rsiOverbought: numeric("rsi_overbought", { precision: 6, scale: 2 }),
  rsiOversold: numeric("rsi_oversold", { precision: 6, scale: 2 }),
  maFastPeriod: integer("ma_fast_period"),
  maSlowPeriod: integer("ma_slow_period"),
  vixPriceThreshold: numeric("vix_price_threshold", { precision: 8, scale: 2 }).notNull().default("23"),
  vixChangeThreshold: numeric("vix_change_threshold", { precision: 8, scale: 2 }).notNull().default("2"),
  vixStopClampPercent: numeric("vix_stop_clamp_percent", { precision: 8, scale: 2 }).notNull().default("15"),
  tradeCount: integer("trade_count").notNull().default(0),
  winRate: numeric("win_rate", { precision: 5, scale: 4 }),
  totalPnl: numeric("total_pnl", { precision: 18, scale: 4 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertStrategySchema = createInsertSchema(strategiesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertStrategy = z.infer<typeof insertStrategySchema>;
export type Strategy = typeof strategiesTable.$inferSelect;
