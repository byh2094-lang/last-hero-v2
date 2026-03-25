import { pgTable, text, serial, timestamp, integer, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { sellersTable } from "./sellers";

export const bagTypeEnum = pgEnum("bag_type", ["free", "paid"]);
export const bagStatusEnum = pgEnum("bag_status", ["active", "closed", "soldout"]);

export const bagsTable = pgTable("bags", {
  id: serial("id").primaryKey(),
  sellerId: integer("seller_id").notNull().references(() => sellersTable.id),
  type: bagTypeEnum("type").notNull(),
  originalPrice: integer("original_price").notNull().default(0),
  price: integer("price").notNull().default(0),
  quantity: integer("quantity").notNull(),
  remainingQuantity: integer("remaining_quantity").notNull(),
  closingTime: timestamp("closing_time").notNull(),
  status: bagStatusEnum("status").notNull().default("active"),
  category: text("category"),
  description: text("description"),
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertBagSchema = createInsertSchema(bagsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBag = z.infer<typeof insertBagSchema>;
export type Bag = typeof bagsTable.$inferSelect;
