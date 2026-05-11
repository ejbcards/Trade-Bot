import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const dailyRecaps = pgTable("daily_recaps", {
  id: serial("id").primaryKey(),
  date: text("date").notNull().unique(),
  content: text("content").notNull(),
  generatedAt: timestamp("generated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type DailyRecap = typeof dailyRecaps.$inferSelect;
