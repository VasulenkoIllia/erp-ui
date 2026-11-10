/**
 * Контракт модуля B3 «Пропозиції й замовлення» (SPEC §14, §17; ADR-0056…ADR-0062, ADR-0065, ADR-0067).
 *
 * Ресурси `quotes` і `orders` (`/api/v1/<ресурс>`, плоскі параметри списку, відповідь `{ data, total }`)
 * мають спільну шапку документа продажу й відрізняються другою датою, статусами й графом дій:
 * - Список віддає шапку без рядків; `GET /<ресурс>/:id`, `POST` і `PATCH` — детальний запис із рядками
 *   `lines` (`savedDocumentBodyLineSchema`) і підсумками `totals` (`documentTotalsSchema`, ADR-0019).
 *   `total` шапки — підсумок із податком для списку; рахує його сервер, як і суми рядків.
 * - Клієнт — запис ресурсу, який назве проект (за замовчуванням `organizations` модуля B1):
 *   `clientId` і знімок назви `clientName`, як знімки одиниці й податку в рядку (ADR-0056). Знімок
 *   надсилає форма; сервер може перевірити його за `clientId` і перезаписати. Чужий чи невидимий
 *   клієнт — 422 `clientId: invalid`.
 * - Валюта — базова валюта компанії на момент створення; зміна валюти документа не передбачена.
 * - Дата `date` і друга дата — календарні дні `YYYY-MM-DD`; друга дата не раніше `date`, інакше 422
 *   `before_date`. Пропозиція — «Дійсна до» (`validUntil`), замовлення — «Виконати до» (`dueDate`).
 *   Окремого статусу «Термін минув» чи «Прострочено» немає (рішення власника 08.11.2026): минулу дату
 *   документа, що чекає (надіслана пропозиція, підтверджене замовлення), інтерфейс показує позначкою.
 * - Життєвий цикл кіта (ADR-0057): `docStatus` поруч зі статусом модуля, дія — `POST /<ресурс>/:id/<дія>`
 *   з `version` і причиною. `submit` — проведення: «Надіслати» пропозицію, «Підтвердити» замовлення;
 *   номер серії ресурсу дає сервер (ADR-0058), у чернетки й виправленої копії `number: null`. Проведений
 *   і скасований документ не змінюється (`deniedActions.update`); змінити — «Скасувати» з причиною й
 *   «Виправити» (нова чернетка `amendedFrom`).
 * - Видалити можна лише чернетку (`DELETE /<ресурс>/:id`, право `<ресурс>:delete`): у проведеної й
 *   скасованої `deniedActions.delete` (`submitted`, `cancelled`). Видалена виправлена копія звільняє
 *   скасовану: її можна виправити знову (ADR-0066).
 * - Масові дії (`lib/jobs`, ADR-0018, ADR-0066): `POST /<ресурс>/bulk/<дія>` з вибором → 202 `{ jobId }`.
 *   Дії графа — над кожним документом у його поточній версії; `cancel` — з `reason`, одна на всі, без неї
 *   422 `fieldErrors.reason = "required"`. `delete` — видалення чернеток. Невдачі групами:
 *   `transition_not_allowed` (статус не той), `submitted` і `cancelled` (не чернетка), коди API; у групі
 *   — номер, у чернетки — клієнт.
 * - Права — `<ресурс>:<дія>`: `read`, `create`, `update`, `delete`, дії графа модуля й розширення.
 * - Замовлення з пропозиції (ADR-0067, доповнення B3b2): `POST /quotes/:id/order` з `version` з
 *   прийнятої пропозиції → 201 нове замовлення-чернетка з клієнтом, рядками й знижкою пропозиції.
 *   Право — `quotes:order` і `orders:create` (403). Зв'язок зберігає сервер: `quoteId` замовлення
 *   (`basedOn` у потоці) і `orderId` пропозиції; клієнт їх не надсилає. Пропозиція лишається
 *   «Прийнято». Повторно — 403 з позначкою `deniedActions.order = "linked"`: друге замовлення не
 *   створюється. Видалена чернетка замовлення звільняє пропозицію (`orderId: null`). Виправлена копія
 *   скасованого замовлення бере `quoteId` першого.
 * - Прийняту пропозицію, з якої є нескасоване замовлення, не скасовують: `deniedActions.cancel =
 *   "linked"`, і масове «Скасувати» дає невдачу з цим кодом. Спершу скасувати чи видалити замовлення.
 * - Рахунок із замовлення (ADR-0070), коли проект підключив модуль K2: `POST /orders/:id/invoice` з
 *   `version` з підтвердженого чи виконаного замовлення → 201 рахунок-чернетка ресурсу `sales-invoices` з
 *   клієнтом, рядками й знижкою замовлення, датою сьогодні. Право — `orders:invoice` і
 *   `sales-invoices:create`. Зв'язок веде сервер: `orderId` рахунку й `invoiceId` замовлення. Один рахунок
 *   на замовлення (рішення власника 10.11.2026): повторно — 403 `deniedActions.invoice = "linked"`; поки є
 *   рахунок, який не скасовано й не сторновано, замовлення не скасовують (`cancel: "linked"`). Видалена
 *   чернетка рахунку звільняє замовлення.
 * - Документ на підставі (замовлення з пропозиції, рахунок із замовлення) бере поля розширення джерела з
 *   тим самим ключем, якщо значення проходить схему поля нового документа (рішення власника 10.11.2026,
 *   `inheritedFieldValues` з `lib/extension-fields`).
 * - Потік документів (ADR-0061): `GET /<ресурс>/:id/flow` — пропозиції, потім замовлення; зв'язок
 *   замовлення з пропозицією — `basedOn`, виправленої копії — `amendedFrom`.
 *
 * Створення — `POST` шапки, рядків і знижки документа; зміна — `PATCH` змінених полів з `version`:
 * рядки — завжди всім масивом (`lines`), як колекції B1 (ADR-0028). Помилки рядка — 422 `fieldErrors`
 * з шляхом `lines.<індекс>.<поле>`.
 *
 * Поля й статуси розширення проекту (ADR-0020) входять у схему через `quoteSchemaFor` і
 * `orderSchemaFor`: без них zod відкинув би нові поля відповіді. Ця ж схема розбирає `current`
 * конфлікту 409 у формі.
 */
