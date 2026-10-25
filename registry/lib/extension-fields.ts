/**
 * Нові поля запису з файлу розширення проекту (ADR-0020, п. 2 і 4). Поле описується даними — тип,
 * підпис uk/en, обов'язковість, значення для моків — без функцій, щоб ті самі поля зміг прислати
 * сервер (PF09, хвиля 2).
 *
 * - `extendSchema(schema, fields)` — схема контракту з полями розширення: без неї zod відкидає
 *   невідомі поля, а з нею вони проходять перевірку у відповідях бекенду й у моках.
 * - `withMockValues(records, fields)` — значення нових полів у фікстурах: проект працює на моках;
 *   `extensionAuditOptions(language, fields)` — підписи й значення нових полів у журналі моків.
 * - `useExtensionFields(fields)` — значення текстом мовою інтерфейсу (числа й дати — `useFormat`),
 *   колонка списку (`ExtensionColumn` → `DataTableColumn`), ключове поле шапки картки, фільтр
 *   панелі (`ExtensionFilter` → `FilterDefinition`) і вкладка списку (`ExtensionTab` → `ListTab`).
 * - Поле «запис із довідника сервера» (`record`, крок A2a, ADR-0030): у записі — `id` запису
 *   довідника, підпис колонка й шапка беруть із сервера (`RecordLabel`, `lib/record-label`), у
 *   формі — вибір запису з пошуком на сервері (`erp/record-picker`), у панелі — фільтр за ним.
 * - Помилки розробника — поле з ключем поля модуля, два поля з одним ключем, колонка чи поле шапки
 *   без опису поля, невідомий тип — виняток під час збирання, а не тихий пропуск.
 */
import { createElement, useMemo, type ReactNode } from "react"
import { z } from "zod"

import { localizedText, type LocalizedText } from "@/registry/lib/auth"
import type { DataTableColumn } from "@/registry/lib/data-table-core"
import { isCalendarDate } from "@/registry/lib/dates"
import {
  unknownFieldType,
  type ExtensionAuditOptions,
  type ExtensionColumn,
  type ExtensionColumnChange,
  type ExtensionDisplayEntry,
  type ExtensionField,
  type ExtensionFieldEntry,
  type ExtensionFieldOption,
  type ExtensionFieldValue,
  type ExtensionFilter,
  type ExtensionTab,
  type ExtensionValues,
  type RecordTitle,
} from "@/registry/lib/extension-field-types"
import {
  extensionValue,
  type Keyed,
  type KeyedChange,
} from "@/registry/lib/extensions"
import type { FilterDefinition } from "@/registry/lib/filters"
import { useFormat } from "@/registry/lib/format"
import {
  useErpUiT,
  useLanguage,
  type ErpUiTranslate,
} from "@/registry/lib/i18n"
import type { ListFilter, ListTab } from "@/registry/lib/list-state"
import { RecordLabel } from "@/registry/lib/record-label"

// Проект імпортує типи полів звідси, як до винесення їх у `lib/extension-field-types`.
export {
  unknownFieldType,
  type ExtensionAuditOptions,
  type ExtensionColumn,
  type ExtensionColumnChange,
  type ExtensionDisplayEntry,
  type ExtensionField,
  type ExtensionFieldEntry,
  type ExtensionFieldOption,
  type ExtensionFieldValue,
  type ExtensionFilter,
  type ExtensionTab,
  type ExtensionValues,
  type RecordTitle,
}

function valueSchema(field: ExtensionField): z.ZodType<ExtensionFieldValue> {
  switch (field.type) {
    case "text":
      return field.required ? z.string().trim().min(1) : z.string()
    case "number":
      return z.number()
    case "date":
      return z.iso.date()
    case "boolean":
      return z.boolean()
    case "options": {
      const values = new Set(field.options.map((option) => option.value))
      return z.string().refine((value) => values.has(value))
    }
    case "record":
      return z.string().min(1)
    default:
      return unknownFieldType(field)
  }
}

/** Схема контракту з полями розширення. */
export function extendSchema<S extends z.ZodObject>(
  schema: S,
  fields: readonly ExtensionField[] = [],
): z.ZodType<z.output<S> & ExtensionValues> {
  const shape: Record<string, z.ZodType> = {}
  for (const field of fields) {
    if (Object.hasOwn(schema.shape, field.id))
      throw new Error(
        `erp-ui: extension field "${field.id}" clashes with a module field`,
      )
    if (Object.hasOwn(shape, field.id))
      throw new Error(`erp-ui: extension field "${field.id}" is declared twice`)
    const value = valueSchema(field)
    shape[field.id] = field.required ? value : value.nullable().optional()
  }
  // `extend` з рядковими ключами TypeScript виводить загально: поля розширення — `ExtensionValues`.
  return schema.extend(shape) as unknown as z.ZodType<
    z.output<S> & ExtensionValues
  >
}

