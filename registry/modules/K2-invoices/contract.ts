/**
 * Контракт модуля K2 «Рахунки клієнтам» (SPEC §14, §17; ADR-0056…ADR-0062, ADR-0068…ADR-0071).
 *
 * Ресурс `sales-invoices` (`/api/v1/sales-invoices`, плоскі параметри списку, відповідь `{ data, total }`):
 * - Список віддає шапку без рядків; `GET /sales-invoices/:id`, `POST` і `PATCH` — детальний запис із
 *   рядками `lines` (`savedDocumentBodyLineSchema`) і підсумками `totals` (`documentTotalsSchema`,
 *   ADR-0019). `total` шапки — підсумок із податком для списку; рахує його сервер, як і суми рядків.
 * - Клієнт — запис ресурсу, який назве проект (за замовчуванням `organizations` модуля B1): `clientId` і
 *   знімок назви `clientName` (ADR-0056). Сторони — знімки `PartyDetails` (ADR-0068): `supplier` — наша
 *   компанія, `buyer` — клієнт. Зміна профілю компанії чи картки клієнта виставленого рахунку не змінює.
 * - Валюта `currency` (ISO 4217) — базова валюта компанії чи інша валюта компанії (модуль A1, рішення власника
 *   10.11.2026); у чернетці її можна змінити. Рахунок у валюті має блок `exchange` (ADR-0071), який веде
 *   сервер: курс таблиці курсів на дату рахунку (немає на цю дату — останній попередній, з його датою) і
 *   підсумок у базовій валюті. Поки рахунок чернетка, курс свіжий; «Виставити» закріплює курс і суму, сторно
 *   бере їх від першого рахунку з мінусом. Курсу немає — `rate`, `rateDate` і `baseTotal` порожні, виставити
 *   рахунок можна. Рахунок у базовій валюті — `exchange: null`. Сума в базовій валюті — довідка поруч, суму
 *   документа вона не підміняє.
 * - Дата `date` і «Сплатити до» `dueDate` — календарні дні `YYYY-MM-DD`; `dueDate` не раніше дати, інакше
 *   422 `before_date`. «Прострочено» — не статус, а позначка виставленого рахунку з минулою `dueDate`.
 * - Статуси (рішення власника 10.11.2026): «Чернетка», «Виставлено», «Скасовано», «Сторновано» й
 *   «Сторно» (документ-сторно). «Оплачено» з'явиться з модулем оплат K4: його ставитиме сервер.
 * - Життєвий цикл кіта (ADR-0057): `docStatus` поруч зі статусом модуля, дія — `POST
 *   /sales-invoices/:id/<дія>` з `version` і причиною. «Виставити» (`submit`) — проведення з номером серії
 *   `sales-invoices` (ADR-0058). Виставлений не змінюють і не видаляють: «Скасувати» з причиною й
 *   «Виправити» (нова чернетка `amendedFrom`) чи «Сторнувати» з причиною.
 * - Рахунок — обліковий документ (ADR-0069): у закритому періоді його не створюють і не змінюють (422
 *   `period_locked` біля `date`), а на записі — `deniedActions` з `period_locked` на всі дії, крім сторно.
 * - Сторно (`reverse`): новий проведений рахунок зі статусом «Сторно», датою сьогодні (перший відкритий
 *   день), тими самими клієнтом, сторонами, рядками й знижкою, `reversalOf` на першому; `total` сторно — з
 *   мінусом, рядки й `totals` — як у першого. Перший — «Сторновано», його не скасовують і не сторнують знову
 *   (`reversed`). Сторно не має дій.
 * - Видалити можна лише чернетку (`DELETE /sales-invoices/:id`, право `sales-invoices:delete`).
 * - Масові дії (`lib/jobs`, ADR-0018, ADR-0066): `POST /sales-invoices/bulk/<дія>` з вибором → 202
 *   `{ jobId }`: `submit`, `cancel` з `reason` і `delete` чернеток. Закритий період — невдача `period_locked`
 *   кожного такого рахунку.
 * - Рахунок із замовлення модуля B3 (рішення власника 10.11.2026): `POST /orders/:id/invoice` → 201
 *   чернетка з клієнтом, рядками, знижкою й валютою замовлення, датою сьогодні, сторонами з профілю компанії
 *   й картки клієнта, `orderId` (`basedOn` у потоці). Поля розширення рахунку беруть значення поля
 *   замовлення з тим самим ключем, якщо воно підходить. Один рахунок на замовлення: повторно — 403 `linked`.
 *   Видалена чернетка звільняє замовлення; виправлена копія скасованого бере `orderId` першого.
 * - Кредит-нота (ADR-0072, рішення власника 10.11.2026) — окремий документ ресурсу `sales-credit-notes` на
 *   підставі виставленого рахунку: `POST /sales-invoices/:id/creditNote` → 201 чернетка з клієнтом, сторонами,
 *   валютою й курсом рахунку, датою сьогодні (перший відкритий день, і коли період рахунку закрито) і рядками
 *   рахунку з кількістю, яку ще не повернули. Кредит-нот на рахунок буває кілька. У чернетці рядок прибирають
 *   чи зменшують кількість; назву, ціну, знижки й податок бере сервер з рахунку. Кількість рядка разом із
 *   виставленими кредит-нотами не більша, ніж у рахунку (422 `exceeds_invoice` біля кількості). Суми рядка —
 *   частка сум рядка рахунку за кількістю, остання частина — залишок: сума кредит-нот не більша за рахунок, а
 *   повне повернення частинами дає рівно суму рахунку. Статус рахунку кредит-нота не змінює: картка рахунку
 *   має `creditedTotal` — суму виставлених кредит-нот; рахунок із виставленою кредит-нотою не скасовують і не
 *   сторнують (`linked`), повністю покритий — без нової кредит-ноти (`credited`).
 * - Потік документів (ADR-0061): `GET /sales-invoices/:id/flow`, зв'язки `basedOn` (замовлення; рахунок у
 *   кредит-ноти), `amendedFrom`, `reversalOf`.
 * - Права — `sales-invoices:<дія>`: `read`, `create`, `update`, `delete`, `submit`, `cancel`, `reverse`,
 *   `amend`, `creditNote` і дії розширення; кредит-ноти — `sales-credit-notes:<дія>` (створення з рахунку —
 *   ще й `sales-credit-notes:create`).
 *
 * Створення — `POST` шапки, сторін, рядків і знижки документа; зміна — `PATCH` змінених полів з `version`:
 * рядки й сторона — цілим значенням. Помилки рядка — 422 `fieldErrors` з шляхом `lines.<індекс>.<поле>`,
 * сторони — `buyer.<поле>`.
 */
