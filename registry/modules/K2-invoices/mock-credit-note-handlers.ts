/**
 * Обробники ресурсу кредит-нот у моках модуля K2 (ADR-0072): схема збереженої кредит-ноти, рядки рахунку для
 * форми чернетки, позначки, дії графа з номером серії `sales-credit-notes`, кредит-нота з рахунку й джерело
 * потоку. Частина `mocks.ts`: правила — `mock-credit-notes.ts`.
 *
 * - Нова кредит-нота (`version: 1`, не сторно) — чернетка без номера. Чернетка перебудовується з рахунку на
 *   кожен запис; проведена й скасована тримають свої суми; сторно — суми першої з мінусом у `total`.
 * - Обліковий документ (PF13): з `periodLock` у закритому періоді її не змінюють (422 `period_locked` біля
 *   дати), на записі — позначка на всі дії, крім сторно; виправлена копія й сторно — сьогодні чи першим
 *   відкритим днем, як у рахунку.
 */
import { z } from "zod"

import type { LocalizedText } from "@/lib/auth"
import { addDays, type CalendarDate } from "@/lib/dates"
import {
  documentTotalsSchema,
  savedDocumentLineSchema,
} from "@/lib/document-lines"
import { inheritedFieldValues, withMockValues } from "@/lib/extension-fields"
import {
  documentFlowSource,
  documentLifecycleLinks,
  type DocumentFlowMockSource,
} from "@/lib/mock-document-flow"
import {
  documentLinesText,
  LIFECYCLE_LINK_FIELDS,
  withoutServerFields,
  withTransitionSamples,
} from "@/lib/mock-documents"
import type { NumberingMocks } from "@/lib/mock-numbering"
import type { createPeriodLockMocks } from "@/lib/mock-period-lock"
import {
  createTransitionHandlers,
  documentDeniedActions,
  mockCreatedDocument,
  releaseAmendedFrom,
} from "@/lib/mock-transitions"
import { createResourceHandlers, type MockResourceDb } from "@/lib/mocks"
import { mergeTransitions } from "@/lib/statuses"

import {
  CREDIT_NOTE_TRANSITIONS,
  CREDIT_NOTES,
  creditNoteSchemaFor,
  DEFAULT_INVOICE_STATUS,
  INVOICES,
  INVOICES_RESOURCES,
  REVERSAL_STATUS,
  type CreditNote,
  type CreditNoteCard,
  type InvoiceCard,
} from "./contract"
import type { InvoicesMockExtension } from "./extension"
import {
  creditedQuantities,
  creditNoteBasis,
  creditNoteBody,
  creditNoteDeniedActions,
  creditNoteFromInvoice,
  invoiceOf,
  type CreditNoteStores,
  type Issue,
} from "./mock-credit-notes"
import { reversedExchange } from "./mock-exchange"
import { documentFlowNode } from "./mock-links"

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/** Збережені рядки й підсумки проведеної чи скасованої кредит-ноти: їх сервер уже не перераховує. */
const savedBodySchema = z.object({
  lines: z.array(savedDocumentLineSchema).min(1),
  totals: documentTotalsSchema,
})

/**
 * Збережена кредит-нота, як її перевіряє сервер: нова (`version: 1`, не сторно) — чернетка без номера;
 * чернетка перебудовується з рахунку (`creditNoteBody`), проведена й скасована — шапка за схемою й свої
 * суми; сторно — суми першої, `total` з мінусом.
 */
