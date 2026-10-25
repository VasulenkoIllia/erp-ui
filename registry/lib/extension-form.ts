/**
 * Поля розширення у формі модуля (ADR-0020, п. 2; ADR-0026): які поля стоять у формі, перевірка з
 * текстами мовою інтерфейсу, значення форми з запису й значення для запиту. Без React: поле вводу —
 * `erp/extension-field-input`.
 *
 * - Поле стає у форму, коли розширення додає його в `form.add` (місце — `place`, як у колонок).
 *   Обов'язкове поле, якого у формі немає, і ключ, якого немає серед полів, — помилка розробника.
 * - Порожнє у формі: текст і дата — `""`, число, список і запис із довідника — `null`, так/ні —
 *   `false`; у запит порожнє йде як `null` (`extendSchema` приймає `null` для необов'язкових полів).
 * - Обов'язкове: текст, дата, число, список і запис — не порожні; так/ні — будь-яке значення.
 */
import { z } from "zod"

import type { LocalizedText } from "@/registry/lib/auth"
import { isCalendarDate } from "@/registry/lib/dates"
import {
  unknownFieldType,
  type ExtensionField,
  type ExtensionFieldValue,
} from "@/registry/lib/extension-fields"
import {
  extensionValue,
  type Keyed,
  type KeyedChanges,
} from "@/registry/lib/extensions"

/** Поле розширення у формі: ключ — ключ поля (`fields`). */
export interface ExtensionFormField extends Keyed {
  /** Підказка під полем. */
  readonly description?: LocalizedText
  /** На всю ширину форми (довгий текст). */
  readonly wide?: boolean
}

/** Що розширення змінює в полі форми модуля без заміни (`change`): підпис і підказка. */
export interface ExtensionFormFieldChange {
  readonly label?: LocalizedText
  readonly description?: LocalizedText
}

/** Зміни форми модуля: нові поля з `fields`, сховати, переставити, змінити підпис і підказку. */
export type ExtensionFormChanges<K extends string = string> = KeyedChanges<
  ExtensionFormField,
  K,
  ExtensionFormFieldChange
>

/** Значення поля розширення у формі. */
export type ExtensionFormValue = string | number | boolean | null

export interface ExtensionFormMessages {
  /** «Заповніть це поле». */
  readonly required: string
  /** Текст помилки неповної чи неіснуючої дати; `null` — дата правильна (`useDateIssueText`). */
  readonly dateIssue: (value: string) => string | null
}

/**
 * Поля розширення, які стоять у формі, у порядку `form.add`. Ключ, якого немає серед `fields`, і
 * обов'язкове поле поза формою — виняток під час збирання форми.
 */
export function extensionFormFields(
  fields: readonly ExtensionField[] = [],
  changes?: KeyedChanges<ExtensionFormField, string, ExtensionFormFieldChange>,
): ExtensionField[] {
  const inForm = (changes?.add ?? []).map(({ id }) => {
    const field = fields.find((candidate) => candidate.id === id)
    if (!field)
      throw new Error(
        `erp-ui: form field "${id}" is not declared in extension fields`,
      )
    return field
  })
  const missing = fields.find(
    (field) => field.required && !inForm.includes(field),
  )
  if (missing)
    throw new Error(
      `erp-ui: required extension field "${missing.id}" is not in the form (form.add)`,
    )
  return inForm
}

function fieldSchema(
  field: ExtensionField,
  { required, dateIssue }: ExtensionFormMessages,
): z.ZodType {
  const isRequired = field.required === true
  const filled = (value: unknown) => value !== null
  switch (field.type) {
    case "text":
      return isRequired ? z.string().trim().min(1, required) : z.string().trim()
    case "number":
      return isRequired
        ? z.number().nullable().refine(filled, required)
        : z.number().nullable()
    case "date":
      return z.string().superRefine((value, ctx) => {
        const message = value ? dateIssue(value) : isRequired ? required : null
        if (message) ctx.addIssue({ code: "custom", message })
      })
    case "boolean":
      return z.boolean()
    case "options":
    case "record":
      return isRequired
        ? z.string().nullable().refine(filled, required)
        : z.string().nullable()
    default:
      return unknownFieldType(field)
  }
}

/** Схеми полів розширення у формі — доповнення схеми форми модуля (`z.object({ ...модуль, ...це })`). */
export function extensionFormSchema(
  fields: readonly ExtensionField[],
  messages: ExtensionFormMessages,
): Record<string, z.ZodType> {
  return Object.fromEntries(
    fields.map((field) => [field.id, fieldSchema(field, messages)]),
  )
}

function formValue(field: ExtensionField, value: unknown): ExtensionFormValue {
  switch (field.type) {
    case "text":
      return typeof value === "string" ? value : ""
    case "number":
      return typeof value === "number" ? value : null
    case "date":
      return isCalendarDate(value) ? value : ""
    case "boolean":
      return typeof value === "boolean" ? value : false
    case "options":
    case "record":
      return typeof value === "string" ? value : null
    default:
      return unknownFieldType(field)
  }
}

/** Значення полів розширення для форми з запису; без запису (створення) — порожні. */
export function extensionFormValues(
  fields: readonly ExtensionField[],
  record?: unknown,
): Record<string, ExtensionFormValue> {
  return Object.fromEntries(
    fields.map((field) => [
      field.id,
      formValue(field, extensionValue(record, field.id)),
    ]),
  )
}

/** Значення полів розширення для запиту: лише ключі з `keys`, порожнє — `null`. */
export function extensionPayload(
  fields: readonly ExtensionField[],
  values: Readonly<Record<string, unknown>>,
  keys: readonly string[],
): Record<string, ExtensionFieldValue> {
  return Object.fromEntries(
    fields
      .filter((field) => keys.includes(field.id))
      .map((field) => {
        const value = values[field.id] as ExtensionFormValue | undefined
        return [field.id, value === "" || value === undefined ? null : value]
      }),
  )
}
