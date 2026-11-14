import type { InvoicesMockExtension } from "@/registry/modules/K2-invoices"

/**
 * Дані розширення модуля K2 «Рахунки клієнтам» без компонентів (розширення — `K2-sales-invoices.ts`):
 * нове поле «Договір» і поле рядка «Код УКТЗЕД» (ADR-0086). Окремим файлом: моки беруть лише поля, а не
 * компоненти слотів. Файли `K2-invoices*.ts` — розширення рахунків сторінки «Дані й моки», іншого ресурсу
 * (`invoices`).
 */
export const invoicesMockExtension = {
  invoices: {
    fields: [
      {
        id: "contract",
        type: "text",
        label: { uk: "Договір", en: "Contract" },
        mockValues: [
          "№ 12/2026 від 05.01.2026",
          "№ 7/2026 від 14.03.2026",
          null,
        ],
      },
    ],
    lineFields: [
      {
        id: "hsCode",
        type: "text",
        label: { uk: "Код УКТЗЕД", en: "HS code" },
        mockValues: ["8471 30 00 00", "8443 32 10 00", null],
      },
    ],
  },
} satisfies InvoicesMockExtension