export function storedCreditNoteSchema(
  header: z.ZodType<CreditNote>,
  stores: CreditNoteStores,
): z.ZodType<CreditNoteCard> {
  return z.unknown().transform((input, ctx) => {
    if (!isRecord(input)) {
      ctx.addIssue({ code: "custom", path: [], message: "invalid" })
      return z.NEVER
    }
    const record =
      input.version === 1 && !input.reversalOf
        ? {
            ...input,
            number: null,
            docStatus: "draft",
            status: DEFAULT_INVOICE_STATUS,
          }
        : input
    const fail = (issues: readonly Issue[]) => {
      for (const issue of issues)
        ctx.addIssue({
          code: "custom",
          path: issue.path,
          message: issue.message,
        })
      return z.NEVER
    }
    const invoiceId =
      typeof record.invoiceId === "string" ? record.invoiceId : ""
    const invoice = invoiceOf(stores, invoiceId)
    let body: Pick<CreditNoteCard, "lines" | "totals" | "total">
    if (record.docStatus === "draft") {
      if (!invoice) return fail([{ path: ["invoiceId"], message: "not_found" }])
      const built = creditNoteBody(
        invoice,
        record.lines,
        creditedQuantities(
          stores.creditNotes(),
          invoiceId,
          typeof record.id === "string" ? record.id : undefined,
        ),
      )
      if (built.issues) return fail(built.issues)
      body = built.body
    } else {
      const saved = savedBodySchema.safeParse(record)
      if (!saved.success)
        return fail(
          saved.error.issues.map((issue) => ({
            path: issue.path.map(String),
            message: issue.message,
          })),
        )
      const sign = record.status === REVERSAL_STATUS ? -1 : 1
      body = { ...saved.data, total: saved.data.totals.total * sign || 0 }
    }
    const parsed = header.safeParse({ ...record, ...body })
    if (!parsed.success)
      return fail(
        parsed.error.issues.map((issue) => ({
          path: issue.path.map(String),
          message: issue.message,
        })),
      )
    return { ...parsed.data, lines: body.lines, totals: body.totals }
  })
}

/** Джерело потоку кредит-нот: зв'язки життєвого циклу й «На підставі» рахунку. */
export function creditNotesFlowSource(
  notes: MockResourceDb<CreditNoteCard>,
): DocumentFlowMockSource {
  return documentFlowSource({
    resource: CREDIT_NOTES,
    db: notes,
    node: documentFlowNode,
    links: (note) => [
      ...documentLifecycleLinks(CREDIT_NOTES)(note),
      { kind: "basedOn" as const, resource: INVOICES, id: note.invoiceId },
    ],
  })
}

/**
 * Поля, які сервер веде сам: виправлена копія їх не бере, а отримує нові (дата — теж). Рахунок-підставу,
 * клієнта, сторони й рядки копія бере.
 */
const SERVER_FIELDS = new Set([
  "id",
  "version",
  "companyId",
  "number",
  "status",
  "docStatus",
  ...LIFECYCLE_LINK_FIELDS,
  "total",
  "totals",
  "exchange",
  "date",
  "deniedActions",
  "pinned",
  "basis",
])

const FIELD_LABELS = {
  number: { uk: "Номер", en: "Number" },
  clientName: { uk: "Клієнт", en: "Client" },
  invoiceNumber: { uk: "Рахунок", en: "Invoice" },
  date: { uk: "Дата", en: "Date" },
  status: { uk: "Статус", en: "Status" },
  docStatus: { uk: "Стан документа", en: "Document state" },
  lines: { uk: "Рядки", en: "Lines" },
} satisfies Record<string, LocalizedText>

export interface CreditNoteHandlersOptions {
  /** Рахунки модуля: підстава кредит-ноти. */
  readonly invoices: MockResourceDb<InvoiceCard>
  /** Нумерація проекту з серією `sales-credit-notes`: номер на проведенні. */
  readonly numbering: Pick<NumberingMocks, "forResource">
  readonly extension?: InvoicesMockExtension["creditNotes"]
  readonly baseUrl?: string | undefined
  readonly periodLock?:
    Pick<ReturnType<typeof createPeriodLockMocks>, "forResource"> | undefined
  /** Дата нового документа сервера: сьогодні, а в закритому періоді — перший відкритий день. */
  readonly openDay: (companyId: string | null | undefined) => CalendarDate
  /** Засів кредит-нот (`createCreditNoteFixtures`) на кожне скидання моків. */
  readonly data: () => CreditNoteCard[]
}

