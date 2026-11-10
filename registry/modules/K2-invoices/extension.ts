/**
 * Тип розширення модуля K2 — публічний API модуля (ADR-0020, ADR-0025): несумісна зміна — мажорна
 * версія кіта й розділ «Як оновити розширення» в CHANGELOG.
 *
 * Розширення лежить у файлі проекту `src/extensions/K2-invoices.ts(x)` і передається у фабрику
 * `createInvoicesModule({ extension })`; моки беруть лише дані без компонентів (`fields`, `statuses`,
 * `transitions`) — `createInvoicesMocks({ extension })`. Ключі модуля в `hide`, `move`, `place` і
 * `change` — типи нижче. Рахунки — під ключем `invoices`: наступні документи модуля (кредит-нота K2b)
 * стануть поруч.
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

import type { Invoice, InvoiceStatus, InvoiceTransitionId } from "./contract"
import type ukMessages from "./i18n/uk.json"

/** Ключі модуля для рахунків: ними сторінки модуля перевіряють свої списки. */
export interface InvoiceIds {
  column: "number" | "client" | "date" | "dueDate" | "total" | "status"
  filter: "clientId" | "date"
  /** Вкладки списку: «Усі» і статуси; статус розширення — теж вкладка з його ключем. */
  tab: "all" | InvoiceStatus | (string & {})
  /** Ключові поля шапки картки; `baseTotal` — сума в базовій валюті рахунку у валюті (ADR-0071). */
  field: "client" | "date" | "dueDate" | "total" | "baseTotal"
  /** Секції картки: рядки, сторони й потік документів (ADR-0061, ADR-0068). */
  section: "lines" | "parties" | "flow"
  action: "edit" | "copy" | "delete" | "print"
  /** Поля форми шапки (ключ — ім'я поля запису); рядки, знижка й сторони — свої блоки форми. */
  formField: "clientId" | "date" | "dueDate" | "currency"
}
export type InvoiceColumnId = InvoiceIds["column"]
export type InvoiceFilterId = InvoiceIds["filter"]
export type InvoiceTabId = InvoiceIds["tab"]
export type InvoiceFieldId = InvoiceIds["field"]
export type InvoiceSectionId = InvoiceIds["section"]
export type InvoiceActionId = InvoiceIds["action"]
export type InvoiceFormFieldId = InvoiceIds["formField"]

/** Розширення рахунку: поля, статуси й дії, список, картка й форма. */
export interface InvoiceDocumentExtension {
  /** Нові поля шапки: схема, підписи, значення для моків (`lib/extension-fields`). */
  readonly fields?: readonly ExtensionField[]
  /**
   * Статуси рахунку: додати, сховати з вибору; `change` — підпис, тон чи іконка статусу модуля без
   * заміни. Новий статус досяжний дією `transitions`.
   */
  readonly statuses?: ExtensionStatusChanges<InvoiceStatus>
  /**
   * Дозволені переходи (ADR-0057): нова дія зі своїм статусом; `change` — підпис, `from` і причина дії
   * модуля, але не `to`.
   */
  readonly transitions?: ExtensionTransitionChanges<InvoiceTransitionId>
  /** Колонки списку; нова — з поля розширення (ключ — ключ поля); `change` — назва, ширина чи пріоритет. */
  readonly columns?: KeyedChanges<
    ExtensionColumn,
    InvoiceColumnId,
    ExtensionColumnChange
  >
  /** Фільтри панелі списку; новий — з поля розширення (список, так/ні, дата). */
  readonly filters?: KeyedChanges<ExtensionFilter, InvoiceFilterId>
  /** Вкладки-статуси списку з фільтром даними. */
  readonly tabs?: KeyedChanges<ExtensionTab, InvoiceTabId>
  /** Ключові поля шапки картки; нове — з поля розширення. */
  readonly recordFields?: KeyedChanges<Keyed, InvoiceFieldId>
  /** `false` — картка без журналу «Історія»: бекенд не веде журналу змін. За замовчуванням — є. */
  readonly history?: boolean
  /** `false` — без «Редагує …» (ADR-0051): бекенд без блокувань і так нічого не зламає. */
  readonly editLock?: boolean
  /** Стрічка картки замість «Історії»: `timelineModule.aside` модуля N1 чи свій компонент (ADR-0054). */
  readonly aside?: ExtensionAside<Invoice>
  /** Секції картки — компоненти проекту в слотах. */
  readonly sections?: KeyedChanges<ExtensionSection<Invoice>, InvoiceSectionId>
  /** Дії в шапці картки — компоненти проекту з правом `access`. */
  readonly actions?: KeyedChanges<ExtensionAction<Invoice>, InvoiceActionId>
  /**
   * Форма створення й зміни шапки (`lib/extension-form`): `add` — поле розширення з `fields`, `hide` і
   * `move` — поля модуля, `change` — підпис і підказка поля модуля.
   */
  readonly form?: ExtensionFormChanges<InvoiceFormFieldId>
}

/** Рядки модуля (простір імен `K2-invoices`, `i18n/uk.json`). */
export type InvoicesMessages = typeof ukMessages

export interface InvoicesExtension {
  readonly invoices?: InvoiceDocumentExtension
  /** Перевизначення рядків модуля за ключами `i18n/*.json`, напр. назва чи пояснення списку. */
  readonly strings?: ModuleStrings<InvoicesMessages>
}

/** Те, що беруть моки: дані без компонентів (файл полів проекту не тягне інтерфейс у моки). */
export interface InvoicesMockExtension {
  readonly invoices?: Pick<
    InvoiceDocumentExtension,
    "fields" | "statuses" | "transitions"
  >
}