import { z } from "zod"

import { moneyAmountSchema, recordBaseSchema } from "@/lib/api"
import { documentExchangeSchema } from "@/lib/currency-conversion"
import { isCalendarDate } from "@/lib/dates"
import { documentLifecycleSchema } from "@/lib/document-lifecycle"
import {
  discountShape,
  documentTotalsSchema,
  quantitySchema,
  savedDocumentBodyLineSchema,
  savedDocumentLineSchema,
} from "@/lib/document-lines"
import { partyDetailsSchema } from "@/lib/document-parties"
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

import { CREDIT_NOTES } from "./resources"

export { CREDIT_NOTES, INVOICES, INVOICES_RESOURCES } from "./resources"

/** Статуси рахунку модуля (рішення власника 10.11.2026); розширення додає свої (`statuses`). */
export const INVOICE_STATUSES = [
  "draft",
  "issued",
  "cancelled",
  "reversed",
  "reversal",
] as const
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number]
/** Статус нового рахунку: його створюють чернеткою. */
export const DEFAULT_INVOICE_STATUS: InvoiceStatus = "draft"
/** Статус документа-сторно: проведений, без дій. */
export const REVERSAL_STATUS: InvoiceStatus = "reversal"
/** «Сплатити до» нового рахунку за замовчуванням: днів від дати рахунку. */
export const INVOICE_DUE_DAYS = 5
/** Статуси, у яких рахунок чекає оплати: тут минула «Сплатити до» — позначка «Прострочено». */
export const AWAITING_PAYMENT: readonly string[] = ["issued"]

/**
 * Життєвий цикл документа модуля (ADR-0057, ADR-0069): «Виставити» — проведення з номером; «Скасувати» з
 * причиною й «Виправити» скасований — помилку у відкритому періоді; «Сторнувати» з причиною — і в
 * закритому: сторно датується сьогодні. Однаковий у рахунку й кредит-ноті.
 */
const LIFECYCLE_TRANSITIONS = [
  { id: "submit", from: ["draft"], to: "issued" },
  {
    id: "cancel",
    from: ["issued"],
    to: "cancelled",
    reason: "required",
  },
  {
    id: "reverse",
    from: ["issued"],
    to: "reversed",
    reason: "required",
  },
  { id: "amend", from: ["cancelled"] },
] as const satisfies readonly StatusTransition<InvoiceStatus>[]