export function createCreditNoteHandlers({
  invoices,
  numbering,
  extension,
  baseUrl,
  periodLock,
  openDay,
  data,
}: CreditNoteHandlersOptions) {
  const transitions = mergeTransitions(
    CREDIT_NOTE_TRANSITIONS,
    extension?.transitions,
  )
  const lock = periodLock?.forResource<CreditNoteCard>({
    resource: CREDIT_NOTES,
    dateField: "date",
    actions: transitions.map((transition) => transition.id),
  })
  const stores: CreditNoteStores = {
    invoices,
    creditNotes: () => notes.db.all(),
  }
  const notes = createResourceHandlers<CreditNoteCard>({
    resource: CREDIT_NOTES,
    baseUrl,
    schema: storedCreditNoteSchema(creditNoteSchemaFor(extension), stores),
    data: () =>
      withMockValues(
        withTransitionSamples(
          data(),
          extension?.statuses,
          extension?.transitions,
        ),
        extension?.fields,
      ),
    searchFields: ["number", "clientName", "invoiceNumber"],
    titleField: "clientName",
    label: INVOICES_RESOURCES.find(({ name }) => name === CREDIT_NOTES)?.label,
    fieldLabels: FIELD_LABELS,
    detailFields: ["lines", "totals"],
    detail: (note) => {
      const basis = creditNoteBasis(note, stores)
      return basis ? { basis } : {}
    },
    // Рахунок, клієнта, сторони, валюту й знижку чернетка бере з рахунку: з тіла запиту — лише дата й рядки.
    serverFields: [
      ...LIFECYCLE_LINK_FIELDS,
      "invoiceId",
      "invoiceNumber",
      "invoiceDate",
      "clientId",
      "clientName",
      "currency",
      "supplier",
      "buyer",
      "exchange",
      "discountPercent",
      "discountAmount",
    ],
    auditValue: { lines: documentLinesText },
    // Видалена виправлена копія звільняє скасовану кредит-ноту.
    afterDelete: (note) => {
      releaseAmendedFrom(notes.db, note)
    },
    // Причини життєвого циклу важливіші: закритий період додає лише дії, яких ще ніщо не забороняє.
    deniedActions: (actor, note) => {
      const denied = {
        ...lock?.deniedActions(actor, note),
        ...creditNoteDeniedActions(note, stores),
        ...documentDeniedActions(note),
      }
      return Object.keys(denied).length ? denied : undefined
    },
    ...(lock
      ? { validateWrite: lock.validateWrite, afterWrite: lock.afterWrite }
      : {}),
  })
  const transitionHandlers = createTransitionHandlers<CreditNoteCard>({
    resource: CREDIT_NOTES,
    baseUrl,
    db: notes.db,
    transitions,
    // Колега в сценарії `conflict` переносить дату на день пізніше.
    conflictChange: (note) => ({ date: addDays(note.date, 1) }),
    // Виправлена копія — нова чернетка з тим самим рахунком і рядками: кількість перевірять заново.
    amend: (note) => ({
      ...withoutServerFields(note, SERVER_FIELDS),
      date: openDay(note.companyId),
      status: DEFAULT_INVOICE_STATUS,
    }),
    // Сторно — ті самі рядки й суми, `total` з мінусом; курс — першої кредит-ноти.
    reverse: (note) => ({
      ...withoutServerFields(note, SERVER_FIELDS),
      lines: note.lines,
      totals: note.totals,
      date: openDay(note.companyId),
      status: REVERSAL_STATUS,
      exchange: reversedExchange(note.exchange),
    }),
    numbering: numbering.forResource({ resource: CREDIT_NOTES, db: notes.db }),
    // «Виставити» рахує суми ще раз: за час чернетки могли виставити інші кредит-ноти рахунку.
    submitFields: (note) => {
      const invoice = invoiceOf(stores, note.invoiceId)
      if (!invoice) return {}
      const built = creditNoteBody(
        invoice,
        note.lines,
        creditedQuantities(stores.creditNotes(), note.invoiceId, note.id),
      )
      return built.issues ? {} : built.body
    },
    ...(lock ? { afterTransition: lock.afterTransition } : {}),
  })
  return {
    // Дії — перед ресурсом: `POST /sales-credit-notes/:id/<дія>` не має дійти до обробників запису.
    handlers: [...transitionHandlers, ...notes.handlers],
    db: notes.db,
    /** Кредит-нота-чернетка з рахунку: дія `creditNote` графа рахунку (`creates`). */
    fromInvoice: mockCreatedDocument<InvoiceCard, CreditNoteCard>({
      resource: CREDIT_NOTES,
      db: notes.db,
      body: (invoice) => ({
        ...inheritedFieldValues(invoice, extension?.fields),
        ...creditNoteFromInvoice(
          invoice,
          notes.db.all(),
          openDay(invoice.companyId),
        ),
      }),
    }),
    flowSource: creditNotesFlowSource(notes.db),
  }
}
