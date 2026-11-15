/**
 * Типи полів розширення й того, що з них будує модуль (ADR-0020, п. 2 і 4; ADR-0030). Окремо від
 * `lib/extension-fields`, щоб той лишався про поведінку; проект імпортує їх звідти ж
 * (`@/lib/extension-fields`) — шлях імпорту не змінився. Типи самих полів (дані без React) — у
 * `lib/extension-fields-core` (ADR-0093), тут вони реекспортуються.
 */
import type { ReactNode } from "react"

import type { LocalizedText } from "@/registry/lib/localized-text"
import {
  unknownFieldType,
  type ExtensionAuditOptions,
  type ExtensionField,
  type ExtensionFieldOption,
  type ExtensionFieldValue,
  type ExtensionValues,
  type RecordTitle,
} from "@/registry/lib/extension-fields-core"
import type { DataTableColumn } from "@/registry/lib/data-table-core"
import type { Keyed } from "@/registry/lib/extensions"

// Поля як дані — у `lib/extension-fields-core` без React (ADR-0093); тут вони реекспортуються.
export {
  unknownFieldType,
  type ExtensionAuditOptions,
  type ExtensionField,
  type ExtensionFieldOption,
  type ExtensionFieldValue,
  type ExtensionValues,
  type RecordTitle,
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
