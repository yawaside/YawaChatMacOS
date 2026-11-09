import { integer, jsonb, pgTable, serial, text, timestamp, boolean } from "drizzle-orm/pg-core";

export const chatMessages = pgTable("chat_messages", {
  id: serial("id").primaryKey(),
  platform: text("platform").notNull(),
  author: text("author").notNull(),
  color: text("color").notNull().default("#FFFFFF"),
  text: text("text").notNull(),
  kind: text("kind").notNull().default("message"),
  badges: jsonb("badges").$type<string[]>().notNull().default([]),
  amount: integer("amount"),
  currency: text("currency"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const channels = pgTable("channels", {
  id: serial("id").primaryKey(),
  platform: text("platform").notNull(),
  name: text("name").notNull(),
  live: boolean("live").notNull().default(false),
  viewers: integer("viewers").notNull().default(0),
  enabled: boolean("enabled").notNull().default(true),
});

/** Загруженные пользователем звуки (base64-dataURL). scope: alert — оповещения, reward — награды. */
export const customSounds = pgTable("custom_sounds", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  scope: text("scope").notNull().default("alert"),
  data: text("data").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});
