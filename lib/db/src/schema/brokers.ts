import { pgTable, text, serial, timestamp, boolean, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const brokersTable = pgTable("brokers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  brokerType: text("broker_type").notNull(),
  apiKey: text("api_key"),
  apiSecret: text("api_secret"),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  accountId: text("account_id"),
  accountValue: numeric("account_value", { precision: 18, scale: 4 }),
  buyingPower: numeric("buying_power", { precision: 18, scale: 4 }),
  status: text("status").notNull().default("disconnected"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertBrokerSchema = createInsertSchema(brokersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBroker = z.infer<typeof insertBrokerSchema>;
export type Broker = typeof brokersTable.$inferSelect;
