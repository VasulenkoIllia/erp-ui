/**
 * Ресурси модуля K2 без схем: їх бере точка входу (`index.ts`) для прав, журналу аудиту, токенів API
 * й панелі розробника, не тягнучи zod і схеми контракту в перший екран застосунку.
 */
import type { LocalizedText } from "@/lib/auth"

/**
 * Рахунки клієнтам (ADR-0070). `sales-invoices`, а не `invoices`: рахунки постачальників (K3) — інший
 * ресурс, а демо кіта вже має `invoices` стрес-сторінки «Дані й моки».
 */
export const INVOICES = "sales-invoices"

export interface InvoicesResource {
  readonly name: string
  readonly label: LocalizedText
  /**
   * Дії права `<ресурс>:<дія>`: читання, зміна, видалення чернетки й дії графа переходів модуля
   * (ADR-0057, ADR-0066); масова дія — те саме право.
   */
  readonly actions: readonly string[]
}

export const INVOICES_RESOURCES: readonly InvoicesResource[] = [
  {
    name: INVOICES,
    label: { uk: "Рахунки клієнтам", en: "Customer invoices" },
    actions: [
      "read",
      "create",
      "update",
      "delete",
      "submit",
      "cancel",
      "reverse",
      "amend",
    ],
  },
]
