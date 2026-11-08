/**
 * Документи продажу модуля B3 (ADR-0065, ADR-0067): чим пропозиція відрізняється від замовлення для
 * спільних сторінок і компонентів модуля — ресурс, ключі рядків, друга дата, статуси, граф дій,
 * адреси й аркуш друку. Решта (список, картка, форма, друк, видалення чернетки) — однакова; масові
 * дії списку — свої в кожного (`quote-bulk-actions`, `order-bulk-actions`).
 */
import type { z } from "zod"

import type { Language } from "@/lib/i18n"
import type { StatusTone, StatusTransition } from "@/lib/statuses"

import {
  AWAITING_COMPLETION,
  AWAITING_REPLY,
  ORDER_STATUSES,
  ORDER_TRANSITIONS,
  orderCardSchemaFor,
  ORDERS,
  QUOTE_STATUSES,
  QUOTE_TRANSITIONS,
  quoteCardSchemaFor,
  QUOTES,
  type Order,
  type OrderStatus,
  type Quote,
  type QuoteStatus,
  type SalesDocument,
  type SalesDocumentDetail,
  type SalesSchemaExtension,
} from "./contract"
import type {
  SalesDocumentExtension,
  SalesDocumentIds,
  SalesExtension,
} from "./extension"
import type { SalesPaths } from "./module-context"
import type { SalesKey } from "./use-sales-t"

/** Адреси сторінок документа від `basePath` фабрики. */
export interface SalesDocumentPaths {
  readonly list: string
  readonly record: (id: string) => string
  readonly create: string
  readonly edit: (id: string) => string
  readonly print: (id: string) => string
}

/** Префікс рядків підтвердження дії модуля: `title`, `description`, `action`. */
export type SalesConfirmKey =
  "quote.confirm.submit" | "quote.confirm.decline" | "order.confirm.submit"

export interface SalesDocumentKind<
  D extends SalesDocument,
  Due extends string,
> {
  readonly resource: string
  /** Ключі рядків документа: список, запис і форма (`i18n/uk.json`). */
  readonly keys: {
    readonly list: "quotes" | "orders"
    readonly record: "quote" | "order"
    readonly form: "form" | "orderForm"
  }
  /** Друга дата: поле, підписи, позначка минулої дати й статуси, у яких документ іще чекає. */
  readonly due: {
    readonly field: Due
    readonly label: SalesKey
    readonly column: SalesKey
    readonly formLabel: SalesKey
    /** Помилка форми й 422 `before_date`: друга дата раніше дати документа. */
    readonly before: SalesKey
    /** Позначка минулої дати документа, що чекає: «Термін минув», «Прострочено». */
    readonly badge: SalesKey
    readonly awaiting: readonly string[]
    /** Нова форма: друга дата за стільки днів від сьогодні. */
    readonly newDays: number
  }
  dueOf(document: D): string
  readonly statuses: readonly {
    readonly id: string
    readonly tone: StatusTone
    readonly label: SalesKey
  }[]
  readonly transitions: readonly StatusTransition[]
  /** Дії зі своїм підписом модуля; решта — підписи кіта (`documentActions.<дія>`). */
  readonly actionLabels: Readonly<Partial<Record<string, SalesKey>>>
  /** Дії зі своїми текстами підтвердження: «Надіслати пропозицію?» замість «Провести документ?». */
  readonly confirms: Readonly<Partial<Record<string, SalesConfirmKey>>>
  /** Основний шлях для смуги етапів; решта статусів — бейджем. */
  readonly mainPath: readonly string[]
  extensionOf(
    extension: SalesExtension,
  ): SalesDocumentExtension<D, SalesDocumentIds<Due>> | undefined
  pathsOf(paths: SalesPaths): SalesDocumentPaths
  cardSchemaFor(
    extension?: SalesSchemaExtension,
  ): z.ZodType<D & SalesDocumentDetail>
  /** Аркуш друку мовою документа (дані модуля, а не рядки інтерфейсу, ADR-0062). */
  readonly sheet: {
    readonly title: Readonly<Record<Language, string>>
    readonly due: Readonly<Record<Language, (date: string) => string>>
  }
}

