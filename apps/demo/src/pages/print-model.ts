import type { CompanyProfile } from "@/registry/lib/company"
import type {
  DocumentBodyLine,
  DocumentLineTax,
} from "@/registry/lib/document-lines"
import type { DocumentState } from "@/registry/lib/document-lifecycle"
import { currencyDigits, minorToDecimal } from "@/registry/lib/format"
import type { Language } from "@/registry/lib/i18n"

import type { Invoice, InvoiceLine } from "@/data/invoices"

/**
 * Друк у демо (PF08, ADR-0062): рахунок стрес-сторінки як документ кіта. Рядки рахунку демо мають лише
 * суму, тож у платника ПДВ податок 20 % уже в ціні: «Разом» на папері дорівнює сумі рахунку в списку.
 */

/** Варіанти сторінки «Друк»: на сторінці один аркуш, бо друкується саме він. */
export const PRINT_VARIANTS = [
  "invoice",
  "long",
  "draft",
  "cancelled",
  "fop",
  "en",
  "plain",
  "empty",
  "loading",
  "error",
  "offline",
  "forbidden",
  "notFound",
] as const
export type PrintVariant = (typeof PRINT_VARIANTS)[number]

export const printVariantOf = (value: string | null): PrintVariant =>
  PRINT_VARIANTS.find((variant) => variant === value) ?? "invoice"

/** Стан аркуша варіанта без запиту: його показує `PrintPreview` замість аркуша. */
export const FORCED_STATES = {
  loading: "loading",
  error: "error",
  offline: "offline",
  forbidden: "forbidden",
  notFound: "not-found",
} as const satisfies Partial<Record<PrintVariant, string>>

/** Рахунок для друку за замовчуванням: перший у основної компанії демо. */
export const DEFAULT_INVOICE_ID = "inv-00001"

/** Вид документа мовою аркуша: дані модуля, а не рядки інтерфейсу. */
export const DOCUMENT_TITLES: Record<Language, string> = {
  uk: "Рахунок на оплату",
  en: "Invoice",
}

const UNIT_NAMES: Record<Language, Record<InvoiceLine["unit"], string>> = {
  uk: { pcs: "шт.", hour: "год", month: "міс.", service: "посл." },
  en: { pcs: "pcs", hour: "h", month: "mo", service: "svc" },
}

const VAT_NAMES: Record<Language, string> = { uk: "ПДВ 20%", en: "VAT 20%" }

/** Документ рахунку демо: стан кіта зі статусу рахунку (чернетка — лише `draft`). */
export const invoiceDocStatus = (invoice: Invoice): DocumentState =>
  invoice.status === "draft" ? "draft" : "submitted"

/** Рядки рахунку як рядки документа кіта мовою аркуша. */
export function invoicePrintLines(
  lines: readonly InvoiceLine[],
  currency: string,
  language: Language,
  vatPayer: boolean,
): DocumentBodyLine[] {
  const tax: DocumentLineTax | null = vatPayer
    ? { id: "vat-20-in", name: VAT_NAMES[language], rate: 20, included: true }
    : null
  const digits = currencyDigits(currency)
  return lines.map((line) => ({
    kind: "item",
    id: line.id,
    name: line.name,
    itemId: null,
    quantity: String(line.quantity),
    unit: { id: line.unit, name: UNIT_NAMES[language][line.unit] },
    price: minorToDecimal(line.price, digits),
    discountPercent: 0,
    discountAmount: 0,
    tax,
  }))
}

/**
 * Логотип і печатка компанії демо, поки компанія не завантажила свої на сторінці «Компанія»: так видно,
 * де вони на аркуші. ФОП демо печатки не має.
 */
const DEMO_IMAGES: Record<
  string,
  Pick<CompanyProfile, "logoUrl" | "stampUrl">
> = {
  zoriana: { logoUrl: "print/demo-logo.svg", stampUrl: "print/demo-stamp.svg" },
}

export function withDemoImages(company: CompanyProfile): CompanyProfile {
  const demo = DEMO_IMAGES[company.id]
  return {
    ...company,
    logoUrl: company.logoUrl ?? demo?.logoUrl ?? null,
    stampUrl: company.stampUrl ?? demo?.stampUrl ?? null,
  }
}

/** Варіант «ФОП без ПДВ»: той самий рахунок від ФОП демо (`mocks/team`), без печатки. */
export const FOP_COMPANY = {
  kind: "fop",
  legalName: "ФОП Коваленко Олена Вікторівна",
  rnokpp: "1759013776",
  edrpou: undefined,
  vatPayer: false,
  vatIpn: undefined,
  director: undefined,
  accountant: undefined,
  logoUrl: null,
  stampUrl: null,
} as const satisfies Partial<CompanyProfile>