import { z } from "zod"

import { moneyAmountSchema, recordBaseSchema } from "@/lib/api"
import { isCalendarDate } from "@/lib/dates"
import { documentLifecycleSchema } from "@/lib/document-lifecycle"
import {
  discountShape,
  documentTotalsSchema,
  savedDocumentBodyLineSchema,
} from "@/lib/document-lines"
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

import { ORDERS, SALES_INVOICES } from "./resources"

export { ORDERS, QUOTES, SALES_INVOICES, SALES_RESOURCES } from "./resources"

/** Статуси пропозиції модуля (рішення власника 08.11.2026); розширення додає свої (`statuses`). */
export const QUOTE_STATUSES = [
  "draft",
  "sent",
  "accepted",
  "declined",
  "cancelled",
] as const
export type QuoteStatus = (typeof QUOTE_STATUSES)[number]
/** Статус нової пропозиції: її створюють чернеткою. */
export const DEFAULT_QUOTE_STATUS: QuoteStatus = "draft"
/** Статуси, у яких пропозиція чекає відповіді клієнта: тут минулий строк — позначка «Термін минув». */
export const AWAITING_REPLY: readonly string[] = ["sent"]

/** Дія пропозиції «Створити замовлення»: шлях `POST /quotes/:id/order`, право `quotes:order`. */
export const CREATE_ORDER = "order"

/**
 * Граф переходів пропозиції (ADR-0057): основна дія статусу — першою. «Надіслати» — проведення з
 * номером; відповідь клієнта — «Прийнято» чи «Відхилено» (причина за бажанням); з прийнятої —
 * «Створити замовлення» (статус не змінюється, ADR-0067); «Скасувати» з причиною — і для прийнятої,
 * щоб виправити її; «Виправити» — нова чернетка зі скасованої.
 */
export const QUOTE_TRANSITIONS = [
  { id: "submit", from: ["draft"], to: "sent" },
  { id: "accept", from: ["sent"], to: "accepted" },
  { id: "decline", from: ["sent"], to: "declined", reason: "optional" },
  { id: CREATE_ORDER, from: ["accepted"], creates: ORDERS },
  {
    id: "cancel",
    from: ["sent", "accepted", "declined"],
    to: "cancelled",
    reason: "required",
  },
  { id: "amend", from: ["cancelled"] },
] as const satisfies readonly StatusTransition<QuoteStatus>[]
export type QuoteTransitionId = (typeof QUOTE_TRANSITIONS)[number]["id"]

/** Статуси замовлення модуля (рішення власника 08.11.2026); розширення додає свої (`statuses`). */
export const ORDER_STATUSES = [
  "draft",
  "confirmed",
  "completed",
  "cancelled",
] as const
export type OrderStatus = (typeof ORDER_STATUSES)[number]
/** Статус нового замовлення: його створюють чернеткою. */
export const DEFAULT_ORDER_STATUS: OrderStatus = "draft"
/** Статуси, у яких замовлення ще виконують: тут минула «Виконати до» — позначка «Прострочено». */
export const AWAITING_COMPLETION: readonly string[] = ["confirmed"]

/**
 * Дія замовлення «Виставити рахунок» (ADR-0070): шлях `POST /orders/:id/invoice`, право `orders:invoice` і
 * `sales-invoices:create`. Є в графі, лише коли проект підключив рахунки (`invoices` фабрики й моків).
 */
export const CREATE_INVOICE = "invoice"

/**
 * Граф переходів замовлення (ADR-0057, ADR-0067, ADR-0070): «Підтвердити» — проведення з номером серії
 * `orders`; «Позначити виконаним» з підтвердженого; «Виставити рахунок» з підтвердженого й виконаного
 * (статус не змінюється); «Скасувати» з причиною — і для виконаного, щоб виправити помилку; «Виправити» —
 * нова чернетка зі скасованого.
 */
