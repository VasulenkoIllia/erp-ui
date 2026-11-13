/**
 * Контракт модуля K4 «Оплати» (SPEC §14, §17; ADR-0057, ADR-0058, ADR-0069, ADR-0071, ADR-0073).
 *
 * Ресурс `sales-payments` (`/api/v1/sales-payments`, плоскі параметри списку, відповідь `{ data, total }`):
 * оплати клієнтів за рахунками модуля K2 (ресурс рахунків називає проект, за замовчуванням `sales-invoices`).
 * - Оплату реєструють одразу проведеною (рішення власника 11.11.2026): `POST /sales-payments` → 201 з
 *   номером серії `sales-payments` (ADR-0058), статусом «Отримано» й `docStatus: "submitted"`. Чернетки,
 *   зміни (`PATCH`) і видалення немає: помилку виправляє «Скасувати» з причиною чи «Сторнувати».
 * - Тіло: `requestId`, `date`, `clientId`, `currency`, `method`, `reference`, `amount` і `allocations` — рахунки
 *   й сума кожному (`invoiceId`, `amount`). Назву клієнта, номери й дати рахунків сервер бере з рахунків.
 * - Повтор із тим самим `requestId` у компанії повертає вже зареєстровану оплату (200) і другої не створює:
 *   подвійне натискання, повтор після втраченої відповіді. Тіло повтору сервер не порівнює: новий ключ —
 *   на кожну нову форму.
 * - Рознесення (рішення власника 11.11.2026): оплата йде на один чи кілька виставлених рахунків того самого
 *   клієнта й тієї самої валюти. Кожному рахунку — не більше за його борг: «виставлено мінус кредит-ноти
 *   мінус оплачено» (ADR-0072), інакше 422 `exceeds_debt` біля `allocations.<i>.amount`. Рахунок не той
 *   (не виставлений, сплачений, іншого клієнта чи валюти) — 422 `invoice_unavailable` біля
 *   `allocations.<i>.invoiceId`, той самий рахунок двічі — `duplicate`. Переплати й авансу немає: сума оплати
 *   дорівнює сумі рознесення, інакше 422 `not_allocated` біля `amount`. Перевірку й запис сервер робить в
 *   одній транзакції з блокуванням рядків рахунків, а `requestId` унікальний у компанії: два одночасні запити
 *   з різними ключами разом не перевищать борг.
 * - Статус рахунку змінює сервер (ADR-0073): «Оплачено», коли оплати разом із кредит-нотами покривають
 *   рахунок; часткова оплата лишає «Виставлено», а картка рахунку має `paidTotal`. Скасована чи сторнована
 *   оплата повертає рахунку борг. Рахунок з оплатою не скасовують і не сторнують.
 * - Валюта — валюта рахунків. Оплата у валюті має блок `exchange` (ADR-0071): курс таблиці на дату оплати чи
 *   останній попередній і сума в базовій валюті за правилом `lib/currency-conversion`; сторно бере курс першої.
 * - Обліковий документ (ADR-0069): дата в закритому періоді — 422 `period_locked` біля `date`; на оплаті
 *   закритого періоду «Скасувати» заборонено (`period_locked`), «Сторнувати» — ні: сторно датується сьогодні
 *   (першим відкритим днем).
 * - Сторно (`reverse`): нова проведена оплата зі статусом «Сторно», `amount` з мінусом, тим самим рознесенням
 *   і `reversalOf`; перша — «Сторновано». Жодна з них борг рахунку не зменшує.
 * - Відкриті рахунки клієнта для форми: `GET /sales-payments/open-invoices?clientId=<id>` у форматі списку
 *   (ADR-0002: `page`, `perPage`, відповідь `{ data, total }`) — виставлені рахунки з боргом у всіх валютах,
 *   від найранішої «Сплатити до».
 * - Потік документів (ADR-0061): `GET /sales-payments/:id/flow`; оплата — `basedOn` кожного свого рахунку.
 * - Права — `sales-payments:<дія>`: `read`, `create`, `cancel`, `reverse` і дії розширення; відкриті рахунки
 *   — з `create`.
 *
 * Ресурс `sales-refunds` (ADR-0083): повернення грошей клієнту, коли після оплати виставили кредит-ноту й
 * рахунок має переплату. Окремий документ зі своєю серією номерів (`sales-refunds`, «ПВ-{YYYY}-{####}») і
 * своїм правом; поля, тіло запиту, `requestId`, валюта, закритий період, «Скасувати» й «Сторнувати» — як в
 * оплати, статус нового — «Повернено».
 * - Рознесення — рахунки того самого клієнта й валюти з переплатою: кожному не більше за переплату
 *   («оплачено мінус повернено мінус (виставлено мінус кредит-ноти)»), інакше 422 `exceeds_overpayment`
 *   біля `allocations.<i>.amount`; рахунок без переплати — `invoice_unavailable`; сума повернення
 *   дорівнює сумі рознесення — `not_allocated`. Перевірка й запис — в одній транзакції, як в оплати: два
 *   одночасні повернення разом не перевищать переплату.
 * - Повернення зменшує переплату: картка рахунку має `refundedTotal`, борг — «виставлено мінус кредит-ноти
 *   мінус оплачено плюс повернено». Статус рахунку повернення не змінює: «Оплачено» лишається, поки є
 *   оплата й борг не більший за нуль. Скасоване чи сторноване повернення переплату повертає.
 * - Рахунки з переплатою для форми: `GET /sales-refunds/overpaid-invoices?clientId=<id>` у форматі списку,
 *   від найранішої «Сплатити до».
 * - Потік документів: `GET /sales-refunds/:id/flow`; повернення — `basedOn` кожного свого рахунку.
 * - Права — `sales-refunds:<дія>`: `read`, `create`, `cancel`, `reverse`; рахунки з переплатою — з `create`.
 */
