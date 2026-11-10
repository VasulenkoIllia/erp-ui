import type { InvoicesMockExtension } from "@/registry/modules/K2-invoices"

/**
 * Дані розширення модуля K2 «Рахунки клієнтам» без компонентів (розширення — `K2-sales-invoices.ts`):
 * нове поле «Договір». Окремим файлом: моки беруть лише його, а не компоненти слотів. Файли
 * `K2-invoices*.ts` — розширення рахунків сторінки «Дані й моки», іншого ресурсу (`invoices`).
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
  },
} satisfies InvoicesMockExtension
