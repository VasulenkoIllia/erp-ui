/**
 * Документ із рядками в моках модуля (ADR-0056, ADR-0057, ADR-0070): як «сервер» перевіряє й зберігає
 * документ, який засів дає статусам розширення й як журнал показує рядки. Беруть моки пропозицій,
 * замовлень і рахунків (`createResourceHandlers` з `lib/mocks`); перенесено з модуля B3 (рішення власника
 * 10.11.2026).
 *
 * - `storedDocumentSchema` — схема збереженого документа: шапка за схемою ресурсу, рядки й знижка за
 *   знаками валюти, друга дата не раніше дати (422 `before_date`), суми рахує сам (`documentSumsOf`): `total`
 *   і `totals` із запиту не беруться. Новий документ — чернетка без номера.
 * - `withTransitionSamples` — статус розширення з `mockEvery` у засіві: кожен N-й документ у статусі, з
 *   якого веде дія до нього.
 * - `documentLinesText` — рядки в журналі «назва × кількість», а не JSON.
 * - `withoutServerFields` — поля документа, які копія бере: без тих, що веде сервер.
 * - `LIFECYCLE_LINK_FIELDS` — зв'язки виправленої копії й сторно: поля сервера ресурсу документа.
 * - `fixtureDocumentLines` — рядки засіву документа: товари по черзі, розділи й нотатка.
 */
import { z } from "zod"

import type { CalendarDate } from "@/registry/lib/dates"
import {
  documentBodySchemaFor,
  type DocumentBodyLine,
  type DocumentLineTax,
  type DocumentLineUnit,
} from "@/registry/lib/document-lines"
import { documentSumsOf } from "@/registry/lib/document-sums"
import { currencyDigits } from "@/registry/lib/format"
import type {
  ExtensionStatusChanges,
  ExtensionTransitionChanges,
} from "@/registry/lib/statuses"

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/**
 * Зв'язки життєвого циклу (ADR-0057): їх ставить лише сервер діями `amend` і `reverse`, тож у `serverFields`
 * ресурсу документа — з тіла запиту клієнта вони не беруться.
 */
export const LIFECYCLE_LINK_FIELDS = [
  "amendedFrom",
  "amendedBy",
  "reversalOf",
  "reversedBy",
] as const

/**
 * Новий документ (`version: 1` — створення чи виправлена копія; PATCH завжди дає версію від 2) —
 * чернетка без номера: номер, стан документа й статус ставить сервер, а не запит. Сторно (`reversalOf`)
 * сервер створює проведеним із номером: клієнт цього поля не надсилає (`LIFECYCLE_LINK_FIELDS`).
 */
const asServerDraft = (record: Record<string, unknown>, status: string) =>
  record.version === 1 && !record.reversalOf
    ? { ...record, number: null, docStatus: "draft", status }
    : record

