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
 * - Потік документів (ADR-0061): `GET /sales-invoices/:id/flow`, зв'язки `basedOn` (замовлення),
 *   `amendedFrom`, `reversalOf`.
 * - Права — `sales-invoices:<дія>`: `read`, `create`, `update`, `delete`, `submit`, `cancel`, `reverse`,
 *   `amend` і дії розширення.
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
  savedDocumentBodyLineSchema,
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

export { INVOICES, INVOICES_RESOURCES } from "./resources"

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
 * Граф переходів рахунку (ADR-0057, ADR-0069): «Виставити» — проведення з номером; «Скасувати» з причиною й
 * «Виправити» скасований — помилку у відкритому періоді; «Сторнувати» з причиною — і в закритому: сторно
 * датується сьогодні.
 */
export const INVOICE_TRANSITIONS = [
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
export type InvoiceTransitionId = (typeof INVOICE_TRANSITIONS)[number]["id"]

const calendarDateSchema = z.string().refine(isCalendarDate)

/** Зв'язок, який веде сервер: `id` документа іншого ресурсу; `null` — зв'язку немає. */
const serverLinkSchema = z.string().min(1).nullable().optional()

/** Шапка рахунку. */
const invoiceShape = recordBaseSchema
  .extend({
    companyId: z.string().nullable().optional(),
    /** Номер дає сервер на проведенні (ADR-0058): у чернетки його немає. */
    number: z.string().min(1).nullable(),
    date: calendarDateSchema,
    /** «Сплатити до». */
    dueDate: calendarDateSchema,
    clientId: z.string().min(1),
    clientName: z.string().trim().min(1),
    /** ISO 4217. */
    currency: z.string().length(3),
    ...discountShape,
    /** Підсумок із податком, мінорні одиниці: рахує сервер; у сторно — з мінусом. */
    total: moneyAmountSchema,
    /** Рахунок у валюті: курс і підсумок у базовій валюті (ADR-0071); у базовій валюті — `null`. */
    exchange: documentExchangeSchema.nullable().optional(),
    /** Постачальник — наша компанія, знімок на момент створення (ADR-0068). */
    supplier: partyDetailsSchema,
    /** Покупець — клієнт, знімок на момент створення. */
    buyer: partyDetailsSchema,
    /** Замовлення модуля B3, з якого виставлено рахунок (`basedOn` у потоці). */
    orderId: serverLinkSchema,
  })
  .extend(documentLifecycleSchema.shape)

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
