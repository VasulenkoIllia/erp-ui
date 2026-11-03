/**
 * Document line editor strings in English (UI05, ADR-0059). Ukrainian — lib/i18n-uk-document-lines.
 */
import type { ukDocumentLines } from "@/registry/lib/i18n-uk-document-lines"
import type { ErpUiTranslation } from "@/registry/lib/i18n-uk"

export const enDocumentLines = {
  documentLines: {
    label: "Document lines",
    row: "Line {{index}}",
    add: "Add a line",
    addSection: "Add a section",
    addNote: "Add a note",
    insert: "Insert a line below",
    insertSection: "Insert a section below",
    insertNote: "Insert a note below",
    empty: "No lines yet. Add the first one.",
    section: "Section",
    sectionPlaceholder: "Section name",
    sectionSum: "Section amount",
    note: "Note",
    notePlaceholder: "Note text",
    item: "Product or service",
    itemPlaceholder: "Pick from the catalogue",
    name: "Name",
    quantity: "Quantity",
    unit: "Unit",
    noUnit: "No unit",
    price: "Price",
    discount: "Discount",
    discountKind: "Discount type: {{row}}",
    documentDiscountKind: "Document discount type",
    percent: "as a percentage",
    amount: "as an amount",
    tax: "Tax",
    noTax: "No tax",
    sum: "Amount",
    noSum: "not calculated yet",
    totals: {
      label: "Totals",
      amount: "Before discounts",
      lineDiscount: "Line discounts",
      documentDiscount: "Document discount",
      net: "Before tax",
      taxIncluded: "Incl. {{name}}",
      total: "Total",
      skipped_one:
        "{{count}} line isn't counted: check the quantity, price and discount.",
      skipped_other:
        "{{count}} lines aren't counted: check the quantity, price and discount.",
      documentDiscountSkipped: "The document discount isn't counted: check it.",
    },
    errors: {
      invalid: "Enter a number",
      positive: "Must be more than zero",
      out_of_range:
        "The document total is too large. Reduce the quantity or price.",
      discount_both: "Either a percentage or an amount, not both",
      discount_exceeds: "The discount is more than the amount",
      percentMax: "No more than 100%",
      tooLong: "No more than {{max}} characters",
    },
  },
} satisfies ErpUiTranslation<typeof ukDocumentLines>