/** Фікстури з нових полів: запис № i отримує `mockValues[i % length]` кожного поля. */
export function withMockValues<T extends object>(
  records: readonly T[],
  fields: readonly ExtensionField[] = [],
): (T & ExtensionValues)[] {
  const samples = fields.flatMap((field) =>
    field.mockValues?.length
      ? [{ id: field.id, values: field.mockValues }]
      : [],
  )
  return records.map((record, index) => {
    const values: Record<string, ExtensionFieldValue | undefined> = {}
    for (const { id, values: list } of samples)
      values[id] = list[index % list.length]
    return { ...record, ...values }
  })
}

/**
 * Журнал змін у моках (`createResourceHandlers` з `lib/mocks`): підписи полів розширення в «було →
 * стало» і значення зі списку — підписом мовою даних (`language`), а не ключем. Так/ні журнал
 * підписує сам. Запис із довідника — тим самим полем назви (`labelField`), що й список, із
 * довідника моків (`recordTitle`, у моках — `mockRecordTitle` з `lib/mocks`), інакше `id`.
 */
export function extensionAuditOptions(
  language: string,
  fields: readonly ExtensionField[] = [],
  recordTitle?: RecordTitle,
): ExtensionAuditOptions {
  const fieldLabels: Record<string, LocalizedText> = {}
  const auditValue: Record<string, (value: unknown) => string> = {}
  for (const field of fields) {
    fieldLabels[field.id] = field.label
    if (field.type === "record") {
      const { resource, labelField } = field
      auditValue[field.id] = (value) =>
        (typeof value === "string"
          ? recordTitle?.(resource, value, labelField)
          : undefined) ?? String(value)
      continue
    }
    if (field.type !== "options") continue
    const labels = new Map(
      field.options.map((option) => [
        option.value,
        localizedText(option.label, language),
      ]),
    )
    // Значення, якого вже немає в списку, — ключем, а не порожнім місцем.
    auditValue[field.id] = (value) =>
      (typeof value === "string" ? labels.get(value) : undefined) ??
      String(value)
  }
  return { fieldLabels, auditValue }
}

/** Зміна колонки мовою інтерфейсу — для `applyKeyedChanges` поверх колонок модуля. */
type ColumnChange = KeyedChange<
  Partial<Pick<DataTableColumn<unknown>, keyof ExtensionColumnChange>>
>

export interface ExtensionFieldsApi {
  /**
   * Значення текстом мовою інтерфейсу; порожнє чи не того типу — `null`. Запис із довідника —
   * його `id`: підпис приходить із сервера, тож показувати — через `display`.
   */
  text: (field: ExtensionField, value: unknown) => string | null
  /** Значення для показу: текст, а запис із довідника — підпис із сервера (`RecordLabel`). */
  display: (field: ExtensionField, value: unknown) => ReactNode
  /** Колонка списку з поля розширення. */
  column: (column: ExtensionColumn) => DataTableColumn<unknown>
  /** Зміна колонки модуля без заміни: назва мовою інтерфейсу. */
  columnChange: (change: KeyedChange<ExtensionColumnChange>) => ColumnChange
  /** Поле запису текстом (`text`): запис із довідника — `id`. */
  entry: (item: Keyed, record: unknown) => ExtensionFieldEntry
  /** Ключове поле шапки картки (`RecordField`): запис із довідника — підпис із сервера. */
  displayEntry: (item: Keyed, record: unknown) => ExtensionDisplayEntry
  /** Фільтр панелі з поля розширення. */
  filter: (item: ExtensionFilter) => FilterDefinition
  /** Вкладка списку з даних розширення. */
  tab: (item: ExtensionTab) => ListTab
}

const EMPTY_CELL = "—"

/** Плоскі параметри з даних розширення (вкладка, умови довідника) — у змінний `ListFilter`. */
export function listFilterOf(
  filter: Readonly<Record<string, string | readonly string[]>>,
): ListFilter {
  return Object.fromEntries(
    Object.entries(filter).map(([key, value]) => [
      key,
      typeof value === "string" ? value : [...value],
    ]),
  )
}
const NO_FIELDS: readonly ExtensionField[] = []

