import type {
  InvoiceDocumentExtension,
  InvoicesExtension,
} from "@/registry/modules/K2-invoices"

import { invoicesMockExtension } from "./K2-sales-invoices-fields"
import {
  ExportInvoices,
  PaymentTermsBlock,
  PrintInvoiceRow,
} from "./K2-sales-invoices-slots"

/**
 * Розширення модуля K2 «Рахунки клієнтам» під клієнта (ADR-0020, ADR-0025) — так виглядає файл проекту
 * `src/extensions/K2-invoices.ts` (у демо — інша назва: `K2-invoices.ts` тут належить рахункам сторінки
 * «Дані й моки»). Файли модуля для цього не змінювались:
 * - поле «Договір» — колонка після клієнта, поле шапки картки, поле форми в групі «Договір» і рядок на
 *   аркуші під сторонами; рахунок із замовлення бере значення поля з тим самим ключем, якщо воно є в
 *   замовленні (ADR-0070);
 * - поле рядка «Код УКТЗЕД» — у рядку редактора під назвою, на картці й на аркуші (ADR-0086);
 * - дія рядка «Друк» у списку, масова дія «Вивантажити» в панелі вибраного, блок «Умови оплати» на
 *   аркуші після підсумків (`K2-sales-invoices-slots.tsx`).
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
  formGroups: {
    add: [
      {
        id: "contractGroup",
        title: { uk: "Договір", en: "Contract" },
        description: {
          uk: "Номер і дата договору друкуються на рахунку.",
          en: "The contract number and date are printed on the invoice.",
        },
        fields: ["contract"],
      },
    ],
  },
  rowActions: { add: [{ id: "print", component: PrintInvoiceRow }] },
  bulkActions: {
    add: [{ id: "export", component: ExportInvoices, place: "end" }],
  },
  print: {
    fields: [{ id: "contract" }],
    blocks: {
      add: [
        {
          id: "paymentTerms",
          component: PaymentTermsBlock,
          place: { after: "totals" },
        },
      ],
    },
  },
}

export const invoicesExtension: InvoicesExtension = { invoices }
