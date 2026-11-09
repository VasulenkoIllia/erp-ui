/**
 * Ресурси модуля B3 без схем: їх бере точка входу (`index.ts`) для прав, журналу аудиту, токенів API
 * й панелі розробника, не тягнучи zod і схеми контракту в перший екран застосунку.
 */
import type { LocalizedText } from "@/lib/auth"

export const QUOTES = "quotes"
export const ORDERS = "orders"

export interface SalesResource {
  readonly name: string
  readonly label: LocalizedText
  /**
   * Дії права `<ресурс>:<дія>`: читання, зміна, видалення чернетки й дії графа переходів модуля
   * (ADR-0057, ADR-0066); масова дія — те саме право.
   */
  readonly actions: readonly string[]
}

export const SALES_RESOURCES: readonly SalesResource[] = [
  {
    name: QUOTES,
    label: { uk: "Пропозиції", en: "Quotes" },
    actions: [
      "read",
      "create",
      "update",
      "delete",
      "submit",
      "accept",
      "decline",
      // «Створити замовлення» з прийнятої (ADR-0067): ще й `orders:create`.
      "order",
      "cancel",
      "amend",
    ],
  },
  {
    name: ORDERS,
    label: { uk: "Замовлення", en: "Orders" },
    actions: [
      "read",
      "create",
      "update",
      "delete",
      "submit",
      "complete",
      "cancel",
      "amend",
    ],
  },
]
