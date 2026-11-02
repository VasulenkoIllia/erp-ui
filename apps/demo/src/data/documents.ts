import { z } from "zod"

import { moneyAmountSchema, recordBaseSchema } from "@/registry/lib/api"
import { documentLifecycleSchema } from "@/registry/lib/document-lifecycle"
import type { DocumentState } from "@/registry/lib/document-lifecycle"
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
    number: z.string().min(1),
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

/** Документи першої компанії демо: інша компанія їх не бачить, як і решту даних (ADR-0036). */
export function makeDocuments(): DemoDocument[] {
  const companyId = COMPANIES[0].id
  return SEEDS.map(({ id, links, ...seed }, index) =>
    documentSchema.parse({
      id,
      version: 1,
      companyId,
      number: `ДОК-${String(index + 1).padStart(4, "0")}`,
      date: isoDay(-index * 3),
      dueDate: isoDay(14 - index * 3),
      currency: "UAH",
      ...seed,
      ...links,
    }),
  )
}

/** Виправлена копія: нова чернетка з тими самими даними й номером із суфіксом. */
export const amendDocument = (document: DemoDocument) => ({
  number: `${document.number}-1`,
  client: document.client,
  date: isoDay(0),
  dueDate: document.dueDate,
  amount: document.amount,
  currency: document.currency,
  status: "draft",
})

/** Сторно: проведений документ із тією самою сумою з мінусом сьогоднішньою датою. */
export const reverseDocument = (document: DemoDocument) => ({
  number: `${document.number}-С`,
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
