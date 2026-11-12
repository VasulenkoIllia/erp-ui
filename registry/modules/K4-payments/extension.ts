/**
 * Тип розширення модуля K4 — публічний API модуля (ADR-0020, ADR-0025): несумісна зміна — мажорна версія
 * кіта й розділ «Як оновити розширення» в CHANGELOG.
 *
 * Розширення лежить у файлі проекту `src/extensions/K4-payments.ts(x)` і передається у фабрику
 * `createPaymentsModule({ extension })`; моки беруть лише дані без компонентів (`fields`, `statuses`,
 * `transitions`) — `createPaymentsMocks({ extension })`. Ключі модуля в `hide`, `move`, `place` і `change`
 * — типи нижче. Повернення (ADR-0083) — ключ `refunds` з тими самими частинами списку, картки й форми.
 */
import type { LocalizedText } from "@/lib/auth"
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
  Payment,
  PaymentMethod,
  PaymentStatus,
  PaymentTransitionId,
  RefundStatus,
  RefundTransitionId,
} from "./contract"
import type ukMessages from "./i18n/uk.json"

/** Ключі модуля для оплат: ними сторінки модуля перевіряють свої списки. */
export interface PaymentIds {
  column:
    "number" | "date" | "client" | "invoices" | "method" | "amount" | "status"
  filter: "clientId" | "date" | "method"
  /** Вкладки списку: «Усі» і статуси; статус розширення — теж вкладка з його ключем. */
  tab: "all" | PaymentStatus | (string & {})
  /** Ключові поля шапки картки; `baseAmount` — сума в базовій валюті оплати у валюті (ADR-0071). */
  field: "client" | "date" | "method" | "amount" | "baseAmount" | "reference"
  /** Секції картки: рахунки оплати й потік документів (ADR-0061). */
  section: "allocations" | "flow"
  /** Дій модуля в шапці немає: дії графа — на панелі дій; розширення додає свої. */
  action: never
  /** Поля форми (ключ — ім'я поля тіла запиту); рахунки — свій блок форми. */
  formField:
    "clientId" | "currency" | "date" | "method" | "amount" | "reference"
}
/**
 * Ключі модуля для повернень (ADR-0083): ті самі колонки, фільтри, поля, секції й поля форми, що в оплати;
 * вкладки — статуси повернення.
 */
export interface RefundIds extends Omit<PaymentIds, "tab"> {
  tab: "all" | RefundStatus | (string & {})
}

export type PaymentColumnId = PaymentIds["column"]
export type PaymentFilterId = PaymentIds["filter"]
export type PaymentTabId = PaymentIds["tab"]
export type PaymentFieldId = PaymentIds["field"]
export type PaymentSectionId = PaymentIds["section"]
export type PaymentFormFieldId = PaymentIds["formField"]

/** Спосіб оплати: ключ і підпис мовами інтерфейсу. */
export interface PaymentMethodOption extends Keyed {
  readonly label: LocalizedText
}

/** Рядки модуля (простір імен `K4-payments`, `i18n/uk.json`). */
export type PaymentsMessages = typeof ukMessages

/**
 * Частини документа модуля, які змінює розширення: поля, статуси й дії, список, картка й форма. Однакові в
 * оплати й повернення (ADR-0083), ключі — свої.
 */
export interface MoneyDocumentExtension<
  Ids extends Omit<PaymentIds, "tab"> & { tab: string },
  S extends string,
  T extends string,
> {
  /** Нові поля документа: схема, підписи, значення для моків (`lib/extension-fields`). */
  readonly fields?: readonly ExtensionField[]
  /**
   * Статуси документа: додати, сховати з вибору; `change` — підпис, тон чи іконка статусу модуля без заміни.
   * Новий статус досяжний дією `transitions`.
   */
  readonly statuses?: ExtensionStatusChanges<S>
  /** Дозволені переходи (ADR-0057): нова дія зі своїм статусом; `change` — підпис, `from` і причина. */
  readonly transitions?: ExtensionTransitionChanges<T>
  /** Колонки списку; нова — з поля розширення (ключ — ключ поля); `change` — назва, ширина чи пріоритет. */
  readonly columns?: KeyedChanges<
    ExtensionColumn,
    Ids["column"],
    ExtensionColumnChange
  >
  /** Фільтри панелі списку; новий — з поля розширення. */
  readonly filters?: KeyedChanges<ExtensionFilter, Ids["filter"]>
  /** Вкладки-статуси списку з фільтром даними. */
  readonly tabs?: KeyedChanges<ExtensionTab, Ids["tab"]>
  /** Ключові поля шапки картки; нове — з поля розширення. */
  readonly recordFields?: KeyedChanges<Keyed, Ids["field"]>
  /** Секції картки — компоненти проекту в слотах. */
  readonly sections?: KeyedChanges<ExtensionSection<Payment>, Ids["section"]>
  /** Дії в шапці картки — компоненти проекту з правом `access`. */
  readonly actions?: KeyedChanges<ExtensionAction<Payment>, Ids["action"]>
  /**
   * Форма реєстрації (`lib/extension-form`): `add` — поле розширення з `fields`, `hide` і `move` — поля
   * модуля, `change` — підпис і підказка поля модуля.
   */
  readonly form?: ExtensionFormChanges<Ids["formField"]>
}

/** Розширення повернення (ADR-0083): поля, статуси й дії, список, картка й форма. */
export type RefundsExtension = MoneyDocumentExtension<
  RefundIds,
  RefundStatus,
  RefundTransitionId
>

export interface PaymentsExtension extends MoneyDocumentExtension<
  PaymentIds,
  PaymentStatus,
  PaymentTransitionId
> {
  /** Способи оплати й повернення: свій спосіб проекту (`add`), сховати спосіб модуля (`hide`). */
  readonly methods?: KeyedChanges<PaymentMethodOption, PaymentMethod>
  /** `false` — картки без журналу «Історія»: бекенд не веде журналу змін. */
  readonly history?: boolean
  /** Стрічка картки замість «Історії»: `timelineModule.aside` модуля N1 чи свій компонент (ADR-0054). */
  readonly aside?: ExtensionAside<Payment>
  /** Повернення клієнтам (ADR-0083): ті самі частини, свої ключі. */
  readonly refunds?: RefundsExtension
  /** Перевизначення рядків модуля за ключами `i18n/*.json`. */
  readonly strings?: ModuleStrings<PaymentsMessages>
}

/** Те, що беруть моки: дані без компонентів (файл полів проекту не тягне інтерфейс у моки). */
export type PaymentsMockExtension = Pick<
  PaymentsExtension,
  "fields" | "statuses" | "transitions"
> & {
  readonly refunds?: Pick<
    RefundsExtension,
    "fields" | "statuses" | "transitions"
  >
}
