import { z } from "zod"

import { moneyAmountSchema, recordBaseSchema } from "@/registry/lib/api"
import { documentLifecycleSchema } from "@/registry/lib/document-lifecycle"
import type { DocumentState } from "@/registry/lib/document-lifecycle"
import { formatDocumentNumber } from "@/registry/lib/numbering"
import type { StatusTransition } from "@/registry/lib/statuses"

import { COMPANIES } from "@/fixtures"

/**
 * Документи сторінки «Документ» (PF03, ADR-0057): життєвий цикл і граф переходів, як їх матиме модуль
 * документів. Статус — справа модуля, `docStatus` — кіта: «Оплачено» теж проведений документ.
 */
export const DOCUMENT_STATUSES = [
  "draft",
  "submitted",
  "paid",
  "cancelled",
  "reversed",
] as const
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number]

/**
 * Граф «модуля»: основна дія статусу — першою. Скасувати й сторнувати — з причиною; оплачений документ
 * сторнують, а скасувати не дає позначка `linked` (є проведена оплата).
 */
export const DOCUMENT_TRANSITIONS = [
  { id: "submit", from: ["draft"], to: "submitted" },
  { id: "markPaid", from: ["submitted"], to: "paid" },
  {
    id: "cancel",
    from: ["submitted", "paid"],
    to: "cancelled",
    reason: "required",
  },
  {
    id: "reverse",
    from: ["submitted", "paid"],
    to: "reversed",
    reason: "required",
  },
  { id: "amend", from: ["cancelled"] },
] as const satisfies readonly StatusTransition<DocumentStatus>[]
export type DocumentTransitionId = (typeof DOCUMENT_TRANSITIONS)[number]["id"]

export const documentSchema = recordBaseSchema
  .extend({
    companyId: z.string().nullable().optional(),
    // Номер дає сервер на проведенні (ADR-0058): у чернетки його немає.
    number: z.string().min(1).nullable(),
    client: z.string().min(1),
    date: z.string(),
    dueDate: z.string(),
    amount: moneyAmountSchema,
    currency: z.string().length(3),
    // Рядок, а не enum: статус розширення проекту (`review`) теж дійсний.
    status: z.string().min(1),
  })
  .extend(documentLifecycleSchema.shape)
export type DemoDocument = z.infer<typeof documentSchema>

const DAY_MS = 86_400_000
const isoDay = (offsetDays: number) =>
  new Date(Date.UTC(2026, 10, 2) + offsetDays * DAY_MS)
    .toISOString()
    .slice(0, 10)

interface Seed {
  readonly id: string
  readonly client: string
  readonly amount: number
  readonly status: DocumentStatus
  readonly docStatus: DocumentState
  readonly links?: Partial<
    Pick<
      DemoDocument,
      "amendedFrom" | "amendedBy" | "reversalOf" | "reversedBy"
    >
  >
}

const SEEDS: readonly Seed[] = [
  {
    id: "doc-1",
    client: "ТОВ «Зелена долина»",
    amount: 1_440_000,
    status: "draft",
    docStatus: "draft",
  },
  {
    id: "doc-2",
    client: "ФОП Ткаченко О. В.",
    amount: 360_000,
    status: "submitted",
    docStatus: "submitted",
  },
  {
    id: "doc-3",
    client: "ТОВ «Сонячний берег»",
    amount: 2_100_000,
    status: "paid",
    docStatus: "submitted",
  },
  {
    id: "doc-4",
    client: "ПП «Будмайстер»",
    amount: 540_000,
    status: "cancelled",
    docStatus: "cancelled",
  },
  {
    id: "doc-5",
    client: "ТОВ «Річкова гавань»",
    amount: 875_000,
    status: "cancelled",
    docStatus: "cancelled",
    links: { amendedBy: "doc-6" },
  },
  {
    id: "doc-6",
    client: "ТОВ «Річкова гавань»",
    amount: 857_000,
    status: "draft",
    docStatus: "draft",
    links: { amendedFrom: "doc-5" },
  },
  {
    id: "doc-7",
    client: "ТОВ «Північний вітер»",
    amount: 1_200_000,
    status: "reversed",
    docStatus: "submitted",
    links: { reversedBy: "doc-8" },
  },
  {
    id: "doc-8",
    client: "ТОВ «Північний вітер»",
    amount: -1_200_000,
    status: "submitted",
    docStatus: "submitted",
    links: { reversalOf: "doc-7" },
  },
]

/** Шаблон серії документів демо (ADR-0058): «ДОК-2026-0001», з 1 щороку. */
export const DOCUMENT_NUMBER_TEMPLATE = "ДОК-{YYYY}-{####}"

/** Номери, які засів уже видав: проведені й скасовані документи, у порядку засіву. */
export const DOCUMENT_NUMBERS_ISSUED = SEEDS.filter(
  (seed) => seed.docStatus !== "draft",
).length
/** Рік дати документів засіву: лічильник цього року вже видав `DOCUMENT_NUMBERS_ISSUED`. */
export const DOCUMENT_SEED_YEAR = Number(isoDay(0).slice(0, 4))

/** Документи першої компанії демо: інша компанія їх не бачить, як і решту даних (ADR-0036). */
export function makeDocuments(): DemoDocument[] {
  const companyId = COMPANIES[0].id
  let issued = 0
  return SEEDS.map(({ id, links, ...seed }, index) => {
    const date = isoDay(-index * 3)
    const number =
      seed.docStatus === "draft"
        ? null
        : formatDocumentNumber(DOCUMENT_NUMBER_TEMPLATE, {
            date,
            value: (issued += 1),
          })
    return documentSchema.parse({
      id,
      version: 1,
      companyId,
      number,
      date,
      dueDate: isoDay(14 - index * 3),
      currency: "UAH",
      ...seed,
      ...links,
    })
  })
}

/** Виправлена копія: нова чернетка з тими самими даними; номер дасть проведення. */
export const amendDocument = (document: DemoDocument) => ({
  client: document.client,
  date: isoDay(0),
  dueDate: document.dueDate,
  amount: document.amount,
  currency: document.currency,
  status: "draft",
})

/** Сторно: проведений документ із тією самою сумою з мінусом сьогоднішньою датою; номер — наступний у серії. */
export const reverseDocument = (document: DemoDocument) => ({
  client: document.client,
  date: isoDay(0),
  dueDate: isoDay(0),
  amount: -document.amount,
  currency: document.currency,
  status: "submitted",
})

/** Колега в сценарії `conflict` переносить термін оплати на тиждень. */
export const colleagueDocumentChange = (document: DemoDocument) => ({
  dueDate: new Date(Date.parse(document.dueDate) + 7 * DAY_MS)
    .toISOString()
    .slice(0, 10),
})