import { z } from "zod"

import { moneyAmountSchema, recordBaseSchema } from "@/lib/api"
import { documentExchangeSchema } from "@/lib/currency-conversion"
import { isCalendarDate } from "@/lib/dates"
import { documentLifecycleSchema } from "@/lib/document-lifecycle"
import {
  extendSchema,
  type ExtensionField,
  type ExtensionValues,
} from "@/lib/extension-fields"
import {
  statusSchema,
  type ExtensionStatusChanges,
  type StatusTransition,
} from "@/lib/statuses"

export { PAYMENTS, PAYMENTS_RESOURCES, REFUNDS } from "./resources"

/** Статуси оплати (ADR-0073); розширення додає свої (`statuses`). */
export const PAYMENT_STATUSES = [
  "received",
  "cancelled",
  "reversed",
  "reversal",
] as const
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number]
/** Статус нової оплати: вона одразу проведена. */
export const RECEIVED_STATUS: PaymentStatus = "received"
/** Статус документа-сторно: проведений, без дій. */
export const REVERSAL_STATUS: PaymentStatus = "reversal"

/**
 * Граф переходів оплати (ADR-0057, ADR-0069): «Скасувати» з причиною — помилку у відкритому періоді;
 * «Сторнувати» з причиною — і в закритому. Виправленої копії немає: правильну оплату реєструють знову.
 */
export const PAYMENT_TRANSITIONS = [
  {
    id: "cancel",
    from: ["received"],
    to: "cancelled",
    reason: "required",
  },
  {
    id: "reverse",
    from: ["received"],
    to: "reversed",
    reason: "required",
  },
] as const satisfies readonly StatusTransition<PaymentStatus>[]
export type PaymentTransitionId = (typeof PAYMENT_TRANSITIONS)[number]["id"]

/** Статуси повернення (ADR-0083); розширення додає свої (`refunds.statuses`). */
export const REFUND_STATUSES = [
  "refunded",
  "cancelled",
  "reversed",
  "reversal",
] as const
export type RefundStatus = (typeof REFUND_STATUSES)[number]
/** Статус нового повернення: воно одразу проведене. */
export const REFUNDED_STATUS: RefundStatus = "refunded"

