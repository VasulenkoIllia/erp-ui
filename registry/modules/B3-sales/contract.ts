/**
 * Контракт модуля B3 «Пропозиції й замовлення», частина «Пропозиції» (SPEC §14, §17; ADR-0056…ADR-0062,
 * ADR-0065).
 *
 * Ресурс `quotes` (`/api/v1/quotes`, плоскі параметри списку, відповідь `{ data, total }`):
 * - Список віддає шапку без рядків; `GET /quotes/:id`, `POST` і `PATCH` — детальний запис із рядками
 *   `lines` (`savedDocumentBodyLineSchema`) і підсумками `totals` (`documentTotalsSchema`, ADR-0019).
 *   `total` шапки — підсумок із податком для списку; рахує його сервер, як і суми рядків.
 * - Клієнт — запис ресурсу, який назве проект (за замовчуванням `organizations` модуля B1):
 *   `clientId` і знімок назви `clientName`, як знімки одиниці й податку в рядку (ADR-0056). Знімок
 *   надсилає форма; сервер може перевірити його за `clientId` і перезаписати. Чужий чи невидимий
 *   клієнт — 422 `clientId: invalid`.
 * - Валюта — базова валюта компанії на момент створення; зміна валюти пропозиції не передбачена.
 * - Дата `date` і строк `validUntil` — календарні дні `YYYY-MM-DD`; строк не раніше дати — інакше 422
 *   `validUntil: before_date`. Окремого статусу «Термін минув» немає (рішення власника 08.11.2026):
 *   минулий строк надісланої пропозиції інтерфейс показує позначкою.
 * - Життєвий цикл кіта (ADR-0057): `docStatus` поруч зі статусом модуля, дія — `POST /quotes/:id/<дія>`
 *   з `version` і причиною. «Надіслати» (`submit`) — проведення: номер серії `quotes` дає сервер
 *   (ADR-0058), у чернетки й виправленої копії `number: null`. Проведена й скасована пропозиція не
 *   змінюється (`deniedActions.update`); змінити надіслану — «Скасувати» з причиною й «Виправити»
 *   (нова чернетка `amendedFrom`).
 * - Права — `quotes:<дія>`: `read`, `create`, `update` і дії графа (`submit`, `accept`, `decline`,
 *   `cancel`, `amend`) та дії розширення проекту.
 *
 * Створення — `POST` шапки, рядків і знижки документа; зміна — `PATCH` змінених полів з `version`:
 * рядки — завжди всім масивом (`lines`), як колекції B1 (ADR-0028). Помилки рядка — 422 `fieldErrors`
 * з шляхом `lines.<індекс>.<поле>`.
 *
 * Поля й статуси розширення проекту (ADR-0020) входять у схему через `quoteSchemaFor`: без них zod
 * відкинув би нові поля відповіді. Ця ж схема розбирає `current` конфлікту 409 у формі.
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

export { QUOTES, SALES_RESOURCES } from "./resources"

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

/**
 * Граф переходів модуля (ADR-0057): основна дія статусу — першою. «Надіслати» — проведення з номером;
 * відповідь клієнта — «Прийнято» чи «Відхилено» (причина за бажанням); «Скасувати» з причиною — і
 * для прийнятої, щоб виправити її; «Виправити» — нова чернетка зі скасованої.
 */
export const QUOTE_TRANSITIONS = [
  { id: "submit", from: ["draft"], to: "sent" },
  { id: "accept", from: ["sent"], to: "accepted" },
  { id: "decline", from: ["sent"], to: "declined", reason: "optional" },
  {
    id: "cancel",
    from: ["sent", "accepted", "declined"],
    to: "cancelled",
    reason: "required",
  },
  { id: "amend", from: ["cancelled"] },
] as const satisfies readonly StatusTransition<QuoteStatus>[]
export type QuoteTransitionId = (typeof QUOTE_TRANSITIONS)[number]["id"]

const calendarDateSchema = z.string().refine(isCalendarDate)

const quoteShape = recordBaseSchema
  .extend({
    companyId: z.string().nullable().optional(),
    /** Номер дає сервер на «Надіслати» (ADR-0058): у чернетки його немає. */
    number: z.string().min(1).nullable(),
    date: calendarDateSchema,
    validUntil: calendarDateSchema,
    clientId: z.string().min(1),
    clientName: z.string().trim().min(1),
    /** ISO 4217. */
    currency: z.string().length(3),
    ...discountShape,
    /** Підсумок із податком, мінорні одиниці: рахує сервер. */
    total: moneyAmountSchema,
  })
  .extend(documentLifecycleSchema.shape)

/** Рядки й підсумки детального запису (`GET /quotes/:id`): у рядку списку їх немає. */
export const quoteDetailSchema = z.object({
  lines: z.array(savedDocumentBodyLineSchema),
  totals: documentTotalsSchema,
})
export type QuoteDetail = z.infer<typeof quoteDetailSchema>

/** Те, що схема запису бере з розширення проекту: нові поля й статуси. */
export interface QuoteSchemaExtension {
  readonly fields?: readonly ExtensionField[]
  readonly statuses?: ExtensionStatusChanges<QuoteStatus>
}

const quoteObject = (extension?: QuoteSchemaExtension) =>
  quoteShape.extend({
    status: statusSchema(QUOTE_STATUSES, extension?.statuses).default(
      DEFAULT_QUOTE_STATUS,
    ),
  })

/** Шапка пропозиції зі статусами й полями розширення: рядок списку й шапка картки. */
export function quoteSchemaFor(extension?: QuoteSchemaExtension) {
  return extendSchema(quoteObject(extension), extension?.fields)
}

/** Детальний запис: шапка з рядками й підсумками (відповідь `POST`, `PATCH` і `current` 409). */
export function quoteCardSchemaFor(
  extension?: QuoteSchemaExtension,
): z.ZodType<QuoteCard> {
  return extendSchema(
    quoteObject(extension).extend(quoteDetailSchema.shape),
    extension?.fields,
  )
}

/** Пропозиція в списку й шапці картки; `status` — ключ модуля чи розширення. */
export type Quote = z.output<typeof quoteShape> & {
  status: string
} & ExtensionValues
/** Пропозиція з рядками й підсумками — детальний запис картки. */
export type QuoteCard = Quote & QuoteDetail
