import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const userAccessTable = pgTable("user_access", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().unique(),
  grantType: text("grant_type").notNull(),
  keyUsed: text("key_used"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertUserAccessSchema = createInsertSchema(userAccessTable).omit({ id: true, createdAt: true });
export type InsertUserAccess = z.infer<typeof insertUserAccessSchema>;
export type UserAccess = typeof userAccessTable.$inferSelect;
