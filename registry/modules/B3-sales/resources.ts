/**
 * Ресурси модуля B3 без схем: їх бере точка входу (`index.ts`) для прав, журналу аудиту, токенів API
 * й панелі розробника, не тягнучи zod і схеми контракту в перший екран застосунку.
 */
import type { ModuleResourceWithActions } from "@/lib/module"

export const QUOTES = "quotes"
export const ORDERS = "orders"
/**
 * Ресурс рахунків модуля K2 (ADR-0070): дія замовлення «Виставити рахунок» створює документ у ньому.
 * Модуль K2 не імпортується — лише назва ресурсу.
 */
export const SALES_INVOICES = "sales-invoices"

/**
 * Дії права `<ресурс>:<дія>`: читання, зміна, видалення чернетки й дії графа переходів модуля
 * (ADR-0057, ADR-0066); масова дія — те саме право.
 */
export type SalesResource = ModuleResourceWithActions

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
      // «Виставити рахунок» з підтвердженого чи виконаного (ADR-0070): ще й `sales-invoices:create`.
      "invoice",
      "cancel",
      "amend",
    ],
  },
]