/** Дія графа рахунку: кредит-нота на підставі виставленого рахунку (ADR-0072). */
export const CREATE_CREDIT_NOTE = "creditNote"

/**
 * Коди відмов сервера для кредит-нот (ADR-0072): 422 біля кількості рядка й причини дій графа.
 * - `exceedsInvoice` — кількість рядка разом із виставленими кредит-нотами більша, ніж у рахунку.
 * - `invoiceInactive` — рахунок скасовано чи сторновано: чернетку кредит-ноти не виставити.
 * - `credited` — рахунок повністю покрито кредит-нотами: нової не зробити.
 */
export const CREDIT_NOTE_ISSUES = {
  exceedsInvoice: "exceeds_invoice",
  invoiceInactive: "invoice_inactive",
  credited: "credited",
} as const

/** Граф переходів рахунку: життєвий цикл і «Кредит-нота» — і в закритому періоді, як сторно. */
export const INVOICE_TRANSITIONS = [
  ...LIFECYCLE_TRANSITIONS,
  { id: CREATE_CREDIT_NOTE, from: ["issued"], creates: CREDIT_NOTES },
] as const satisfies readonly StatusTransition<InvoiceStatus>[]
export type InvoiceTransitionId = (typeof INVOICE_TRANSITIONS)[number]["id"]

const calendarDateSchema = z.string().refine(isCalendarDate)

/** Зв'язок, який веде сервер: `id` документа іншого ресурсу; `null` — зв'язку немає. */
const serverLinkSchema = z.string().min(1).nullable().optional()

/** Шапка документа модуля: рахунку й кредит-ноти. */
const documentShape = recordBaseSchema
  .extend({
    companyId: z.string().nullable().optional(),
    /** Номер дає сервер на проведенні (ADR-0058): у чернетки його немає. */
    number: z.string().min(1).nullable(),
    date: calendarDateSchema,
    clientId: z.string().min(1),
    clientName: z.string().trim().min(1),
    /** ISO 4217. */
    currency: z.string().length(3),
    ...discountShape,
    /** Підсумок із податком, мінорні одиниці: рахує сервер; у сторно — з мінусом. */
    total: moneyAmountSchema,
    /** Документ у валюті: курс і підсумок у базовій валюті (ADR-0071); у базовій валюті — `null`. */
    exchange: documentExchangeSchema.nullable().optional(),
    /** Постачальник — наша компанія, знімок на момент створення (ADR-0068). */
    supplier: partyDetailsSchema,
    /** Покупець — клієнт, знімок на момент створення. */
    buyer: partyDetailsSchema,
  })
  .extend(documentLifecycleSchema.shape)

/** Шапка рахунку. */
const invoiceShape = documentShape.extend({
  /** «Сплатити до». */
  dueDate: calendarDateSchema,
  /** Замовлення модуля B3, з якого виставлено рахунок (`basedOn` у потоці). */
  orderId: serverLinkSchema,
  /**
   * Сума виставлених кредит-нот рахунку в його валюті (ADR-0072): веде сервер, віддає картка, а не список.
   */
  creditedTotal: moneyAmountSchema.min(0).optional(),
})

/** Рядки й підсумки детального запису (`GET /sales-invoices/:id`): у рядку списку їх немає. */
export const invoiceDetailSchema = z.object({
  lines: z.array(savedDocumentBodyLineSchema),
  totals: documentTotalsSchema,
})
export type InvoiceDetail = z.infer<typeof invoiceDetailSchema>

/** Те, що схема запису бере з розширення проекту: нові поля й статуси. */
export interface InvoiceSchemaExtension<K extends string = string> {
  readonly fields?: readonly ExtensionField[]
  readonly statuses?: ExtensionStatusChanges<K>
}

const invoiceObject = (extension?: InvoiceSchemaExtension<InvoiceStatus>) =>
  invoiceShape.extend({
    status: statusSchema(INVOICE_STATUSES, extension?.statuses).default(
      DEFAULT_INVOICE_STATUS,
    ),
  })

/** Шапка рахунку зі статусами й полями розширення: рядок списку й шапка картки. */
export function invoiceSchemaFor(
  extension?: InvoiceSchemaExtension<InvoiceStatus>,
): z.ZodType<Invoice> {
  return extendSchema(invoiceObject(extension), extension?.fields)
}

