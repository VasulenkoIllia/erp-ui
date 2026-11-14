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
import type { ModuleStrings } from "@/lib/i18n-namespaces"
import type { DocumentExtension } from "@/components/templates/document-extension"

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
 * Розширення документа продажу: пропозиції (`QuotesExtension`) чи замовлення (`OrdersExtension`) —
 * спільний тип документа кіта (`DocumentExtension`, ADR-0086). `D` — запис, `Ids` — ключі модуля, `S` і
 * `T` — статуси й дії графа модуля.
 */
export type SalesDocumentExtension<
  D,
  Ids extends SalesDocumentIds,
  S extends string = string,
  T extends string = string,
> = DocumentExtension<D, Ids, S, T>

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
