/**
 * Документ модуля K4 для спільних частин сторінок (ADR-0073, ADR-0083): оплата чи повернення. Ресурс,
 * статуси з тонами, граф дій, рахунки форми з межею суми, коди відмов сервера, адреси й розширення — звідси;
 * рядки — `payment*` чи `refund*` (`i18n/uk.json`), спільні підписи полів, способів і колонок — оплати.
 */
import type { LucideIcon } from "lucide-react"
import type { z } from "zod"

import { ACTION_ICONS, MODULE_ICONS } from "@/lib/icons"
import type { StatusTone, StatusTransition } from "@/lib/statuses"

import type { AllocationInvoice } from "./allocation"
import {
  OPEN_INVOICES_PATH,
  OVERPAID_INVOICES_PATH,
  PAYMENT_ISSUES,
  PAYMENT_STATUSES,
  PAYMENT_TRANSITIONS,
  paymentSchemaFor,
  PAYMENTS,
  REFUND_ISSUES,
  REFUND_STATUSES,
  REFUND_TRANSITIONS,
  refundSchemaFor,
  REFUNDS,
  openInvoiceSchema,
  overpaidInvoiceSchema,
  type Payment,
  type PaymentTransitionId,
} from "./contract"
import type {
  MoneyDocumentExtension,
  PaymentIds,
  PaymentsExtension,
} from "./extension"
import type { PaymentSourceInvoice, PaymentsPaths } from "./module-context"
import type { PaymentsKey } from "./use-payments-t"

/** Адреси сторінок документа від `basePath` фабрики. */
export interface K4DocumentPaths {
  readonly list: string
  readonly record: (id: string) => string
  readonly create: (from?: PaymentSourceInvoice) => string
}

/** Те, що спільні частини беруть із розширення документа проекту. */
export type K4KindExtension = MoneyDocumentExtension<PaymentIds, string, string>

export interface K4DocumentKind {
  readonly resource: string
  /** Рядки картки: `payment.*` чи `refund.*`. */
  readonly key: "payment" | "refund"
  /** Рядки списку: `payments.*` чи `refunds.*`. */
  readonly list: "payments" | "refunds"
  /** Рядки форми: `paymentForm.*` чи `refundForm.*`. */
  readonly form: "paymentForm" | "refundForm"
  readonly icon: LucideIcon
  /** Статуси модуля з тоном і ключем підпису `<key>.statuses.<id>`. */
  readonly statuses: readonly {
    readonly id: string
    readonly tone: StatusTone
    readonly label: PaymentsKey
  }[]
  /** Граф модуля: «Скасувати» й «Сторнувати» — підписи кіта (`documentActions.<дія>`). */
  readonly transitions: readonly (StatusTransition & {
    readonly id: PaymentTransitionId
  })[]
  /** Рахунки форми — підресурс документа у форматі списку (ADR-0002). */
  readonly targets: string
  /** Рядок рахунків форми за контрактом → рахунок форми з межею суми. */
  readonly targetSchema: z.ZodType<AllocationInvoice>
  /** Коди 422 сервера біля рахунку й суми. */
  readonly issues: {
    readonly exceeds: string
    readonly notAllocated: string
    readonly invoiceUnavailable: string
  }
  recordSchema(extension: PaymentsExtension): z.ZodType<Payment>
  pathsOf(paths: PaymentsPaths): K4DocumentPaths
  extensionOf(extension: PaymentsExtension): K4KindExtension
}

/** Тони однакових статусів оплати й повернення: скасований — помилка, сторнований — попередження. */
const SHARED_TONES = {
  cancelled: "destructive",
  reversed: "warning",
  reversal: "neutral",
} as const satisfies Record<string, StatusTone>

const toneOf = (id: string): StatusTone =>
  (SHARED_TONES as Readonly<Record<string, StatusTone>>)[id] ?? "success"

const NO_EXTENSION: K4KindExtension = {}

export const PAYMENT_KIND: K4DocumentKind = {
  resource: PAYMENTS,
  key: "payment",
  list: "payments",
  form: "paymentForm",
  icon: MODULE_ICONS.K4,
  statuses: PAYMENT_STATUSES.map((id) => ({
    id,
    tone: toneOf(id),
    label: `payment.statuses.${id}`,
  })),
  transitions: PAYMENT_TRANSITIONS,
  targets: `${PAYMENTS}/${OPEN_INVOICES_PATH}`,
  targetSchema: openInvoiceSchema.transform(({ debt, ...invoice }) => ({
    ...invoice,
    limit: debt,
  })),
  issues: {
    exceeds: PAYMENT_ISSUES.exceedsDebt,
    notAllocated: PAYMENT_ISSUES.notAllocated,
    invoiceUnavailable: PAYMENT_ISSUES.invoiceUnavailable,
  },
  recordSchema: (extension) => paymentSchemaFor(extension),
  pathsOf: (paths) => ({
    list: paths.payments,
    record: paths.payment,
    create: paths.newPayment,
  }),
  extensionOf: (extension) => extension,
}

export const REFUND_KIND: K4DocumentKind = {
  resource: REFUNDS,
  key: "refund",
  list: "refunds",
  form: "refundForm",
  icon: ACTION_ICONS.refund,
  statuses: REFUND_STATUSES.map((id) => ({
    id,
    tone: toneOf(id),
    label: `refund.statuses.${id}`,
  })),
  transitions: REFUND_TRANSITIONS,
  targets: `${REFUNDS}/${OVERPAID_INVOICES_PATH}`,
  targetSchema: overpaidInvoiceSchema.transform(({ overpaid, ...invoice }) => ({
    ...invoice,
    limit: overpaid,
  })),
  issues: {
    exceeds: REFUND_ISSUES.exceedsOverpayment,
    notAllocated: REFUND_ISSUES.notAllocated,
    invoiceUnavailable: REFUND_ISSUES.invoiceUnavailable,
  },
  recordSchema: (extension) => refundSchemaFor(extension.refunds),
  pathsOf: (paths) => ({
    list: paths.refunds,
    record: paths.refund,
    create: paths.newRefund,
  }),
  extensionOf: (extension) => extension.refunds ?? NO_EXTENSION,
}
