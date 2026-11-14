/**
 * Документ із шаблону .docx (UI44, ADR-0087): що генератор бере з документа, змінні шаблону й перевірка
 * міток. Легкий файл: його імпортує дія на картці модуля, а читання й заповнення .docx (`lib/docx-template`)
 * вантажиться окремим чанком, лише коли генератор відкрили.
 *
 * - Мітка в шаблоні — шлях латиницею в фігурних дужках: `{number}`, `{customer.name}`; рядки документа
 *   повторюються між `{#lines}` і `{/lines}`, а `{#customer.vatIpn}…{/customer.vatIpn}` — умова: блок
 *   друкується, лише коли значення не порожнє.
 * - Змінні описує `TemplateVariables`: групи значень (документ, сторони, інші поля) і цикли (рядки). Групи й
 *   цикли будує `documentTemplateVariables` (`erp/document-template-variables`) з `TemplateDocument`.
 * - `templateIssues` звіряє мітки шаблону зі змінними: невідома мітка, мітка з `@` (сирий XML, не
 *   підтримується) — помилка біля мітки, файл не завантажується.
 */
import { z } from "zod"

import type { LocalizedText } from "@/registry/lib/auth"
import type { PartyDetails, PartyRole } from "@/registry/lib/document-parties"
import {
  documentTotalsSchema,
  savedDocumentBodyLineSchema,
  type SavedDocumentBodyLine,
  type SavedDocumentTotals,
} from "@/registry/lib/document-lines"
import type { Money } from "@/registry/lib/format"

/** Сторона документа для шаблону: знімок реквізитів (ADR-0068) і роль мовою документа. */
export interface TemplateParty {
  readonly details: PartyDetails
  /**
   * Роль у тексті документа: «(надалі «Покупець»)». Без неї — «Замовник» чи «Виконавець» за ключем ролі
   * (`partyDetails.roles`).
   */
  readonly label?: LocalizedText
}

/** Значення іншого поля: текст як є, дата календарна (`2026-11-14`) чи сума мовою документа. */
export type TemplateFieldValue =
  string | { readonly date: string } | { readonly money: Money }

/** Інше поле документа: «Сплатити до», «Дійсна до», поле розширення проекту. */
export interface TemplateExtraField {
  /** Мітка в шаблоні: латиниця й цифри, без крапки (`dueDate`, `contract`). */
  readonly key: string
  readonly label: LocalizedText
  /** `null` — порожньо. */
  readonly value: TemplateFieldValue | null
}

/**
 * Що генератор бере з документа модуля. Суми — мінорні одиниці, як у контракті (ADR-0056); рядки й
 * підсумки — з картки (`templateDetailOf`).
 */
export interface TemplateDocument {
  /** Номер; `null` — чернетка без номера. */
  readonly number: string | null
  /** Календарна дата документа. */
  readonly date: string
  /** ISO 4217. */
  readonly currency: string
  /** Підсумок із податком. */
  readonly total: number
  readonly lines?: readonly SavedDocumentBodyLine[]
  readonly totals?: SavedDocumentTotals
  readonly parties?: Partial<Record<PartyRole, TemplateParty>>
  readonly fields?: readonly TemplateExtraField[]
}

const templateDetailSchema = z.object({
  lines: z.array(savedDocumentBodyLineSchema),
  totals: documentTotalsSchema,
})

/**
 * Рядки й підсумки з запису картки документа (`GET /<ресурс>/:id`). Запис зі списку їх не має — `null`;
 * поля розширення рядка в шаблон не йдуть.
 */
export function templateDetailOf(
  record: unknown,
): Pick<TemplateDocument, "lines" | "totals"> | null {
  const parsed = templateDetailSchema.safeParse(record)
  return parsed.success ? parsed.data : null
}

/** Значення шаблону мовою документа; підпис — мовою інтерфейсу. */
export interface TemplateVariable {
  /** Повна мітка: `customer.name`. */
  readonly key: string
  readonly label: string
  readonly value: string
  /** Довге значення (сторона в тексті договору, адреса): поле на кілька рядків. */
  readonly isMultiline?: boolean
}

export interface TemplateVariableGroup {
  readonly id: string
  readonly label: string
  readonly variables: readonly TemplateVariable[]
}

/** Цикл шаблону: `{#lines}{name}{/lines}`; колонки — мітки всередині. */
export interface TemplateLoop {
  readonly key: string
  readonly label: string
  readonly columns: readonly { readonly key: string; readonly label: string }[]
  readonly rows: readonly Readonly<Record<string, string>>[]
}

export interface TemplateVariables {
  readonly groups: readonly TemplateVariableGroup[]
  readonly loops: readonly TemplateLoop[]
}

