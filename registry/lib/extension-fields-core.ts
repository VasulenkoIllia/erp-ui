/**
 * Поля розширення запису як дані й схеми без React (ADR-0020, п. 2 і 4; ADR-0093): типи полів, схеми
 * контракту з полями розширення, значення для моків і журналу, поля документа на підставі. Їх беруть
 * контракти модулів, моки й сервер на TypeScript; `lib/extension-fields` реекспортує все звідси й додає
 * показ мовою інтерфейсу (`useExtensionFields`).
 *
 * - `extendSchema(schema, fields)` — схема контракту з полями розширення: без неї zod відкидає
 *   невідомі поля, а з нею вони проходять перевірку у відповідях бекенду й у моках.
 * - `withMockValues(records, fields)` — значення нових полів у фікстурах: проект працює на моках;
 *   `extensionAuditOptions(language, fields)` — підписи й значення нових полів у журналі моків.
 * - Помилки розробника — поле з ключем поля модуля, два поля з одним ключем, невідомий тип — виняток
 *   під час збирання, а не тихий пропуск.
 */
import { z } from "zod"

import {
  localizedText,
  type LocalizedText,
} from "@/registry/lib/localized-text"

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
   * Без значення запис не проходить схему. Обов'язкове поле має бути у формі модуля (`form.add`,
   * `lib/extension-form`): без нього форма не збереться (помилка розробника), бо створення без
   * значення сервер однаково відхилить.
   */
  readonly required?: boolean
  /** Значення для моків і демо-даних: запис № i бере `mockValues[i % length]`. */
  readonly mockValues?: readonly ExtensionFieldValue[]
}

/**
 * Нове поле: текст, число, календарна дата `YYYY-MM-DD`, так/ні, значення зі списку чи запис із
 * довідника сервера (`id` запису: відповідальний із користувачів).
 */
export type ExtensionField =
  | (ExtensionFieldBase & {
      readonly type: "text" | "date" | "boolean"
    })
  | (ExtensionFieldBase & {
      readonly type: "number"
      /** Знаків після коми в полі форми; за замовчуванням — ціле число. */
      readonly decimals?: number
    })
  | (ExtensionFieldBase & {
      readonly type: "options"
      readonly options: readonly ExtensionFieldOption[]
    })
  | (ExtensionFieldBase & {
      readonly type: "record"
      /** Ресурс API довідника (ADR-0002): `users`. */
      readonly resource: string
      /** Поле запису довідника з назвою: `name`. */
      readonly labelField: string
      /** Другий рядок варіанта у виборі: `email`. */
      readonly descriptionField?: string
      /** Постійні умови довідника, плоскі параметри API: `{ status: "active" }`. */
      readonly filter?: Readonly<Record<string, string | readonly string[]>>
      /** `id` записів довідника моків. */
      readonly mockValues?: readonly (string | null)[]
    })

/** Тип, якого кіт не знає (дані від сервера новіші за кіт), — помилка, а не поле без перевірки. */
export function unknownFieldType(field: never): never {
  throw new Error(
    `erp-ui: unknown extension field type "${String((field as { type?: unknown }).type)}"`,
  )
}

/** Опції журналу змін моків для `createResourceHandlers` (ключ — ключ поля розширення). */
export interface ExtensionAuditOptions {
  fieldLabels: Record<string, LocalizedText>
  auditValue: Record<string, (value: unknown) => string>
}

/** Назва запису довідника для журналу моків: `mockRecordTitle` з `lib/mocks`. */
export type RecordTitle = (
  resource: string,
  id: string,
  labelField: string,
) => string | undefined

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

/**
 * Схеми полів розширення для `extend` об'єкта контракту: необов'язкове — `null` чи немає. Ключ поля
 * модуля (`moduleKeys`) і два поля з одним ключем — помилка розробника.
 */
export function extensionShape(
  fields: readonly ExtensionField[] = [],
  moduleKeys: readonly string[] = [],
): Record<string, z.ZodType> {
  const shape: Record<string, z.ZodType> = {}
  for (const field of fields) {
    if (moduleKeys.includes(field.id))
      throw new Error(
        `erp-ui: extension field "${field.id}" clashes with a module field`,
      )
    if (Object.hasOwn(shape, field.id))
      throw new Error(`erp-ui: extension field "${field.id}" is declared twice`)
    const value = valueSchema(field)
    shape[field.id] = field.required ? value : value.nullable().optional()
  }
  return shape
}

/** Схема контракту з полями розширення. */
export function extendSchema<S extends z.ZodObject>(
  schema: S,
  fields: readonly ExtensionField[] = [],
): z.ZodType<z.output<S> & ExtensionValues> {
  const shape = extensionShape(fields, Object.keys(schema.shape))
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
 * Поля розширення документа на підставі (рішення власника 10.11.2026, ADR-0070): нового документа поле з
 * тим самим ключем, що й у документа-джерела, отримує його значення, якщо воно проходить схему поля
 * нового документа (той самий список, тип). Решта полів лишається порожньою. Так переходять поля
 * пропозиції в замовлення й замовлення в рахунок; правило — сервера, моки беруть цю функцію.
 */
export function inheritedFieldValues(
  source: object,
  fields: readonly ExtensionField[] = [],
): Record<string, ExtensionFieldValue> {
  const values: Record<string, ExtensionFieldValue> = {}
  for (const field of fields) {
    const value: unknown = Reflect.get(source, field.id)
    if (value === undefined || value === null) continue
    const parsed = valueSchema(field).safeParse(value)
    if (parsed.success) values[field.id] = parsed.data
  }
  return values
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
