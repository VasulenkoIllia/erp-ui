import type { DocumentTemplateOption } from "@/registry/erp/document-generator"
import type {
  DocumentBodyLine,
  DocumentLineTax,
} from "@/registry/lib/document-lines"
import { documentSumsOf } from "@/registry/lib/document-sums"
import type { TemplateDocument } from "@/registry/lib/document-template"

import { DEMO_COUNTERPARTIES } from "./party-details-model"

/**
 * Дані сторінки «Документ із шаблону» (UI44, ADR-0087): документ із рядками й сторонами, шаблони Word
 * демо, зокрема з невідомими мітками, з помилками запису й такий, що не завантажується (стани).
 */

const templates = () => import("@/data/docx-templates")

export const PAGE_TEMPLATES: readonly DocumentTemplateOption[] = [
  {
    id: "contract",
    label: { uk: "Договір поставки", en: "Supply contract" },
    load: () => templates().then((m) => m.templateFile(m.contractTemplate())),
  },
  {
    id: "payment-letter",
    label: { uk: "Лист про оплату", en: "Payment request letter" },
    load: () =>
      templates().then((m) => m.templateFile(m.paymentLetterTemplate())),
  },
  {
    id: "unknown-tags",
    label: {
      uk: "Шаблон із невідомими мітками",
      en: "Template with unknown tags",
    },
    load: () => templates().then((m) => m.templateFile(m.unknownTagTemplate())),
  },
  {
    id: "broken",
    label: { uk: "Шаблон з помилками запису", en: "Template with tag errors" },
    load: () => templates().then((m) => m.templateFile(m.brokenTemplate())),
  },
  {
    id: "unavailable",
    label: {
      uk: "Шаблон, що не завантажується",
      en: "Template that fails to load",
    },
    load: () => Promise.reject(new Error("demo: template is unavailable")),
  },
]

const VAT: DocumentLineTax = {
  id: "vat-20",
  name: "ПДВ 20%",
  rate: 20,
  included: false,
}

const LINES: DocumentBodyLine[] = [
  {
    kind: "item",
    id: "line-1",
    name: 'Ноутбук 14" для бухгалтерії',
    itemId: null,
    quantity: "2",
    unit: { id: "pcs", name: "шт." },
    price: "32500.00",
    discountPercent: 0,
    discountAmount: 0,
    tax: VAT,
  },
  {
    kind: "item",
    id: "line-2",
    name: "Налаштування робочих місць",
    itemId: null,
    quantity: "6",
    unit: { id: "hour", name: "год" },
    price: "850.00",
    discountPercent: 10,
    discountAmount: 0,
    tax: VAT,
  },
  {
    kind: "item",
    id: "line-3",
    name: "Доставка по Києву",
    itemId: null,
    quantity: "1",
    unit: { id: "service", name: "посл." },
    price: "600.00",
    discountPercent: 0,
    discountAmount: 0,
    tax: null,
  },
]

const sums = documentSumsOf({
  currency: "UAH",
  lines: LINES,
  discountPercent: 0,
  discountAmount: 0,
})

/** Документ демо без сторони нашої компанії: її дає профіль компанії на сторінці. */
export const DEMO_DOCUMENT: TemplateDocument = {
  number: "ЗМ-2026-0042",
  date: "2026-11-14",
  currency: "UAH",
  total: sums?.total ?? 0,
  lines: sums?.lines ?? [],
  totals: sums?.totals,
  parties: {
    customer: {
      details: DEMO_COUNTERPARTIES[0].party,
      label: { uk: "Покупець", en: "Buyer" },
    },
  },
  fields: [
    {
      key: "dueDate",
      label: { uk: "Виконати до", en: "Due date" },
      value: { date: "2026-11-28" },
    },
  ],
}