export const ORDER_TRANSITIONS = [
  { id: "submit", from: ["draft"], to: "confirmed" },
  { id: "complete", from: ["confirmed"], to: "completed" },
  {
    id: CREATE_INVOICE,
    from: ["confirmed", "completed"],
    creates: SALES_INVOICES,
  },
  {
    id: "cancel",
    from: ["confirmed", "completed"],
    to: "cancelled",
    reason: "required",
  },
  { id: "amend", from: ["cancelled"] },
] as const satisfies readonly StatusTransition<OrderStatus>[]
export type OrderTransitionId = (typeof ORDER_TRANSITIONS)[number]["id"]

const calendarDateSchema = z.string().refine(isCalendarDate)

/** Шапка документа продажу: спільна для пропозиції й замовлення. */
const salesDocumentShape = recordBaseSchema
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
    /** Підсумок із податком, мінорні одиниці: рахує сервер. */
    total: moneyAmountSchema,
  })
  .extend(documentLifecycleSchema.shape)

/** Зв'язок, який веде сервер: `id` документа іншого ресурсу; `null` — зв'язку немає. */
const serverLinkSchema = z.string().min(1).nullable().optional()

const quoteShape = salesDocumentShape.extend({
  validUntil: calendarDateSchema,
  /** Замовлення, створене з пропозиції (`POST /quotes/:id/order`). */
  orderId: serverLinkSchema,
})
const orderShape = salesDocumentShape.extend({
  dueDate: calendarDateSchema,
  /** Пропозиція, на підставі якої створено замовлення (`basedOn` у потоці). */
  quoteId: serverLinkSchema,
  /** Рахунок, виставлений із замовлення (`POST /orders/:id/invoice`, ADR-0070). */
  invoiceId: serverLinkSchema,
})

/** Рядки й підсумки детального запису (`GET /<ресурс>/:id`): у рядку списку їх немає. */
export const salesDetailSchema = z.object({
  lines: z.array(savedDocumentBodyLineSchema),
  totals: documentTotalsSchema,
})
export type SalesDocumentDetail = z.infer<typeof salesDetailSchema>
/** Рядки й підсумки пропозиції. */
export const quoteDetailSchema = salesDetailSchema
export type QuoteDetail = SalesDocumentDetail
export type OrderDetail = SalesDocumentDetail

/** Те, що схема запису бере з розширення проекту: нові поля й статуси. */
export interface SalesSchemaExtension<K extends string = string> {
  readonly fields?: readonly ExtensionField[]
  readonly statuses?: ExtensionStatusChanges<K>
}
export type QuoteSchemaExtension = SalesSchemaExtension<QuoteStatus>
export type OrderSchemaExtension = SalesSchemaExtension<OrderStatus>

const quoteObject = (extension?: QuoteSchemaExtension) =>
  quoteShape.extend({
    status: statusSchema(QUOTE_STATUSES, extension?.statuses).default(
      DEFAULT_QUOTE_STATUS,
    ),
  })

const orderObject = (extension?: OrderSchemaExtension) =>
  orderShape.extend({
    status: statusSchema(ORDER_STATUSES, extension?.statuses).default(
      DEFAULT_ORDER_STATUS,
    ),
  })

/** Шапка пропозиції зі статусами й полями розширення: рядок списку й шапка картки. */
export function quoteSchemaFor(
  extension?: QuoteSchemaExtension,
): z.ZodType<Quote> {
  return extendSchema(quoteObject(extension), extension?.fields)
}

/** Детальний запис пропозиції: шапка з рядками й підсумками (відповідь `POST`, `PATCH` і `current` 409). */
export function quoteCardSchemaFor(
  extension?: QuoteSchemaExtension,
): z.ZodType<QuoteCard> {
  return extendSchema(
    quoteObject(extension).extend(salesDetailSchema.shape),
    extension?.fields,
  )
}

/** Шапка замовлення зі статусами й полями розширення: рядок списку й шапка картки. */
export function orderSchemaFor(
  extension?: OrderSchemaExtension,
): z.ZodType<Order> {
  return extendSchema(orderObject(extension), extension?.fields)
}

/** Детальний запис замовлення: шапка з рядками й підсумками. */
export function orderCardSchemaFor(
  extension?: OrderSchemaExtension,
): z.ZodType<OrderCard> {
  return extendSchema(
    orderObject(extension).extend(salesDetailSchema.shape),
    extension?.fields,
  )
}

/** Документ продажу в списку й шапці картки; `status` — ключ модуля чи розширення. */
export type SalesDocument = z.output<typeof salesDocumentShape> & {
  status: string
} & ExtensionValues
/** Пропозиція в списку й шапці картки. */
export type Quote = SalesDocument &
  Pick<z.output<typeof quoteShape>, "validUntil" | "orderId">
/** Пропозиція з рядками й підсумками — детальний запис картки. */
export type QuoteCard = Quote & QuoteDetail
/** Замовлення в списку й шапці картки. */
export type Order = SalesDocument &
  Pick<z.output<typeof orderShape>, "dueDate" | "quoteId" | "invoiceId">
/** Замовлення з рядками й підсумками — детальний запис картки. */
export type OrderCard = Order & OrderDetail
