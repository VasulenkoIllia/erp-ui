/**
 * Нумерація документів (PF03b, ADR-0058): серія номерів на тип документа в компанії, шаблон із мітками,
 * лічильник на компанію чи на кожну філію, скидання щороку, перегляд наступного номера.
 *
 * Контракт (під `/api/v1`, компанія запиту — `X-Company-Id`):
 * - Номер дає сервер, коли документ стає проведеним: на `submit` (ADR-0057) і документу-сторно. Чернетка
 *   й виправлена копія номера не мають (`null`). Виправлена копія й сторно беруть наступний номер серії, а
 *   скасований документ лишає свій: номер ніколи не повторюється (рішення власника 02.11.2026).
 * - Серії — ресурс `numbering-series` (ADR-0002): `GET` список і запис, `PATCH` з `version` полів
 *   `template`, `resetYearly`, `perBranch`. Серію на кожен тип документа (`resource`) створює сервер,
 *   клієнт серій не створює й не видаляє. Права `numbering-series:read` і `numbering-series:update`.
 *   Хибний шаблон — 422 `fieldErrors.template` з кодом `NumberingTemplateIssue`; 409 `conflict`.
 * - Лічильники — `GET /numbering-counters?series=<id серії>` → `{ data, total }`: останнє видане значення
 *   кожного лічильника серії, право `numbering-series:read`. Лише читання: значення змінює проведення.
 * - Лічильник один на серію або, з `perBranch`, свій для кожної філії документа (`branchId`); з
 *   `resetYearly` — ще й свій на кожен календарний рік дати документа. Номер унікальний у компанії:
 *   зайнятий сервер пропускає й бере наступне значення. Видача атомарна: два одночасні проведення не
 *   отримують одного значення.
 * - Мітки шаблону: `{YYYY}` і `{YY}` — рік дати документа, `{MM}` — місяць, `{BRANCH}` — код філії
 *   документа (немає — порожньо), `{#…#}` — лічильник щонайменше з такої кількості цифр, скільки `#`.
 */
import { z } from "zod"

import { recordBaseSchema } from "@/registry/lib/api"
import type { CalendarDate } from "@/registry/lib/dates"

export const NUMBERING_SERIES = "numbering-series"
export const NUMBERING_COUNTERS = "numbering-counters"

/** Шаблон довший — це вже не номер, а опис. */
export const NUMBERING_TEMPLATE_MAX_LENGTH = 40
/** Цифр лічильника в мітці `{#…#}`: від 1 до 9. */
export const NUMBERING_COUNTER_MAX_DIGITS = 9

/** Мітки для кнопок вставки; лічильник — чотири цифри, решту людина допише сама. */
export const NUMBERING_TOKENS = [
  "{YYYY}",
  "{YY}",
  "{MM}",
  "{BRANCH}",
  "{####}",
] as const
export type NumberingToken = (typeof NUMBERING_TOKENS)[number]

/** Коди помилки шаблону: `fieldErrors.template` відповіді 422 і текст біля поля. */
export const NUMBERING_TEMPLATE_ISSUES = [
  "required",
  "too_long",
  "unknown_token",
  "counter_required",
  "counter_duplicate",
  "year_required",
  "branch_required",
] as const
export type NumberingTemplateIssue = (typeof NUMBERING_TEMPLATE_ISSUES)[number]

type TemplatePart =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "year" | "shortYear" | "month" | "branch" }
  | { readonly kind: "counter"; readonly digits: number }

const NAMED_TOKENS: Readonly<Record<string, TemplatePart>> = {
  YYYY: { kind: "year" },
  YY: { kind: "shortYear" },
  MM: { kind: "month" },
  BRANCH: { kind: "branch" },
}
const COUNTER_TOKEN = new RegExp(
  `^#{1,${String(NUMBERING_COUNTER_MAX_DIGITS)}}$`,
)

/** Частини шаблону; `null` — невідома мітка чи дужка без пари. */
export function parseNumberingTemplate(
  template: string,
): readonly TemplatePart[] | null {
  const parts: TemplatePart[] = []
  let rest = template
  while (rest) {
    const open = rest.indexOf("{")
    const close = rest.indexOf("}")
    if (open < 0) {
      if (close >= 0) return null
      parts.push({ kind: "text", text: rest })
      break
    }
    if (close < open) return null
    if (open > 0) parts.push({ kind: "text", text: rest.slice(0, open) })
    const name = rest.slice(open + 1, close)
    const part = COUNTER_TOKEN.test(name)
      ? { kind: "counter" as const, digits: name.length }
      : NAMED_TOKENS[name]
    if (!part) return null
    parts.push(part)
    rest = rest.slice(close + 1)
  }
  return parts
}

