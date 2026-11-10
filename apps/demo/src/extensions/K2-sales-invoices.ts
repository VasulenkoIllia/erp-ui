import type {
  InvoiceDocumentExtension,
  InvoicesExtension,
} from "@/registry/modules/K2-invoices"

import { invoicesMockExtension } from "./K2-sales-invoices-fields"

/**
 * Розширення модуля K2 «Рахунки клієнтам» під клієнта (ADR-0020, ADR-0025) — так виглядає файл проекту
 * `src/extensions/K2-invoices.ts` (у демо — інша назва: `K2-invoices.ts` тут належить рахункам сторінки
 * «Дані й моки»). Файли модуля для цього не змінювались: поле «Договір» — колонка після клієнта, поле
 * шапки картки й поле форми після «Сплатити до». Рахунок із замовлення бере значення поля з тим самим
 * ключем, якщо воно є в замовленні (ADR-0070).
 */
const invoices: InvoiceDocumentExtension = {
  ...invoicesMockExtension.invoices,
  columns: {
    add: [
      {
        id: "contract",
        place: { after: "client" },
        minWidth: 10,
        priority: 7,
        overflow: "hide",
      },
    ],
  },
  recordFields: { add: [{ id: "contract", place: { after: "dueDate" } }] },
  form: { add: [{ id: "contract", place: { after: "dueDate" } }] },
}

export const invoicesExtension: InvoicesExtension = { invoices }
