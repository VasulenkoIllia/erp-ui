/**
 * Тип розширення модуля A1 — публічний API модуля (ADR-0020, ADR-0025): несумісна зміна — мажорна
 * версія кіта й розділ «Як оновити розширення» в CHANGELOG.
 *
 * Розширення лежить у файлі проекту `src/extensions/A1-company.ts(x)` і передається у фабрику
 * `createCompanyModule({ extension })`; моки беруть лише дані без компонентів (`rates.fields`) —
 * `createCompanyMocks({ extension })`. Ключі модуля (`Company…Id`, `Currency…Id`, `Rate…Id`) у
 * мінорних версіях можуть доповнюватися: на них не будують вичерпних `Record` чи `switch` без
 * `default`.
 */
import type {
  ExtensionColumn,
  ExtensionColumnChange,
  ExtensionField,
  ExtensionFilter,
} from "@/lib/extension-fields"
import type { ExtensionFormChanges } from "@/lib/extension-form"
import type { CompanyProfile } from "@/lib/company"
import type { KeyedChanges } from "@/lib/extensions"
import type { ModuleStrings } from "@/lib/i18n-namespaces"
import type {
  ExtensionAction,
  ExtensionSection,
} from "@/components/templates/object-page"

import type ukMessages from "./i18n/uk.json"

/** Вкладки картки компанії; «Історія» — окремо (`history`). */
export type CompanySectionId = "details" | "images" | "branches" | "locale"
export type CurrencyColumnId =
  "code" | "status" | "latestRate" | "latestRateDate" | "actions"
export type RateColumnId = "date" | "currency" | "rate" | "source" | "actions"
export type RateFilterId = "currency" | "date" | "source"
export type RateFormFieldId = "currency" | "date" | "rate"

/** Ключі модуля для валют: ними сторінка перевіряє свої списки. */
export interface CurrencyIds {
  column: CurrencyColumnId
  filter: never
  tab: never
}

/** Ключі модуля для курсів. */
export interface RateIds {
  column: RateColumnId
  filter: RateFilterId
  tab: never
}

/** Картка компанії: вкладки й дії — компоненти проекту в слотах. */
export interface CompanyCardExtension {
  readonly sections?: KeyedChanges<
    ExtensionSection<CompanyProfile>,
    CompanySectionId
  >
  readonly actions?: KeyedChanges<ExtensionAction<CompanyProfile>, never>
  /** `false` — картка без журналу «Історія»: бекенд не веде журналу змін. За замовчуванням — є. */
  readonly history?: boolean
}

/** Список валют. */
export interface CurrenciesExtension {
  /**
   * `false` — без сторінок «Валюти» й «Курси валют» і їхніх пунктів навігації: компанія працює в одній
   * валюті чи курси веде інша система. За замовчуванням — є.
   */
  readonly page?: boolean
  readonly columns?: KeyedChanges<
    ExtensionColumn,
    CurrencyColumnId,
    ExtensionColumnChange
  >
}

/** Таблиця курсів. */
export interface RatesExtension {
  readonly fields?: readonly ExtensionField[]
  readonly columns?: KeyedChanges<
    ExtensionColumn,
    RateColumnId,
    ExtensionColumnChange
  >
  readonly filters?: KeyedChanges<ExtensionFilter, RateFilterId>
  /** Форма курсу: куди стають нові поля, що приховати чи перейменувати. */
  readonly form?: ExtensionFormChanges<RateFormFieldId>
}

/** Рядки модуля (простір імен `A1-company`, `i18n/uk.json`). */
export type CompanyMessages = typeof ukMessages

export interface CompanyExtension {
  readonly company?: CompanyCardExtension
  readonly currencies?: CurrenciesExtension
  readonly rates?: RatesExtension
  /** Перевизначення рядків модуля за ключами `i18n/*.json`. */
  readonly strings?: ModuleStrings<CompanyMessages>
}

/** Те, що беруть моки: дані без компонентів (файл полів проекту не тягне інтерфейс у моки). */
export interface CompanyMockExtension {
  readonly rates?: Pick<RatesExtension, "fields">
}
