import { z } from "zod"

import { recordBaseSchema } from "@/registry/lib/api"

import { COMPANIES } from "@/fixtures"
import { TRASH_CARD_SKU } from "@/mocks/resources"

/** Товари демо для сторінки імпорту й експорту (ADR-0049): по одному полю кожного типу. */
export const PRODUCT_CATEGORIES = ["goods", "service"] as const

export const productSchema = recordBaseSchema.extend({
  /** Товар компанії; без неї — спільний, його змінює лише адміністратор платформи (ADR-0036). */
  companyId: z.string().nullable().optional(),
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

/**
 * Товари компанії в кошику демо: видалені стільки днів тому, сервер тримає 30 днів. «Набір чашок, стара
 * картка» має артикул SKU-002, який уже зайняв інший товар: відновлення відповідає 409.
 */
const TRASHED_PRODUCTS = [
  ["product-7", "SKU-007", "Фільтри для кави", 120, 1],
  ["product-8", "SKU-009", "Термокухоль", 650, 6],
  ["product-9", "SKU-002", "Набір чашок, стара картка", 790, 20],
  ["product-10", "SKU-008", "Підставка для чайника", 240, 28],
] as const

export const TRASHED_PRODUCT_SEEDS = TRASHED_PRODUCTS.map(
  ([id, , , , daysAgo]) => ({ id, daysAgo }),
)

/** Товари демо, товар компанії для картки й ті, що лежать у кошику з першого запиту (`TRASHED_PRODUCT_SEEDS`). */
export function makeProductsWithTrash(): Product[] {
  const companyId = COMPANIES[0].id
  return [
    ...makeProducts(),
    ...[
      ["product-6", TRASH_CARD_SKU, "Кавомолка", 1900],
      ...TRASHED_PRODUCTS,
    ].map(([id, sku, name, price]) =>
      productSchema.parse({
        id,
        version: 1,
        sku,
        name,
        price,
        category: "goods",
        active: true,
        companyId,
      }),
    ),
  ]
}
