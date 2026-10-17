/**
 * Нові поля запису з файлу розширення проекту (ADR-0020, п. 2 і 4). Поле описується даними — тип,
 * підпис uk/en, обов'язковість, значення для моків — без функцій, щоб ті самі поля зміг прислати
 * сервер (PF09, хвиля 2).
 *
 * - `extendSchema(schema, fields)` — схема контракту з полями розширення: без неї zod відкидає
 *   невідомі поля, а з нею вони проходять перевірку у відповідях бекенду й у моках.
 * - `withMockValues(records, fields)` — значення нових полів у фікстурах: проект працює на моках.
 * - `useExtensionFields(fields)` — значення текстом мовою інтерфейсу (числа й дати — `useFormat`),
 *   колонка списку (`ExtensionColumn` → `DataTableColumn`), ключове поле шапки картки, фільтр
 *   панелі (`ExtensionFilter` → `FilterDefinition`) і вкладка списку (`ExtensionTab` → `ListTab`).
 * - Помилки розробника — поле з ключем поля модуля, два поля з одним ключем, колонка чи поле шапки
 *   без опису поля, невідомий тип — виняток під час збирання, а не тихий пропуск.
 */
import { useMemo } from "react"
import { z } from "zod"

import { localizedText, type LocalizedText } from "@/registry/lib/auth"
import type { DataTableColumn } from "@/registry/lib/data-table-core"
import { isCalendarDate } from "@/registry/lib/dates"
import { extensionValue, type Keyed } from "@/registry/lib/extensions"
import type { FilterDefinition } from "@/registry/lib/filters"
import { useFormat } from "@/registry/lib/format"
import {
  useErpUiT,
  useLanguage,
  type ErpUiTranslate,
} from "@/registry/lib/i18n"
import type { ListFilter, ListTab } from "@/registry/lib/list-state"

export type ExtensionFieldValue = string | number | boolean | null

/**
 * Поля розширення в записі, розібраному схемою `extendSchema`. Значення — `unknown`: запис модуля
 * може мати масиви й вкладені об'єкти, а читати поле розширення — через `extensionValue`
 * (`lib/extensions`: компонент слота бере його без zod).
 */
export type ExtensionValues = Readonly<Record<string, unknown>>

export interface ExtensionFieldOption {
  readonly value: string
  readonly label: LocalizedText
}

interface ExtensionFieldBase {
  /** Ключ у записі, у колонці й у шапці картки: `manager`; не збігається з полем модуля. */
  readonly id: string
  readonly label: LocalizedText
  /**
   * Без значення запис не проходить схему. До полів розширення у формі модуля (крок 1.4) створення
   * запису з обов'язковим полем не пройде й у моках: форма його не надішле.
   */
  readonly required?: boolean
  /** Значення для моків і демо-даних: запис № i бере `mockValues[i % length]`. */
  readonly mockValues?: readonly ExtensionFieldValue[]
}

/** Нове поле: текст, число, календарна дата `YYYY-MM-DD`, так/ні чи значення зі списку. */
export type ExtensionField =
  | (ExtensionFieldBase & {
      readonly type: "text" | "number" | "date" | "boolean"
    })
  | (ExtensionFieldBase & {
      readonly type: "options"
      readonly options: readonly ExtensionFieldOption[]
    })

/** Тип, якого кіт не знає (дані від сервера новіші за кіт), — помилка, а не поле без перевірки. */
function unknownType(field: never): never {
  throw new Error(
    `erp-ui: unknown extension field type "${String((field as { type?: unknown }).type)}"`,
  )
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
    default:
      return unknownType(field)
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

/** Колонка списку з поля розширення: ключ колонки — ключ поля, решта — як у `DataTableColumn`. */
export interface ExtensionColumn
  extends
    Keyed,
    Pick<
      DataTableColumn<unknown>,
      "minWidth" | "grow" | "priority" | "overflow" | "align" | "card"
    > {
  /** Заголовок; за замовчуванням — підпис поля. */
  readonly header?: LocalizedText
}

/**
 * Фільтр панелі з поля розширення (ключ — ключ поля): список — «одне з» значень, так/ні — «так» чи
 * «ні», дата — період (`<поле>_gte`, `<поле>_lte`). Текст і число фільтром не стають: текст шукає
 * пошук `q`, діапазону чисел панель ще не має.
 */
export interface ExtensionFilter extends Keyed {
  /** Підпис; за замовчуванням — підпис поля. */
  readonly label?: LocalizedText
}

/**
 * Вкладка-статус списку з файлу розширення: фільтр — плоскі параметри API (ADR-0002) за полями
 * модуля чи розширення: `{ status: "suspended" }`, `{ vatPayer: "true" }`.
 */
export interface ExtensionTab extends Keyed {
  readonly label: LocalizedText
  readonly filter: Readonly<Record<string, string | readonly string[]>>
}

/** Ключове поле в шапці картки (`RecordField`): значення порожнє — шапка покаже «—». */
export interface ExtensionFieldEntry {
  readonly id: string
  readonly label: string
  readonly value: string | null
}

export interface ExtensionFieldsApi {
  /** Значення текстом мовою інтерфейсу; порожнє чи не того типу — `null`. */
  text: (field: ExtensionField, value: unknown) => string | null
  /** Колонка списку з поля розширення. */
  column: (column: ExtensionColumn) => DataTableColumn<unknown>
  /** Ключове поле шапки картки для запису. */
  entry: (item: Keyed, record: unknown) => ExtensionFieldEntry
  /** Фільтр панелі з поля розширення. */
  filter: (item: ExtensionFilter) => FilterDefinition
  /** Вкладка списку з даних розширення. */
  tab: (item: ExtensionTab) => ListTab
}

const EMPTY_CELL = "—"
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
    default:
      return unknownType(field)
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
    case "text":
    case "number":
      throw new Error(
        `erp-ui: extension field "${field.id}" of type ${field.type} cannot be a filter`,
      )
    default:
      return unknownType(field)
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
    return {
      text,
      column: (column) => {
        const field = find(column.id)
        // Лише властивості показу: решта ключів із даних (`sticky`, `sortField`) у колонку не йде.
        return {
          id: column.id,
          header: label(column.header ?? field.label),
          cell: (row) =>
            text(field, extensionValue(row, column.id)) ?? EMPTY_CELL,
          minWidth: column.minWidth,
          grow: column.grow,
          priority: column.priority,
          overflow: column.overflow,
          align: column.align,
          card: column.card,
        }
      },
      entry: ({ id }, record) => {
        const field = find(id)
        return {
          id,
          label: label(field.label),
          value: text(field, extensionValue(record, id)),
        }
      },
      filter: (item) => filterOf(find(item.id), item, label, t),
      tab: (item) => ({
        id: item.id,
        label: label(item.label),
        filter: Object.fromEntries(
          Object.entries(item.filter).map(([key, value]) => [
            key,
            typeof value === "string" ? value : [...value],
          ]),
        ) satisfies ListFilter,
      }),
    }
  }, [fields, format, language, t])
}
