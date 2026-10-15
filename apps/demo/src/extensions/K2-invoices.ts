import type { InvoicesExtension } from "@/pages/invoice-extension"

import { invoiceFields } from "./K2-invoices-fields"
import { PaymentTerms, RemindAction } from "./K2-invoices-slots"

/**
 * Розширення рахунків під клієнта (ADR-0020) — так виглядає файл проекту
 * `src/extensions/<ID>-<назва>.ts`. Усе, чим клієнт відрізняється, — тут, у полях
 * (`K2-invoices-fields.ts`) і в компонентах слотів (`K2-invoices-slots.tsx`); файли рахунків
 * (модуль-приклад: `data/invoices.ts`, `pages/invoice-*`, сторінки) для цього не змінювались:
 * - нове поле «Менеджер» — схема, підписи й значення для моків;
 * - колонка «Менеджер» у списку після «Клієнт» (на вузькому екрані ховається першою);
 * - поле «Менеджер» у шапці картки й секція «Умови оплати» після рядків;
 * - дія «Нагадати клієнту» в шапці картки — лише з правом змінювати рахунки.
 * Підписи полів і секцій — даними (uk, en), тексти компонентів — у рядках проекту.
 */
export const invoicesExtension: InvoicesExtension = {
  fields: invoiceFields,
  columns: {
    add: [
      {
        id: "manager",
        place: { after: "client" },
        minWidth: 10,
        priority: 7,
        overflow: "hide",
      },
    ],
  },
  recordFields: { add: [{ id: "manager", place: { after: "client" } }] },
  sections: {
    add: [
      {
        id: "paymentTerms",
        title: { uk: "Умови оплати", en: "Payment terms" },
        component: PaymentTerms,
        place: { after: "lines" },
      },
    ],
  },
  actions: {
    add: [{ id: "remind", component: RemindAction, access: "edit" }],
  },
}
