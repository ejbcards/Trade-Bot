import { pgTable, text, serial, timestamp, numeric, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { brokersTable } from "./brokers";
import { strategiesTable } from "./strategies";

export const tradesTable = pgTable("trades", {
  id: serial("id").primaryKey(),
  brokerId: integer("broker_id").notNull().references(() => brokersTable.id, { onDelete: "cascade" }),
  strategyId: integer("strategy_id").references(() => strategiesTable.id, { onDelete: "set null" }),
  symbol: text("symbol").notNull(),
  assetType: text("asset_type").notNull().default("stocks"),
  side: text("side").notNull(),
  quantity: numeric("quantity", { precision: 18, scale: 8 }).notNull(),
  entryPrice: numeric("entry_price", { precision: 18, scale: 4 }).notNull(),
  exitPrice: numeric("exit_price", { precision: 18, scale: 4 }),
  realizedPnl: numeric("realized_pnl", { precision: 18, scale: 4 }),
  realizedPnlPercent: numeric("realized_pnl_percent", { precision: 8, scale: 4 }),
  status: text("status").notNull().default("open"),
  optionType: text("option_type"),
  contractSymbol: text("contract_symbol"),
  strike: numeric("strike", { precision: 18, scale: 4 }),
  expiry: timestamp("expiry", { withTimezone: true }),
  aiSignal: text("ai_signal"),
  aiConfidence: numeric("ai_confidence", { precision: 5, scale: 4 }),
  notes: text("notes"),
  openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertTradeSchema = createInsertSchema(tradesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTrade = z.infer<typeof insertTradeSchema>;
export type Trade = typeof tradesTable.$inferSelect;