/**
 * Мітка шаблону: значення `{x}`, блок `{#x}…{/x}` (цикл чи умова, `{^x}` — коли порожньо) чи сира
 * `{@x}`. Блок несе мітки всередині.
 */
export interface TemplateTag {
  readonly name: string
  readonly kind: "value" | "section" | "raw"
  readonly inner: readonly TemplateTag[]
}

/**
 * Помилка шаблону біля мітки: невідома мітка (у циклі — `loop`), сира мітка чи запис мітки (`syntax` —
 * код помилки розбору, `lib/docx-template`).
 */
export type TemplateIssue =
  | { readonly code: "unknown"; readonly tag: string; readonly loop?: string }
  | { readonly code: "raw"; readonly tag: string }
  | { readonly code: "syntax"; readonly tag: string; readonly syntax: string }

/** Мітка як у шаблоні: `{customer.name}`, `{#lines}`. */
export const templateTagText = (name: string, prefix = "") =>
  `{${prefix}${name}}`

const variableKeys = (variables: TemplateVariables) =>
  new Set(
    variables.groups.flatMap((group) =>
      group.variables.map((variable) => variable.key),
    ),
  )

function collectIssues(
  tags: readonly TemplateTag[],
  scope: { scalars: ReadonlySet<string>; loops: readonly TemplateLoop[] },
  loop: TemplateLoop | undefined,
  issues: TemplateIssue[],
) {
  for (const tag of tags) {
    if (tag.kind === "raw") {
      issues.push({ code: "raw", tag: tag.name })
      continue
    }
    const inLoop = loop?.columns.some((column) => column.key === tag.name)
    const asLoop =
      tag.kind === "section"
        ? scope.loops.find((candidate) => candidate.key === tag.name)
        : undefined
    if (!inLoop && !asLoop && !scope.scalars.has(tag.name))
      issues.push(
        loop
          ? { code: "unknown", tag: tag.name, loop: loop.key }
          : { code: "unknown", tag: tag.name },
      )
    // Умова на значенні лишає область тією самою, цикл відкриває свої колонки.
    collectIssues(tag.inner, scope, asLoop ?? loop, issues)
  }
}

const issueId = (issue: TemplateIssue) =>
  `${issue.code}:${issue.tag}:${"loop" in issue ? (issue.loop ?? "") : ""}`

/**
 * Помилки міток шаблону без повторів, у порядку шаблону. Мітка всередині циклу шукається серед колонок
 * циклу, а потім серед значень документа (`{#lines}{name} {currency}{/lines}`).
 */
export function templateIssues(
  tags: readonly TemplateTag[],
  variables: TemplateVariables,
): TemplateIssue[] {
  const issues: TemplateIssue[] = []
  collectIssues(
    tags,
    { scalars: variableKeys(variables), loops: variables.loops },
    undefined,
    issues,
  )
  const seen = new Set<string>()
  return issues.filter((issue) => {
    const id = issueId(issue)
    if (seen.has(id)) return false
    seen.add(id)
    return true
  })
}

/** Мітки шаблону, які є серед змінних: значення й цикли, які показує форма. */
export function usedTemplateKeys(
  tags: readonly TemplateTag[],
  variables: TemplateVariables,
): { values: ReadonlySet<string>; loops: ReadonlySet<string> } {
  const scalars = variableKeys(variables)
  const loopKeys = new Set(variables.loops.map((loop) => loop.key))
  const values = new Set<string>()
  const loops = new Set<string>()
  const walk = (list: readonly TemplateTag[]) => {
    for (const tag of list) {
      if (tag.kind === "section" && loopKeys.has(tag.name)) loops.add(tag.name)
      else if (scalars.has(tag.name)) values.add(tag.name)
      walk(tag.inner)
    }
  }
  walk(tags)
  return { values, loops }
}

/** Дані шаблону: значення — вкладеними об'єктами за шляхом мітки, цикли — масивами рядків. */
export type TemplateData = {
  [key: string]: string | TemplateData | TemplateData[]
}

function setPath(data: TemplateData, key: string, value: string) {
  const path = key.split(".")
  const last = path.pop()
  if (last === undefined) return
  let node = data
  for (const part of path) {
    const next = node[part]
    if (typeof next === "object" && !Array.isArray(next)) node = next
    else {
      const created: TemplateData = {}
      node[part] = created
      node = created
    }
  }
  node[last] = value
}

/** Дані для заповнення: значення змінних, виправлене людиною (`overrides`) — замість значення документа. */
export function templateData(
  variables: TemplateVariables,
  overrides: Readonly<Record<string, string>> = {},
): TemplateData {
  const data: TemplateData = {}
  for (const group of variables.groups)
    for (const variable of group.variables)
      setPath(data, variable.key, overrides[variable.key] ?? variable.value)
  for (const loop of variables.loops)
    data[loop.key] = loop.rows.map((row) => ({ ...row }))
  return data
}