interface TextContext {
  format: ReturnType<typeof useFormat>
  t: ErpUiTranslate
  label: (text: LocalizedText) => string
}

function fieldText(
  field: ExtensionField,
  value: unknown,
  { format, t, label }: TextContext,
): string | null {
  if (value === null || value === undefined || value === "") return null
  switch (field.type) {
    case "text":
      return typeof value === "string" ? value : null
    case "number":
      return typeof value === "number" ? format.number(value) : null
    case "date":
      return isCalendarDate(value) ? format.date(value, "date") : null
    case "boolean":
      return typeof value === "boolean"
        ? t(value ? "common.yes" : "common.no")
        : null
    case "options": {
      // Значення, якого немає в списку (новіше за розширення), — як є.
      const option = field.options.find((item) => item.value === value)
      if (option) return label(option.label)
      return typeof value === "string" ? value : null
    }
    case "record":
      return typeof value === "string" ? value : null
    default:
      return unknownFieldType(field)
  }
}

function filterOf(
  field: ExtensionField,
  item: ExtensionFilter,
  label: (text: LocalizedText) => string,
  t: ErpUiTranslate,
): FilterDefinition {
  const base = {
    id: field.id,
    field: field.id,
    label: label(item.label ?? field.label),
  }
  switch (field.type) {
    case "options":
      return {
        ...base,
        kind: "options",
        options: field.options.map((option) => ({
          value: option.value,
          label: label(option.label),
        })),
      }
    case "boolean":
      return {
        ...base,
        kind: "options",
        options: [
          { value: "true", label: t("common.yes") },
          { value: "false", label: t("common.no") },
        ],
      }
    case "date":
      return { ...base, kind: "date-range" }
    case "record":
      return {
        ...base,
        kind: "record",
        resource: field.resource,
        labelField: field.labelField,
        descriptionField: field.descriptionField,
        filter: field.filter && listFilterOf(field.filter),
      }
    case "text":
    case "number":
      throw new Error(
        `erp-ui: extension field "${field.id}" of type ${field.type} cannot be a filter`,
      )
    default:
      return unknownFieldType(field)
  }
}

/**
 * Поля розширення мовою інтерфейсу. `fields` — стабільні між рендерами (константа файлу
 * розширення): від них залежать колонки списку, а новий масив колонок перебудовує таблицю.
 */
export function useExtensionFields(
  fields: readonly ExtensionField[] = NO_FIELDS,
): ExtensionFieldsApi {
  const format = useFormat()
  const { language } = useLanguage()
  const t = useErpUiT()
  return useMemo(() => {
    const find = (id: string): ExtensionField => {
      const field = fields.find((candidate) => candidate.id === id)
      if (!field)
        throw new Error(`erp-ui: extension field "${id}" is not declared`)
      return field
    }
    const label = (text: LocalizedText) => localizedText(text, language) ?? ""
    const context: TextContext = { format, t, label }
    const text = (field: ExtensionField, value: unknown) =>
      fieldText(field, value, context)
    const display = (field: ExtensionField, value: unknown): ReactNode =>
      field.type === "record" && typeof value === "string" && value
        ? createElement(RecordLabel, {
            resource: field.resource,
            id: value,
            labelField: field.labelField,
          })
        : text(field, value)
    return {
      text,
      display,
      column: (column) => {
        const field = find(column.id)
        // Лише властивості показу: решта ключів із даних (`sticky`, `sortField`) у колонку не йде.
        return {
          id: column.id,
          header: label(column.header ?? field.label),
          cell: (row) =>
            display(field, extensionValue(row, column.id)) ?? EMPTY_CELL,
          minWidth: column.minWidth,
          grow: column.grow,
          priority: column.priority,
          overflow: column.overflow,
          align: column.align,
          card: column.card,
        }
      },
      columnChange: ({ header, ...change }) => ({
        ...change,
        header: header && label(header),
      }),
      entry: ({ id }, record) => {
        const field = find(id)
        return {
          id,
          label: label(field.label),
          value: text(field, extensionValue(record, id)),
        }
      },
      displayEntry: ({ id }, record) => {
        const field = find(id)
        return {
          id,
          label: label(field.label),
          value: display(field, extensionValue(record, id)),
        }
      },
      filter: (item) => filterOf(find(item.id), item, label, t),
      tab: (item) => ({
        id: item.id,
        label: label(item.label),
        filter: listFilterOf(item.filter),
      }),
    }
  }, [fields, format, language, t])
}
