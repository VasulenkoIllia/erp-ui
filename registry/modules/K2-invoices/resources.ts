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

/**
 * Кредит-ноти клієнтам (ADR-0072): окремий документ на підставі виставленого рахунку, свій номер і список.
 * `sales-credit-notes`, бо кредит-ноти постачальників (K3) — інший ресурс.
 */
export const CREDIT_NOTES = "sales-credit-notes"

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
      "creditNote",
    ],
  },
  {
    name: CREDIT_NOTES,
    label: { uk: "Кредит-ноти", en: "Credit notes" },
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