/** Детальний запис рахунку: шапка з рядками й підсумками (відповідь `POST`, `PATCH` і `current` 409). */
export function invoiceCardSchemaFor(
  extension?: InvoiceSchemaExtension<InvoiceStatus>,
): z.ZodType<InvoiceCard> {
  return extendSchema(
    invoiceObject(extension).extend(invoiceDetailSchema.shape),
    extension?.fields,
  )
}

/** Рахунок у списку й шапці картки; `status` — ключ модуля чи розширення. */
export type Invoice = z.output<typeof invoiceShape> & {
  status: string
} & ExtensionValues
/** Рахунок із рядками й підсумками — детальний запис картки. */
export type InvoiceCard = Invoice & InvoiceDetail

/** Документ модуля для спільних частин сторінок: шапка рахунку чи кредит-ноти без своїх полів. */
export type K2Document = z.output<typeof documentShape> & {
  status: string
} & ExtensionValues

/* ------------------------------- Кредит-нота ------------------------------- */

/** Статуси кредит-ноти (ADR-0072): ті самі, що в рахунку; розширення додає свої. */
export const CREDIT_NOTE_STATUSES = INVOICE_STATUSES
export type CreditNoteStatus = InvoiceStatus
/** Граф переходів кредит-ноти: життєвий цикл документа, як у рахунку. */
export const CREDIT_NOTE_TRANSITIONS = LIFECYCLE_TRANSITIONS
export type CreditNoteTransitionId =
  (typeof CREDIT_NOTE_TRANSITIONS)[number]["id"]

/**
 * Шапка кредит-ноти: рахунок-підстава й знімки його номера й дати для списку й аркуша (кредит-ноту роблять
 * лише з виставленого рахунку, тож номер у нього є).
 */
const creditNoteShape = documentShape.extend({
  invoiceId: z.string().min(1),
  invoiceNumber: z.string().min(1),
  invoiceDate: calendarDateSchema,
})

/** Кількість, яку ще можна повернути: нуль теж буває. */
const availableSchema = z.union([z.literal("0"), quantitySchema])

/**
 * Рядок рахунку-підстави для форми кредит-ноти: кількість у рахунку, скільки з неї ще можна повернути
 * разом із цією кредит-нотою, і суми рядка рахунку — з них форма рахує частку, як сервер.
 */
export const creditNoteBasisSchema = z.object({
  quantity: quantitySchema,
  available: availableSchema,
  totals: savedDocumentLineSchema.shape.totals,
})
export type CreditNoteBasis = z.infer<typeof creditNoteBasisSchema>

/**
 * Рядки й підсумки кредит-ноти (`GET /sales-credit-notes/:id`): лише рядки товарів, `id` рядка — `id` рядка
 * рахунку; `basis` за `id` рядка — лише в чернетці.
 */
export const creditNoteDetailSchema = z.object({
  lines: z.array(savedDocumentLineSchema),
  totals: documentTotalsSchema,
  basis: z.record(z.string(), creditNoteBasisSchema).optional(),
})
export type CreditNoteDetail = z.infer<typeof creditNoteDetailSchema>

const creditNoteObject = (
  extension?: InvoiceSchemaExtension<CreditNoteStatus>,
) =>
  creditNoteShape.extend({
    status: statusSchema(CREDIT_NOTE_STATUSES, extension?.statuses).default(
      DEFAULT_INVOICE_STATUS,
    ),
  })

/** Шапка кредит-ноти зі статусами й полями розширення: рядок списку й шапка картки. */
export function creditNoteSchemaFor(
  extension?: InvoiceSchemaExtension<CreditNoteStatus>,
): z.ZodType<CreditNote> {
  return extendSchema(creditNoteObject(extension), extension?.fields)
}

/** Детальний запис кредит-ноти: шапка з рядками, підсумками й рядками рахунку для форми. */
export function creditNoteCardSchemaFor(
  extension?: InvoiceSchemaExtension<CreditNoteStatus>,
): z.ZodType<CreditNoteCard> {
  return extendSchema(
    creditNoteObject(extension).extend(creditNoteDetailSchema.shape),
    extension?.fields,
  )
}

/** Кредит-нота в списку й шапці картки. */
export type CreditNote = z.output<typeof creditNoteShape> & {
  status: string
} & ExtensionValues
/** Кредит-нота з рядками й підсумками — детальний запис картки. */
export type CreditNoteCard = CreditNote & CreditNoteDetail
