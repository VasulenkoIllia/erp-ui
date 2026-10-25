/**
 * Типи полів розширення й того, що з них будує модуль (ADR-0020, п. 2 і 4; ADR-0030). Окремо від
 * `lib/extension-fields`, щоб той лишався про поведінку; проект імпортує їх звідти ж
 * (`@/lib/extension-fields`) — шлях імпорту не змінився.
 */
import type { ReactNode } from "react"

import type { LocalizedText } from "@/registry/lib/auth"
import type { DataTableColumn } from "@/registry/lib/data-table-core"
import type { Keyed } from "@/registry/lib/extensions"

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
 * Що розширення змінює в колонці модуля без заміни (`change`): назва, ширина, пріоритет на вузькому
 * екрані, вирівнювання. Вміст комірки, поведінка на вузькому екрані (`overflow`: закріплену колонку
 * так можна було б сховати) і роль у картці лишаються від модуля.
 */
export type ExtensionColumnChange = Pick<
  ExtensionColumn,
  "header" | "minWidth" | "grow" | "priority" | "align"
>

/**
 * Фільтр панелі з поля розширення (ключ — ключ поля): список — «одне з» значень, так/ні — «так» чи
 * «ні», дата — період (`<поле>_gte`, `<поле>_lte`), запис із довідника — вибір запису з пошуком на
 * сервері (`<поле>=<id>`). Текст і число фільтром не стають: текст шукає пошук `q`, діапазону
 * чисел панель ще не має.
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

/** Поле запису текстом (`entry`): порожнє — `null`; запис із довідника — його `id`. */
export interface ExtensionFieldEntry {
  readonly id: string
  readonly label: string
  readonly value: string | null
}

/**
 * Ключове поле в шапці картки (`RecordField`, `displayEntry`): значення порожнє — шапка покаже «—»;
 * запис із довідника — підпис із сервера (`RecordLabel`).
 */
export interface ExtensionDisplayEntry {
  readonly id: string
  readonly label: string
  readonly value: ReactNode
}
