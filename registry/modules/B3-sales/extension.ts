/**
 * Тип розширення модуля B3 — публічний API модуля (ADR-0020, ADR-0025): несумісна зміна — мажорна
 * версія кіта й розділ «Як оновити розширення» в CHANGELOG.
 *
 * Розширення лежить у файлі проекту `src/extensions/B3-sales.ts(x)` і передається у фабрику
 * `createSalesModule({ extension })`; моки беруть лише дані без компонентів (`fields`, `statuses`,
 * `transitions`) — `createSalesMocks({ extension })`. Ключі модуля в `hide`, `move`, `place` і
 * `change` — типи нижче: модуль перейменує ключ — TypeScript покаже місце у файлі розширення (крім
 * вкладок: статус розширення теж вкладка, тож ключ вкладки — будь-який рядок). Пропозиції й замовлення
 * розширюються однаково (`SalesDocumentExtension`), ключі відрізняються лише другою датою.
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

import type {
  Order,
  OrderStatus,
  OrderTransitionId,
  Quote,
  QuoteStatus,
  QuoteTransitionId,
} from "./contract"
import type ukMessages from "./i18n/uk.json"

/** Ключі модуля для документа продажу; `Due` — поле другої дати («Дійсна до», «Виконати до»). */
export interface SalesDocumentIds<Due extends string = string> {
  column: "number" | "client" | "date" | Due | "total" | "status"
  filter: "clientId" | "date"
  /** Вкладки списку: «Усі» і статуси; статус розширення — теж вкладка з його ключем. */
  tab: "all" | (string & {})
  /** Ключові поля шапки картки. */
  field: "client" | "date" | Due | "total"
  /** Секції картки. */
  section: "lines"
  action: "edit" | "delete" | "print"
  /** Поля форми шапки (ключ — ім'я поля запису); рядки й знижка документа — редактор рядків. */
  formField: "clientId" | "date" | Due
}

/** Ключі модуля для пропозицій: ними сторінки модуля перевіряють свої списки. */
export type QuoteIds = SalesDocumentIds<"validUntil"> & {
  tab: "all" | QuoteStatus | (string & {})
}
export type QuoteColumnId = QuoteIds["column"]
export type QuoteFilterId = QuoteIds["filter"]
export type QuoteTabId = QuoteIds["tab"]
export type QuoteFieldId = QuoteIds["field"]
export type QuoteSectionId = QuoteIds["section"]
export type QuoteActionId = QuoteIds["action"]
export type QuoteFormFieldId = QuoteIds["formField"]

/** Ключі модуля для замовлень. */
export type OrderIds = SalesDocumentIds<"dueDate"> & {
  tab: "all" | OrderStatus | (string & {})
}
export type OrderColumnId = OrderIds["column"]
export type OrderFilterId = OrderIds["filter"]
export type OrderTabId = OrderIds["tab"]
export type OrderFieldId = OrderIds["field"]
export type OrderSectionId = OrderIds["section"]
export type OrderActionId = OrderIds["action"]
export type OrderFormFieldId = OrderIds["formField"]

/**
 * Розширення документа продажу: пропозиції (`QuotesExtension`) чи замовлення (`OrdersExtension`).
 * `D` — запис, `Ids` — ключі модуля, `S` і `T` — статуси й дії графа модуля.
 */
export interface SalesDocumentExtension<
  D,
  Ids extends SalesDocumentIds,
  S extends string = string,
  T extends string = string,
> {
  /** Нові поля шапки: схема, підписи, значення для моків (`lib/extension-fields`). */
  readonly fields?: readonly ExtensionField[]
  /**
   * Статуси документа: додати, сховати з вибору; `change` — підпис, тон чи іконка статусу модуля без
   * заміни. Новий статус досяжний дією `transitions`.
   */
  readonly statuses?: ExtensionStatusChanges<S>
  /**
   * Дозволені переходи (ADR-0057): нова дія зі своїм статусом; `change` — підпис, `from` і причина
   * дії модуля, але не `to`.
   */
  readonly transitions?: ExtensionTransitionChanges<T>
  /** Колонки списку; нова — з поля розширення (ключ — ключ поля); `change` — назва, ширина чи пріоритет. */
  readonly columns?: KeyedChanges<
    ExtensionColumn,
    Ids["column"],
    ExtensionColumnChange
  >
  /** Фільтри панелі списку; новий — з поля розширення (список, так/ні, дата). */
  readonly filters?: KeyedChanges<ExtensionFilter, Ids["filter"]>
  /** Вкладки-статуси списку з фільтром даними. */
  readonly tabs?: KeyedChanges<ExtensionTab, Ids["tab"]>
  /** Ключові поля шапки картки; нове — з поля розширення. */
  readonly recordFields?: KeyedChanges<Keyed, Ids["field"]>
  /** `false` — картка без журналу «Історія»: бекенд не веде журналу змін. За замовчуванням — є. */
  readonly history?: boolean
  /** `false` — без «Редагує …» (ADR-0051): бекенд без блокувань і так нічого не зламає. */
  readonly editLock?: boolean
  /** Стрічка картки замість «Історії»: `timelineModule.aside` модуля N1 чи свій компонент (ADR-0054). */
  readonly aside?: ExtensionAside<D>
  /** Секції картки — компоненти проекту в слотах. */
  readonly sections?: KeyedChanges<ExtensionSection<D>, Ids["section"]>
  /** Дії в шапці картки — компоненти проекту з правом `access`. */
  readonly actions?: KeyedChanges<ExtensionAction<D>, Ids["action"]>
  /**
   * Форма створення й зміни шапки (`lib/extension-form`): `add` — поле розширення з `fields`, `hide` і
   * `move` — поля модуля, `change` — підпис і підказка поля модуля.
   */
  readonly form?: ExtensionFormChanges<Ids["formField"]>
}

export type QuotesExtension = SalesDocumentExtension<
  Quote,
  QuoteIds,
  QuoteStatus,
  QuoteTransitionId
>
export type OrdersExtension = SalesDocumentExtension<
  Order,
  OrderIds,
  OrderStatus,
  OrderTransitionId
>

/** Рядки модуля (простір імен `B3-sales`, `i18n/uk.json`). */
export type SalesMessages = typeof ukMessages

export interface SalesExtension {
  readonly quotes?: QuotesExtension
  readonly orders?: OrdersExtension
  /** Перевизначення рядків модуля за ключами `i18n/*.json`, напр. назва чи пояснення списку. */
  readonly strings?: ModuleStrings<SalesMessages>
}

/** Те, що беруть моки: дані без компонентів (файл полів проекту не тягне інтерфейс у моки). */
export interface SalesMockExtension {
  readonly quotes?: Pick<QuotesExtension, "fields" | "statuses" | "transitions">
  readonly orders?: Pick<OrdersExtension, "fields" | "statuses" | "transitions">
}