/** Те, що не залежить від запису: ресурс, ключі рядків, адреси. */
export type SalesKindBase = Pick<
  SalesDocumentKind<SalesDocument, string>,
  "resource" | "keys" | "pathsOf"
>

export type QuoteKind = SalesDocumentKind<Quote, "validUntil">
export type OrderKind = SalesDocumentKind<Order, "dueDate">

const QUOTE_TONES: Record<QuoteStatus, StatusTone> = {
  draft: "neutral",
  sent: "info",
  accepted: "success",
  declined: "warning",
  cancelled: "destructive",
}

const ORDER_TONES: Record<OrderStatus, StatusTone> = {
  draft: "neutral",
  confirmed: "info",
  completed: "success",
  cancelled: "destructive",
}

/** Пропозиція (ADR-0065): «Дійсна до», відповідь клієнта, «Термін минув». */
export const QUOTE_KIND: QuoteKind = {
  resource: QUOTES,
  keys: { list: "quotes", record: "quote", form: "form" },
  due: {
    field: "validUntil",
    label: "quote.fields.validUntil",
    column: "quotes.columns.validUntil",
    formLabel: "form.fields.validUntil",
    before: "form.validUntilBefore",
    badge: "quote.expired",
    awaiting: AWAITING_REPLY,
    newDays: 14,
  },
  dueOf: (quote) => quote.validUntil,
  statuses: QUOTE_STATUSES.map((id) => ({
    id,
    tone: QUOTE_TONES[id],
    label: `quote.statuses.${id}` as const,
  })),
  transitions: QUOTE_TRANSITIONS,
  actionLabels: {
    submit: "quote.actions.submit",
    accept: "quote.actions.accept",
    decline: "quote.actions.decline",
  },
  confirms: {
    submit: "quote.confirm.submit",
    decline: "quote.confirm.decline",
  },
  mainPath: ["draft", "sent", "accepted"],
  extensionOf: (extension) => extension.quotes,
  pathsOf: (paths) => ({
    list: paths.quotes,
    record: paths.quote,
    create: paths.newQuote,
    edit: paths.editQuote,
    print: paths.printQuote,
  }),
  cardSchemaFor: quoteCardSchemaFor,
  sheet: {
    title: { uk: "Комерційна пропозиція", en: "Quotation" },
    due: {
      uk: (date) => `Пропозиція дійсна до ${date}`,
      en: (date) => `Valid until ${date}`,
    },
  },
}

/** Замовлення (ADR-0067): «Виконати до», «Позначити виконаним», «Прострочено». */
export const ORDER_KIND: OrderKind = {
  resource: ORDERS,
  keys: { list: "orders", record: "order", form: "orderForm" },
  due: {
    field: "dueDate",
    label: "order.fields.dueDate",
    column: "orders.columns.dueDate",
    formLabel: "orderForm.fields.dueDate",
    before: "orderForm.dueDateBefore",
    badge: "order.overdue",
    awaiting: AWAITING_COMPLETION,
    newDays: 7,
  },
  dueOf: (order) => order.dueDate,
  statuses: ORDER_STATUSES.map((id) => ({
    id,
    tone: ORDER_TONES[id],
    label: `order.statuses.${id}` as const,
  })),
  transitions: ORDER_TRANSITIONS,
  actionLabels: {
    submit: "order.actions.submit",
    complete: "order.actions.complete",
  },
  confirms: { submit: "order.confirm.submit" },
  mainPath: ["draft", "confirmed", "completed"],
  extensionOf: (extension) => extension.orders,
  pathsOf: (paths) => ({
    list: paths.orders,
    record: paths.order,
    create: paths.newOrder,
    edit: paths.editOrder,
    print: paths.printOrder,
  }),
  cardSchemaFor: orderCardSchemaFor,
  sheet: {
    title: { uk: "Замовлення покупця", en: "Sales order" },
    due: {
      uk: (date) => `Виконати до ${date}`,
      en: (date) => `Due by ${date}`,
    },
  },
}
