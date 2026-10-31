/**
 * Тип розширення модуля A6 — публічний API модуля (ADR-0020, ADR-0025): несумісна зміна — мажорна
 * версія кіта й розділ «Як оновити розширення» в CHANGELOG.
 *
 * Розширення лежить у файлі проекту `src/extensions/A6-dictionaries.ts(x)` і передається у фабрику
 * `createDictionariesModule({ extension })`; моки беруть лише дані без компонентів —
 * `createDictionariesMocks({ extension })`. Ключі модуля (`…ColumnId`, `…FormFieldId`) у мінорних
 * версіях можуть доповнюватися: на них не будують вичерпних `Record` чи `switch` без `default`.
 */
import type {
  ExtensionColumn,
  ExtensionColumnChange,
  ExtensionField,
  ExtensionFilter,
} from "@/lib/extension-fields"
import type { ExtensionFormChanges } from "@/lib/extension-form"
import type { KeyedChanges } from "@/lib/extensions"
import type { ModuleStrings } from "@/lib/i18n-namespaces"
import type { ExtensionStatusChanges } from "@/lib/statuses"

import type { ReasonKind } from "./contract"
import type ukMessages from "./i18n/uk.json"

/** Колонки всіх довідників: назва завжди перша, вона відкриває форму. */
type EntryColumnId = "name" | "status" | "actions"

export type TaxColumnId = EntryColumnId | "rate" | "included"
export type UnitColumnId = EntryColumnId | "shortName" | "decimals"
export type PaymentTermColumnId = EntryColumnId | "parts"
export type TagColumnId = EntryColumnId | "preview"
export type ReasonColumnId = EntryColumnId | "kind" | "commentRequired"

export type TaxFormFieldId = "name" | "rate" | "included" | "externalCodes"
export type UnitFormFieldId =
  "name" | "shortName" | "decimals" | "externalCodes"
export type PaymentTermFormFieldId = "name" | "parts" | "externalCodes"
export type TagFormFieldId = "name" | "tone"
export type ReasonFormFieldId = "name" | "kind" | "commentRequired"

/** Фільтр стану є в кожному довіднику, вид причини — лише в причин. */
export type DictionaryFilterId = "active"
export type ReasonFilterId = DictionaryFilterId | "kind"

export type ReasonKindId = ReasonKind

/** Те спільне, що проект змінює в довіднику. */
export interface DictionaryExtension<
  TColumn extends string,
  TField extends string,
> {
  /** `false` — без сторінки й пункту навігації: компанії цей довідник не потрібен. */
  readonly page?: boolean
  readonly fields?: readonly ExtensionField[]
  readonly columns?: KeyedChanges<
    ExtensionColumn,
    TColumn,
    ExtensionColumnChange
  >
  readonly filters?: KeyedChanges<ExtensionFilter, DictionaryFilterId>
  /** Форма: куди стають нові поля, що приховати чи перейменувати. */
  readonly form?: ExtensionFormChanges<TField>
}

export type TaxesExtension = DictionaryExtension<TaxColumnId, TaxFormFieldId>
export type UnitsExtension = DictionaryExtension<UnitColumnId, UnitFormFieldId>
export type PaymentTermsExtension = DictionaryExtension<
  PaymentTermColumnId,
  PaymentTermFormFieldId
>
export type TagsExtension = DictionaryExtension<TagColumnId, TagFormFieldId>

export interface ReasonsExtension extends Omit<
  DictionaryExtension<ReasonColumnId, ReasonFormFieldId>,
  "filters"
> {
  readonly filters?: KeyedChanges<ExtensionFilter, ReasonFilterId>
  /** Види причин проекту: нові, перейменовані, сховані. */
  readonly kinds?: ExtensionStatusChanges<ReasonKindId>
}

export interface DefaultsExtension {
  /** `false` — без сторінки «Типові значення» і її пункту навігації. */
  readonly page?: boolean
}

/** Рядки модуля (простір імен `A6-dictionaries`, `i18n/uk.json`). */
export type DictionariesMessages = typeof ukMessages

export interface DictionariesExtension {
  readonly taxes?: TaxesExtension
  readonly units?: UnitsExtension
  readonly paymentTerms?: PaymentTermsExtension
  readonly tags?: TagsExtension
  readonly reasons?: ReasonsExtension
  readonly defaults?: DefaultsExtension
  /** Перевизначення рядків модуля за ключами `i18n/*.json`. */
  readonly strings?: ModuleStrings<DictionariesMessages>
}

type WithFields = { readonly fields?: readonly ExtensionField[] }

/** Те, що беруть моки: дані без компонентів (файл полів проекту не тягне інтерфейс у моки). */
export interface DictionariesMockExtension {
  readonly taxes?: WithFields
  readonly units?: WithFields
  readonly paymentTerms?: WithFields
  readonly tags?: WithFields
  readonly reasons?: WithFields & Pick<ReasonsExtension, "kinds">
}
