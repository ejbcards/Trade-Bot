import { pgTable, text, serial, timestamp, boolean, numeric, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { strategiesTable } from "./strategies";

export const decisionRulesTable = pgTable("decision_rules", {
  id: serial("id").primaryKey(),
  strategyId: integer("strategy_id").notNull().references(() => strategiesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  priority: integer("priority").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),

  // Chart Technical Analysis conditions
  candlestickPattern: text("candlestick_pattern"),
  timeFrame: text("time_frame"),
  volumeIncreaseLevel: text("volume_increase_level"),

  // Classic indicator conditions
  rsiMin: numeric("rsi_min", { precision: 6, scale: 2 }),
  rsiMax: numeric("rsi_max", { precision: 6, scale: 2 }),
  maCondition: text("ma_condition"),
  volumeCondition: text("volume_condition"),
  trendCondition: text("trend_condition"),
  aiSignal: text("ai_signal"),
  aiConfidenceMin: numeric("ai_confidence_min", { precision: 5, scale: 4 }),
  priceChangeMin: numeric("price_change_min", { precision: 8, scale: 4 }),
  priceChangeMax: numeric("price_change_max", { precision: 8, scale: 4 }),

  // Action
  action: text("action").notNull(),
  quantityMultiplier: numeric("quantity_multiplier", { precision: 5, scale: 4 }).notNull().default("1"),
  notes: text("notes"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertDecisionRuleSchema = createInsertSchema(decisionRulesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDecisionRule = z.infer<typeof insertDecisionRuleSchema>;
export type DecisionRule = typeof decisionRulesTable.$inferSelect;