/** Помилки шапки й тіла без повторів: знижка документа є в обох схемах. */
function uniqueIssues(issues: readonly z.core.$ZodIssue[]) {
  const seen = new Set<string>()
  return issues.filter((issue) => {
    const key = `${issue.path.join(".")}:${issue.message}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * Рядкове поле, яке документ `T` справді має (без полів розширення з індексу): іншого ключа перевірка
 * типів не пропустить.
 */
export type CalendarFieldOf<T> = keyof {
  [
    K in keyof T as string extends K
      ? never
      : T[K] extends CalendarDate
        ? K
        : never
  ]: T[K]
} &
  string

/** Шапка документа, без якої «сервер» не порахує й не перевірить документ. */
interface StoredHeader {
  readonly date: CalendarDate
  readonly currency: string
}

export interface StoredDocumentOptions<T> {
  /** Статус нової чернетки модуля. */
  readonly draftStatus: string
  /** Друга дата документа («Дійсна до», «Виконати до», «Сплатити до»): не раніше дати. */
  readonly dueField: CalendarFieldOf<T>
  /**
   * Знак суми документа в списку (`total`): `-1` — документ-сторно, суми рядків і `totals` лишаються як у
   * першого документа, а `total` з мінусом. За замовчуванням `1`.
   */
  readonly totalSign?: (record: Record<string, unknown>) => 1 | -1
}

/**
 * Збережений документ, як його перевіряє сервер: шапка (схема ресурсу), рядки й знижка документа за
 * знаками валюти (`documentBodySchemaFor`), друга дата не раніше дати; суми рахує сам (`documentSumsOf`),
 * тож `total` і `totals` із запиту не беруться.
 */
export function storedDocumentSchema<
  T extends StoredHeader & {
    readonly lines: readonly DocumentBodyLine[]
    readonly total: number
  },
>(
  header: z.ZodType<StoredHeader>,
  options: StoredDocumentOptions<T>,
): z.ZodType<T> {
  const { draftStatus, dueField, totalSign } = options
  return z.unknown().transform((input, ctx) => {
    if (!isRecord(input)) {
      ctx.addIssue({ code: "custom", path: [], message: "invalid" })
      return z.NEVER
    }
    const record = asServerDraft(input, draftStatus)
    const currency = typeof record.currency === "string" ? record.currency : ""
    const body = documentBodySchemaFor(currencyDigits(currency)).safeParse(
      record,
    )
    const sums = body.success
      ? documentSumsOf({ currency, ...body.data })
      : null
    const total = sums ? sums.total * (totalSign?.(record) ?? 1) : 0
    const parsed = header.safeParse({ ...record, total })
    const issues = uniqueIssues([
      ...(body.error?.issues ?? []),
      ...(parsed.error?.issues ?? []),
    ])
    const due: unknown = parsed.success
      ? Reflect.get(parsed.data, dueField)
      : undefined
    if (parsed.success && typeof due === "string" && due < parsed.data.date)
      issues.push({
        code: "custom",
        path: [dueField],
        message: "before_date",
        input,
      })
    // Тіло за схемою, а суми не склались (межа контракту): помилка рядків, а не тихий `undefined`.
    if (body.success && !sums)
      issues.push({
        code: "custom",
        path: ["lines"],
        message: "totals_invalid",
        input,
      })
    if (!parsed.success || !sums || issues.length) {
      for (const issue of issues)
        ctx.addIssue({
          code: "custom",
          path: issue.path,
          message: issue.message,
        })
      return z.NEVER
    }
    // Шапка — за схемою ресурсу, рядки й підсумки — пораховані: це і є збережений документ `T`.
    return {
      ...parsed.data,
      lines: sums.lines,
      totals: sums.totals,
    } as unknown as T
  })
}

/**
 * Статус розширення з `mockEvery` (`lib/statuses`): кожен N-й документ засіву в статусі, з якого веде
 * дія до нього, — ніби дію вже виконали. Статус без такої дії засів не отримує: документ не стає в
 * статус поза графом.
 */
export function withTransitionSamples<T extends { readonly status: string }>(
  documents: T[],
  statuses?: ExtensionStatusChanges,
  transitions?: ExtensionTransitionChanges,
): T[] {
  const samples = (statuses?.add ?? []).flatMap((status) => {
    const from = transitions?.add?.find((action) => action.to === status.id)
      ?.from[0]
    return status.mockEvery && from
      ? [{ id: status.id, from, every: status.mockEvery }]
      : []
  })
  const seen = new Map<string, number>()
  return documents.map((document) => {
    const sample = samples.find(
      (candidate) => candidate.from === document.status,
    )
    if (!sample) return document
    const count = (seen.get(sample.id) ?? 0) + 1
    seen.set(sample.id, count)
    return count % sample.every === 0
      ? { ...document, status: sample.id }
      : document
  })
}

/** Рядки в журналі — рядками «назва × кількість», а не JSON. */
export const documentLinesText = (lines: readonly DocumentBodyLine[]) =>
  lines.map((line) =>
    line.kind === "item"
      ? `${line.name} × ${line.quantity}`
      : line.kind === "section"
        ? line.title
        : line.text,
  )

/** Поля документа без тих, що веде сервер (номер, стан, зв'язки, суми): що бере копія чи документ на підставі. */
export function withoutServerFields(
  record: object,
  serverFields: ReadonlySet<string>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).filter(([key]) => !serverFields.has(key)),
  )
}

/** Знімки довідників компанії для рядків засіву (A6): одиниця штук і годин, ставка податку. */
export interface DocumentFixtureDictionaries {
  readonly pieces: DocumentLineUnit
  readonly hours: DocumentLineUnit
  readonly vat: DocumentLineTax
}

/** Товар чи послуга засіву мовою даних; послуга — у годинах. */
export interface DocumentFixtureItem {
  readonly name: string
  readonly price: string
  readonly hours: boolean
}

/** Кожен такий рядок засіву — зі знижкою рядка. */
const DISCOUNTED_EVERY = 4
const LINE_DISCOUNT_PERCENT = 10

const nth = <T>(list: readonly T[], index: number): T => {
  const value = list[index % list.length]
  if (value === undefined) throw new Error("mock-documents: empty fixture list")
  return value
}

/**
 * Рядки засіву документа: `count` товарів по черзі від `offset`, кількість 1…3, кожен четвертий зі
 * знижкою 10%. З розділами (`sections`) — заголовок перед кожною групою, `note` — нотатка наприкінці.
 * `id` рядків — від `prefix`: рядки різних документів не збігаються.
 */
export function fixtureDocumentLines({
  prefix,
  count,
  offset,
  items,
  dictionaries,
  sections,
  note,
}: {
  prefix: string
  count: number
  offset: number
  items: readonly DocumentFixtureItem[]
  dictionaries: DocumentFixtureDictionaries
  sections?: readonly string[] | undefined
  note?: string | undefined
}): DocumentBodyLine[] {
  const lines: DocumentBodyLine[] = []
  const groupSize = sections?.length ? Math.ceil(count / sections.length) : 0
  for (let item = 0; item < count; item += 1) {
    if (sections && groupSize && item % groupSize === 0)
      lines.push({
        kind: "section",
        id: `${prefix}-s${String(item)}`,
        title: nth(sections, item / groupSize),
      })
    const product = nth(items, offset + item)
    lines.push({
      kind: "item",
      id: `${prefix}-l${String(item)}`,
      name: product.name,
      itemId: null,
      quantity: String((item % 3) + 1),
      unit: product.hours ? dictionaries.hours : dictionaries.pieces,
      price: product.price,
      discountPercent:
        item % DISCOUNTED_EVERY === DISCOUNTED_EVERY - 1
          ? LINE_DISCOUNT_PERCENT
          : 0,
      discountAmount: 0,
      tax: dictionaries.vat,
    })
  }
  if (note) lines.push({ kind: "note", id: `${prefix}-n`, text: note })
  return lines
}
