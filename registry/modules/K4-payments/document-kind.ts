/**
 * Документ модуля K4 для спільних частин сторінок (ADR-0073, ADR-0083): оплата чи повернення. Ресурс,
 * статуси з тонами, граф дій, рахунки форми з межею суми, коди відмов сервера, адреси й розширення — звідси;
 * рядки — `payment*` чи `refund*` (`i18n/uk.json`), спільні підписи полів, способів і колонок — оплати.
 */
import type { LucideIcon } from "lucide-react"
import type { z } from "zod"

import { ACTION_ICONS, MODULE_ICONS } from "@/lib/icons"
import type { DocumentKind } from "@/lib/document-kind"
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
  type PaymentStatus,
  type PaymentTransitionId,
  type RefundStatus,
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

/** Вид документа модуля (`lib/document-kind`): дії графа — підписи кіта, своїх підписів і підтверджень немає. */
export interface K4DocumentKind extends DocumentKind<PaymentsKey, never> {
  /** Рядки картки: `payment.*` чи `refund.*`. */
  readonly key: "payment" | "refund"
  /** Рядки списку: `payments.*` чи `refunds.*`. */
  readonly list: "payments" | "refunds"
  /** Рядки форми: `paymentForm.*` чи `refundForm.*`. */
  readonly form: "paymentForm" | "refundForm"
  /**
   * Підписи, що в оплати лишились під давніми ключами: перевизначення `strings` проекту діють і далі.
   * `limit` — колонка межі суми рахунку, `submit` — кнопка форми.
   */
  readonly labels: { readonly limit: PaymentsKey; readonly submit: PaymentsKey }
  /** Позначка «Прострочено» біля рахунку форми: для оплати так, для повернення (рахунок переплачено) — ні. */
  readonly showsOverdue: boolean
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

/** Тон кожного статусу модуля: новий статус без тону не скомпілюється. */
const TONES: Readonly<Record<PaymentStatus | RefundStatus, StatusTone>> = {
  received: "success",
  refunded: "success",
  cancelled: "destructive",
  reversed: "warning",
  reversal: "neutral",
}

const NO_EXTENSION: K4KindExtension = {}

export const PAYMENT_KIND: K4DocumentKind = {
  resource: PAYMENTS,
  key: "payment",
  list: "payments",
  form: "paymentForm",
  labels: { limit: "paymentForm.invoices.debt", submit: "payments.create" },
  showsOverdue: true,
  icon: MODULE_ICONS.K4,
  statuses: PAYMENT_STATUSES.map((id) => ({
    id,
    tone: TONES[id],
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
  labels: { limit: "refundForm.invoices.limit", submit: "refundForm.submit" },
  showsOverdue: false,
  icon: ACTION_ICONS.refund,
  statuses: REFUND_STATUSES.map((id) => ({
    id,
    tone: TONES[id],
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