/** Граф переходів повернення: як в оплати — «Скасувати» у відкритому періоді, «Сторнувати» й у закритому. */
export const REFUND_TRANSITIONS = [
  {
    id: "cancel",
    from: ["refunded"],
    to: "cancelled",
    reason: "required",
  },
  {
    id: "reverse",
    from: ["refunded"],
    to: "reversed",
    reason: "required",
  },
] as const satisfies readonly StatusTransition<RefundStatus>[]
export type RefundTransitionId = (typeof REFUND_TRANSITIONS)[number]["id"]

/** Способи оплати модуля; розширення додає свої чи ховає ці (`methods`). */
export const PAYMENT_METHODS = ["bank", "card", "cash", "other"] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]
/** Спосіб нової оплати за замовчуванням: переказ на рахунок. */
export const DEFAULT_PAYMENT_METHOD: PaymentMethod = "bank"

/** Найдовше призначення чи номер платіжки: як призначення платежу НБУ. */
export const PAYMENT_REFERENCE_MAX = 140
/** Найдовший ключ ідемпотентності запиту. */
export const REQUEST_ID_MAX = 64

/** Відкриті рахунки клієнта для форми: `GET /sales-payments/open-invoices?clientId=<id>`. */
export const OPEN_INVOICES_PATH = "open-invoices"
/** Рахунки клієнта з переплатою для форми повернення: `GET /sales-refunds/overpaid-invoices?clientId=<id>`. */
export const OVERPAID_INVOICES_PATH = "overpaid-invoices"

/**
 * Коди відмов сервера (ADR-0073): 422 біля полів оплати.
 * - `exceedsDebt` — сума рахунку в рознесенні більша за його борг.
 * - `notAllocated` — сума оплати не дорівнює сумі рознесення: переплати й авансу немає.
 * - `invoiceUnavailable` — рахунок не виставлений, уже сплачений, іншого клієнта чи іншої валюти.
 */
export const PAYMENT_ISSUES = {
  exceedsDebt: "exceeds_debt",
  notAllocated: "not_allocated",
  invoiceUnavailable: "invoice_unavailable",
} as const

/**
 * Коди відмов сервера для повернення (ADR-0083): 422 біля полів.
 * - `exceedsOverpayment` — сума рахунку в рознесенні більша за його переплату.
 * - `notAllocated` — сума повернення не дорівнює сумі рознесення.
 * - `invoiceUnavailable` — рахунок без переплати, іншого клієнта чи іншої валюти.
 */
export const REFUND_ISSUES = {
  exceedsOverpayment: "exceeds_overpayment",
  notAllocated: PAYMENT_ISSUES.notAllocated,
  invoiceUnavailable: PAYMENT_ISSUES.invoiceUnavailable,
} as const

const calendarDateSchema = z.string().refine(isCalendarDate)

/** Рахунок у рознесенні оплати: знімки номера й дати для списку й картки. */
export const paymentAllocationSchema = z.object({
  invoiceId: z.string().min(1),
  invoiceNumber: z.string().min(1),
  invoiceDate: calendarDateSchema,
  /** Сума рахунку з цієї оплати, мінорні одиниці валюти оплати; у сторно — та сама, без мінуса. */
  amount: moneyAmountSchema.positive(),
})
export type PaymentAllocation = z.infer<typeof paymentAllocationSchema>

const paymentShape = recordBaseSchema
  .extend({
    companyId: z.string().nullable().optional(),
    /** Номер серії `sales-payments` (ADR-0058): оплату реєструють одразу проведеною. */
    number: z.string().min(1),
    date: calendarDateSchema,
    clientId: z.string().min(1),
    clientName: z.string().trim().min(1),
    /** ISO 4217: валюта рахунків оплати. */
    currency: z.string().length(3),
    /** Сума оплати, мінорні одиниці; у сторно — з мінусом. */
    amount: moneyAmountSchema,
    /** Спосіб оплати: ключ модуля (`PAYMENT_METHODS`) чи розширення. */
    method: z.string().min(1),
    /** Номер платіжки чи призначення: як його бачить бухгалтер у виписці. */
    reference: z.string().max(PAYMENT_REFERENCE_MAX).nullable().optional(),
    allocations: z.array(paymentAllocationSchema).min(1),
    /** Оплата у валюті: курс на дату оплати й сума в базовій валюті (ADR-0071); у базовій — `null`. */
    exchange: documentExchangeSchema.nullable().optional(),
  })
  .extend(documentLifecycleSchema.shape)

