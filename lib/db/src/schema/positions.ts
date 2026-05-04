import { pgTable, text, serial, timestamp, numeric, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { brokersTable } from "./brokers";
import { strategiesTable } from "./strategies";

export const positionsTable = pgTable("positions", {
  id: serial("id").primaryKey(),
  brokerId: integer("broker_id").notNull().references(() => brokersTable.id),
  strategyId: integer("strategy_id").references(() => strategiesTable.id),
  symbol: text("symbol").notNull(),
  assetType: text("asset_type").notNull().default("stocks"),
  side: text("side").notNull().default("long"),
  quantity: numeric("quantity", { precision: 18, scale: 8 }).notNull(),
  entryPrice: numeric("entry_price", { precision: 18, scale: 4 }).notNull(),
  currentPrice: numeric("current_price", { precision: 18, scale: 4 }),
  marketValue: numeric("market_value", { precision: 18, scale: 4 }),
  unrealizedPnl: numeric("unrealized_pnl", { precision: 18, scale: 4 }),
  unrealizedPnlPercent: numeric("unrealized_pnl_percent", { precision: 8, scale: 4 }),
  optionType: text("option_type"),
  contractSymbol: text("contract_symbol"),
  strike: numeric("strike", { precision: 18, scale: 4 }),
  expiry: timestamp("expiry", { withTimezone: true }),
  openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertPositionSchema = createInsertSchema(positionsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPosition = z.infer<typeof insertPositionSchema>;
export type Position = typeof positionsTable.$inferSelect;
