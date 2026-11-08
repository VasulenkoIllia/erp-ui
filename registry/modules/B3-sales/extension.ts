/**
 * Тип розширення модуля B3 — публічний API модуля (ADR-0020, ADR-0025): несумісна зміна — мажорна
 * версія кіта й розділ «Як оновити розширення» в CHANGELOG.
 *
 * Розширення лежить у файлі проекту `src/extensions/B3-sales.ts(x)` і передається у фабрику
 * `createSalesModule({ extension })`; моки беруть лише дані без компонентів (`fields`, `statuses`,
 * `transitions`) — `createSalesMocks({ extension })`. Ключі модуля в `hide`, `move`, `place` і
 * `change` — типи нижче: модуль перейменує ключ — TypeScript покаже місце у файлі розширення (крім
 * вкладок: статус розширення теж вкладка, тож ключ вкладки — будь-який рядок).
 */
import type {
  ExtensionColumn,
  ExtensionColumnChange,
  ExtensionField,
  ExtensionFilter,
  ExtensionTab,
} from "@/lib/extension-fields"
import type { ExtensionFormChanges } from "@/lib/extension-form"
import type { Keyed, KeyedChanges } from "@/lib/extensions"
import type { ModuleStrings } from "@/lib/i18n-namespaces"
import type {
  ExtensionStatusChanges,
  ExtensionTransitionChanges,
} from "@/lib/statuses"
import type {
  ExtensionAction,
  ExtensionAside,
  ExtensionSection,
} from "@/components/templates/object-page"

import type { Quote, QuoteStatus, QuoteTransitionId } from "./contract"
import type ukMessages from "./i18n/uk.json"

export type QuoteColumnId =
  "number" | "client" | "date" | "validUntil" | "total" | "status"
export type QuoteFilterId = "clientId" | "date"
/** Вкладки списку: «Усі» і статуси; статус розширення — теж вкладка з його ключем. */
export type QuoteTabId = "all" | QuoteStatus | (string & {})
/** Ключові поля шапки картки. */
export type QuoteFieldId = "client" | "date" | "validUntil" | "total"
/** Секції картки. */
export type QuoteSectionId = "lines"
export type QuoteActionId = "edit" | "print"
/** Поля форми шапки (ключ — ім'я поля запису); рядки й знижка документа — редактор рядків. */
export type QuoteFormFieldId = "clientId" | "date" | "validUntil"

/** Ключі модуля для пропозицій: ними сторінки модуля перевіряють свої списки. */
export interface QuoteIds {
  column: QuoteColumnId
  filter: QuoteFilterId
  tab: QuoteTabId
  field: QuoteFieldId
  section: QuoteSectionId
  action: QuoteActionId
  formField: QuoteFormFieldId
}

export interface QuotesExtension {
  /** Нові поля шапки: схема, підписи, значення для моків (`lib/extension-fields`). */
  readonly fields?: readonly ExtensionField[]
  /**
   * Статуси пропозиції: додати, сховати з вибору; `change` — підпис, тон чи іконка статусу модуля без
   * заміни. Новий статус досяжний дією `transitions`.
   */
  readonly statuses?: ExtensionStatusChanges<QuoteStatus>
  /**
   * Дозволені переходи (ADR-0057): нова дія зі своїм статусом; `change` — підпис, `from` і причина
   * дії модуля, але не `to`.
   */
  readonly transitions?: ExtensionTransitionChanges<QuoteTransitionId>
  /** Колонки списку; нова — з поля розширення (ключ — ключ поля); `change` — назва, ширина чи пріоритет. */
  readonly columns?: KeyedChanges<
    ExtensionColumn,
    QuoteColumnId,
    ExtensionColumnChange
  >
  /** Фільтри панелі списку; новий — з поля розширення (список, так/ні, дата). */
  readonly filters?: KeyedChanges<ExtensionFilter, QuoteFilterId>
  /** Вкладки-статуси списку з фільтром даними. */
  readonly tabs?: KeyedChanges<ExtensionTab, QuoteTabId>
  /** Ключові поля шапки картки; нове — з поля розширення. */
  readonly recordFields?: KeyedChanges<Keyed, QuoteFieldId>
  /** `false` — картка без журналу «Історія»: бекенд не веде журналу змін. За замовчуванням — є. */
  readonly history?: boolean
  /** `false` — без «Редагує …» (ADR-0051): бекенд без блокувань і так нічого не зламає. */
  readonly editLock?: boolean
  /** Стрічка картки замість «Історії»: `timelineModule.aside` модуля N1 чи свій компонент (ADR-0054). */
  readonly aside?: ExtensionAside<Quote>
  /** Секції картки — компоненти проекту в слотах. */
  readonly sections?: KeyedChanges<ExtensionSection<Quote>, QuoteSectionId>
  /** Дії в шапці картки — компоненти проекту з правом `access`. */
  readonly actions?: KeyedChanges<ExtensionAction<Quote>, QuoteActionId>
  /**
   * Форма створення й зміни шапки (`lib/extension-form`): `add` — поле розширення з `fields`, `hide` і
   * `move` — поля модуля, `change` — підпис і підказка поля модуля.
   */
  readonly form?: ExtensionFormChanges<QuoteFormFieldId>
}

/** Рядки модуля (простір імен `B3-sales`, `i18n/uk.json`). */
export type SalesMessages = typeof ukMessages

export interface SalesExtension {
  readonly quotes?: QuotesExtension
  /** Перевизначення рядків модуля за ключами `i18n/*.json`, напр. назва чи пояснення списку. */
  readonly strings?: ModuleStrings<SalesMessages>
}

/** Те, що беруть моки: дані без компонентів (файл полів проекту не тягне інтерфейс у моки). */
export interface SalesMockExtension {
  readonly quotes?: Pick<QuotesExtension, "fields" | "statuses" | "transitions">
}
