/**
 * Тип розширення модуля B3 — публічний API модуля (ADR-0020, ADR-0025): несумісна зміна — мажорна
 * версія кіта й розділ «Як оновити розширення» в CHANGELOG.
 *
 * Розширення лежить у файлі проекту `src/extensions/B3-sales.ts(x)` і передається у фабрику
 * `createSalesModule({ extension })`; моки беруть лише дані без компонентів (`fields`, `statuses`,
 * `transitions`, `lineFields`) — `createSalesMocks({ extension })`. Ключі модуля в `hide`, `move`,
 * `place` і `change` — типи нижче: модуль перейменує ключ — TypeScript покаже місце у файлі розширення (крім
 * вкладок: статус розширення теж вкладка, тож ключ вкладки — будь-який рядок). Пропозиції й замовлення
 * розширюються однаково (`SalesDocumentExtension`), ключі відрізняються лише другою датою.
 */
import type { ModuleStrings } from "@/lib/i18n-namespaces"
import type {
  DocumentExtension,
  DocumentLinesExtension,
} from "@/components/templates/document-extension"

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
  /** Секції картки: рядки й потік документів (ADR-0061). */
  section: "lines" | "flow"
  action: "edit" | "copy" | "delete" | "print"
  /** Поля форми шапки (ключ — ім'я поля запису); рядки й знижка документа — редактор рядків. */
  formField: "clientId" | "date" | Due
  /** Масові дії панелі вибраного; свої в пропозицій і замовлень (`QuoteIds`, `OrderIds`). */
  bulkAction: "submit" | "complete" | "cancel" | "delete"
  /** Блоки аркуша друку; `fields` — поля розширення з `print.fields`. */
  sheetBlock:
    | "company"
    | "title"
    | "parties"
    | "fields"
    | "lines"
    | "totals"
    | "signatures"
}

/** Ключі модуля для пропозицій: ними сторінки модуля перевіряють свої списки. */
export type QuoteIds = SalesDocumentIds<"validUntil"> & {
  tab: "all" | QuoteStatus | (string & {})
  bulkAction: "submit" | "cancel" | "delete"
}
export type QuoteColumnId = QuoteIds["column"]
export type QuoteFilterId = QuoteIds["filter"]
export type QuoteTabId = QuoteIds["tab"]
export type QuoteFieldId = QuoteIds["field"]
export type QuoteSectionId = QuoteIds["section"]
export type QuoteActionId = QuoteIds["action"]
export type QuoteFormFieldId = QuoteIds["formField"]
export type QuoteBulkActionId = QuoteIds["bulkAction"]
export type QuoteSheetBlockId = QuoteIds["sheetBlock"]

/** Ключі модуля для замовлень. */
export type OrderIds = SalesDocumentIds<"dueDate"> & {
  tab: "all" | OrderStatus | (string & {})
  bulkAction: "submit" | "complete" | "cancel" | "delete"
}
export type OrderColumnId = OrderIds["column"]
export type OrderFilterId = OrderIds["filter"]
export type OrderTabId = OrderIds["tab"]
export type OrderFieldId = OrderIds["field"]
export type OrderSectionId = OrderIds["section"]
export type OrderActionId = OrderIds["action"]
export type OrderFormFieldId = OrderIds["formField"]
export type OrderBulkActionId = OrderIds["bulkAction"]
export type OrderSheetBlockId = OrderIds["sheetBlock"]

/**
 * Розширення документа продажу: пропозиції (`QuotesExtension`) чи замовлення (`OrdersExtension`) —
 * спільний тип документа кіта (`DocumentExtension` з полями рядка `DocumentLinesExtension`, ADR-0086).
 * `D` — запис, `Ids` — ключі модуля, `S` і `T` — статуси й дії графа модуля.
 */
export type SalesDocumentExtension<
  D,
  Ids extends SalesDocumentIds,
  S extends string = string,
  T extends string = string,
> = DocumentExtension<D, Ids, S, T> & DocumentLinesExtension

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
  readonly quotes?: Pick<
    QuotesExtension,
    "fields" | "statuses" | "transitions" | "lineFields"
  >
  readonly orders?: Pick<
    OrdersExtension,
    "fields" | "statuses" | "transitions" | "lineFields"
  >
}