/** Те, що схема запису бере з розширення проекту: нові поля й статуси. */
export interface PaymentSchemaExtension {
  readonly fields?: readonly ExtensionField[]
  readonly statuses?: ExtensionStatusChanges<PaymentStatus>
}

const paymentObject = (extension?: PaymentSchemaExtension) =>
  paymentShape.extend({
    status: statusSchema(PAYMENT_STATUSES, extension?.statuses).default(
      RECEIVED_STATUS,
    ),
  })

/** Оплата зі статусами й полями розширення: рядок списку й картка. */
export function paymentSchemaFor(
  extension?: PaymentSchemaExtension,
): z.ZodType<Payment> {
  return extendSchema(paymentObject(extension), extension?.fields)
}

/** Те, що схема повернення бере з розширення проекту (`refunds`): нові поля й статуси. */
export interface RefundSchemaExtension {
  readonly fields?: readonly ExtensionField[]
  readonly statuses?: ExtensionStatusChanges<RefundStatus>
}

/** Повернення зі статусами й полями розширення: поля оплати, свої статуси (ADR-0083). */
export function refundSchemaFor(
  extension?: RefundSchemaExtension,
): z.ZodType<Refund> {
  return extendSchema(
    paymentShape.extend({
      status: statusSchema(REFUND_STATUSES, extension?.statuses).default(
        REFUNDED_STATUS,
      ),
    }),
    extension?.fields,
  )
}

/** Оплата в списку й на картці; `status` — ключ модуля чи розширення. */
export type Payment = z.output<typeof paymentShape> & {
  status: string
} & ExtensionValues

/**
 * Повернення клієнту (ADR-0083): ті самі поля, що в оплати; рознесення — рахунки з переплатою, сума —
 * скільки повернули за кожним. Спільні частини сторінок модуля працюють з обома.
 */
export type Refund = Payment

/** Рахунок у тілі нової оплати: сума кожному рахунку. */
export interface PaymentAllocationInput {
  readonly invoiceId: string
  readonly amount: number
}

/** Тіло `POST /sales-payments`: решту (номер, клієнта, знімки рахунків, курс) дає сервер. */
export interface PaymentCreateBody extends ExtensionValues {
  readonly requestId: string
  readonly date: string
  readonly clientId: string
  readonly currency: string
  readonly method: string
  readonly reference: string | null
  readonly amount: number
  readonly allocations: readonly PaymentAllocationInput[]
}

/** Рахунок клієнта з боргом для форми оплати: `GET /sales-payments/open-invoices`. */
export const openInvoiceSchema = z.object({
  id: z.string().min(1),
  number: z.string().min(1),
  date: calendarDateSchema,
  dueDate: calendarDateSchema,
  currency: z.string().length(3),
  /** Підсумок рахунку, мінорні одиниці. */
  total: moneyAmountSchema,
  /** Борг: «виставлено мінус кредит-ноти мінус оплачено», більше нуля. */
  debt: moneyAmountSchema.positive(),
})
export type OpenInvoice = z.infer<typeof openInvoiceSchema>

/** Рахунок клієнта з переплатою для форми повернення: `GET /sales-refunds/overpaid-invoices`. */
export const overpaidInvoiceSchema = openInvoiceSchema
  .omit({ debt: true })
  .extend({
    /** Переплата: «оплачено мінус повернено мінус (виставлено мінус кредит-ноти)», більше нуля. */
    overpaid: moneyAmountSchema.positive(),
  })
export type OverpaidInvoice = z.infer<typeof overpaidInvoiceSchema>