export interface NumberingRules {
  readonly resetYearly: boolean
  readonly perBranch: boolean
}

/**
 * Що не так із шаблоном серії: без року скидання щороку дало б той самий номер через рік, а лічильник
 * кожної філії без її коду — той самий номер у двох філіях.
 */
export function numberingTemplateIssue(
  template: string,
  { resetYearly, perBranch }: NumberingRules,
): NumberingTemplateIssue | null {
  if (!template.trim()) return "required"
  if (template.length > NUMBERING_TEMPLATE_MAX_LENGTH) return "too_long"
  const parts = parseNumberingTemplate(template)
  if (!parts) return "unknown_token"
  const counters = parts.filter((part) => part.kind === "counter").length
  if (counters === 0) return "counter_required"
  if (counters > 1) return "counter_duplicate"
  const has = (kind: TemplatePart["kind"]) =>
    parts.some((part) => part.kind === kind)
  if (resetYearly && !has("year") && !has("shortYear")) return "year_required"
  if (perBranch && !has("branch")) return "branch_required"
  return null
}

/** Чи є в шаблоні код філії: тоді перегляд питає, для якої філії. */
export const usesBranch = (template: string): boolean =>
  parseNumberingTemplate(template)?.some((part) => part.kind === "branch") ??
  false

export interface DocumentNumberInput {
  /** Дата документа: з неї рік і місяць. */
  readonly date: CalendarDate
  readonly branchCode?: string | null
  /** Значення лічильника. */
  readonly value: number
}

/** Номер за шаблоном; хибний шаблон — `null` (сервер такого не збереже). */
export function formatDocumentNumber(
  template: string,
  { date, branchCode, value }: DocumentNumberInput,
): string | null {
  const parts = parseNumberingTemplate(template)
  if (!parts) return null
  return parts
    .map((part) => {
      switch (part.kind) {
        case "text":
          return part.text
        case "year":
          return date.slice(0, 4)
        case "shortYear":
          return date.slice(2, 4)
        case "month":
          return date.slice(5, 7)
        case "branch":
          return branchCode ?? ""
        case "counter":
          return String(value).padStart(part.digits, "0")
      }
    })
    .join("")
}

export const numberingSeriesSchema = recordBaseSchema.extend({
  companyId: z.string().nullable().optional(),
  /** Ресурс документів, який нумерує серія: `quotes`, `invoices`. */
  resource: z.string().min(1),
  template: z.string(),
  resetYearly: z.boolean(),
  perBranch: z.boolean(),
})
export type NumberingSeries = z.infer<typeof numberingSeriesSchema>

/** Серія з перевіркою шаблону, як її робить сервер: моки й форми налаштувань. */
export const validNumberingSeriesSchema = numberingSeriesSchema.superRefine(
  (series, context) => {
    const issue = numberingTemplateIssue(series.template, series)
    if (issue)
      context.addIssue({ code: "custom", path: ["template"], message: issue })
  },
)

export const numberingCounterSchema = z.object({
  id: z.string(),
  /** `id` серії. */
  series: z.string(),
  branchId: z.string().nullable(),
  year: z.number().int().nullable(),
  /** Останнє видане значення. */
  value: z.number().int().min(0),
})
export type NumberingCounter = z.infer<typeof numberingCounterSchema>

export interface CounterScope {
  readonly branchId: string | null
  readonly year: number | null
}

/** Лічильник, з якого документ бере номер: філія й рік — лише якщо серія рахує окремо. */
export const counterScope = (
  rules: NumberingRules,
  { date, branchId }: { date: CalendarDate; branchId?: string | null },
): CounterScope => ({
  branchId: rules.perBranch ? (branchId ?? null) : null,
  year: rules.resetYearly ? Number(date.slice(0, 4)) : null,
})

export interface NextNumberInput {
  readonly date: CalendarDate
  readonly branchId?: string | null
  readonly branchCode?: string | null
}

/**
 * Наступний номер серії з поточними лічильниками, зокрема для ще не збереженого шаблону. Це перегляд:
 * хтось може провести документ раніше, і тоді номер буде наступним за цим.
 */
export function nextDocumentNumber(
  series: NumberingRules & { readonly id: string; readonly template: string },
  counters: readonly NumberingCounter[],
  { date, branchId, branchCode }: NextNumberInput,
): string | null {
  const scope = counterScope(series, { date, branchId })
  const last =
    counters.find(
      (counter) =>
        counter.series === series.id &&
        counter.branchId === scope.branchId &&
        counter.year === scope.year,
    )?.value ?? 0
  return formatDocumentNumber(series.template, {
    date,
    branchCode,
    value: last + 1,
  })
}
