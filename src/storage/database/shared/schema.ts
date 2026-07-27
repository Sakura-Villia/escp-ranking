import { sql } from "drizzle-orm";
import { pgTable, varchar, timestamp, boolean, integer, jsonb, index, serial } from "drizzle-orm/pg-core";

export const healthCheck = pgTable("health_check", {
  id: serial().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

export const cpItems = pgTable(
  "cp_items",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    display_name: varchar("display_name", { length: 255 }).notNull(),
    is_combination: boolean("is_combination").notNull().default(false),
    groups: jsonb("groups"),
    total_joined_num: integer("total_joined_num").notNull().default(0),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("cp_items_total_joined_num_idx").on(table.total_joined_num),
    index("cp_items_display_name_idx").on(table.display_name),
  ]
);
