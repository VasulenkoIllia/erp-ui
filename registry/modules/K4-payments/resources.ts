/**
 * Ресурси модуля K4 без схем: їх бере точка входу (`index.ts`) для прав, журналу аудиту, токенів API
 * й панелі розробника, не тягнучи zod і схеми контракту в перший екран застосунку.
 */
import type { LocalizedText } from "@/lib/auth"

/**
 * Оплати клієнтів за рахунками (ADR-0073). `sales-payments`, бо оплати постачальникам (K3) — інший
 * ресурс.
 */
export const PAYMENTS = "sales-payments"

export interface PaymentsResource {
  readonly name: string
  readonly label: LocalizedText
  /**
   * Дії права `<ресурс>:<дія>`: читання, реєстрація оплати й дії графа (ADR-0057). Оплату не змінюють і
   * не видаляють: вона одразу проведена.
   */
  readonly actions: readonly string[]
}

export const PAYMENTS_RESOURCES: readonly PaymentsResource[] = [
  {
    name: PAYMENTS,
    label: { uk: "Оплати", en: "Payments" },
    actions: ["read", "create", "cancel", "reverse"],
  },
]
