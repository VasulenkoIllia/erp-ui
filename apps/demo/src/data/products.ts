import { z } from "zod"

import { recordBaseSchema } from "@/registry/lib/api"

/** Товари демо для сторінки імпорту й експорту (ADR-0049): по одному полю кожного типу. */
export const PRODUCT_CATEGORIES = ["goods", "service"] as const

export const productSchema = recordBaseSchema.extend({
  sku: z.string().min(1),
  name: z.string().min(1),
  price: z.number().min(0),
  stock: z.number().int().min(0).optional(),
  category: z.enum(PRODUCT_CATEGORIES).optional(),
  active: z.boolean().optional(),
  released: z.string().optional(),
})
export type Product = z.infer<typeof productSchema>

export function makeProducts(): Product[] {
  return [
    ["SKU-001", "Кавоварка", 4200, 12, "goods", true, "2026-02-10"],
    ["SKU-002", "Набір чашок", 860, 40, "goods", true, "2026-03-01"],
    ["SKU-003", "Чайник", 1350, 0, "goods", false, "2025-11-20"],
    ["SKU-004", "Доставка", 150, undefined, "service", true, undefined],
    ["SKU-005", "Встановлення", 900, undefined, "service", true, undefined],
  ].map(([sku, name, price, stock, category, active, released], index) =>
    productSchema.parse({
      id: `product-${index + 1}`,
      version: 1,
      sku,
      name,
      price,
      stock,
      category,
      active,
      released,
    }),
  )
}
