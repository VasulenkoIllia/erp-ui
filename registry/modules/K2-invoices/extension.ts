/**
 * Тип розширення модуля K2 — публічний API модуля (ADR-0020, ADR-0025): несумісна зміна — мажорна
 * версія кіта й розділ «Як оновити розширення» в CHANGELOG.
 *
 * Розширення лежить у файлі проекту `src/extensions/K2-invoices.ts(x)` і передається у фабрику
 * `createInvoicesModule({ extension })`; моки беруть лише дані без компонентів (`fields`, `statuses`,
 * `transitions`) — `createInvoicesMocks({ extension })`. Ключі модуля в `hide`, `move`, `place` і
 * `change` — типи нижче. Рахунки — під ключем `invoices`, кредит-ноти (ADR-0072) — під ключем
 * `creditNotes`.
 */
import type { ModuleStrings } from "@/lib/i18n-namespaces"
import type { DocumentExtension } from "@/components/templates/document-extension"

import type {
  CreditNote,
  CreditNoteStatus,
  CreditNoteTransitionId,
  Invoice,
  InvoiceStatus,
  InvoiceTransitionId,
} from "./contract"
import type ukMessages from "./i18n/uk.json"

/** Ключі модуля для рахунків: ними сторінки модуля перевіряють свої списки. */
export interface InvoiceIds {
  column: "number" | "client" | "date" | "dueDate" | "total" | "status"
  /** Фільтри списку; `currency` — валюта рахунку, коли проект підключив валюти компанії (ADR-0084). */
  filter: "clientId" | "date" | "currency"
  /** Вкладки списку: «Усі» і статуси; статус розширення — теж вкладка з його ключем. */
  tab: "all" | InvoiceStatus | (string & {})
  /**
   * Ключові поля шапки картки; `baseTotal` — сума в базовій валюті рахунку у валюті (ADR-0071), `credited`
   * — сума виставлених кредит-нот (ADR-0072), `paid` — сума оплат, `debt` — «До сплати» чи «Переплата»
   * (ADR-0073), `refunded` — сума повернень переплати (ADR-0083).
   */
  field:
    | "client"
    | "date"
    | "dueDate"
    | "total"
    | "baseTotal"
    | "credited"
    | "paid"
    | "refunded"
    | "debt"
  /** Секції картки: рядки, сторони й потік документів (ADR-0061, ADR-0068). */
  section: "lines" | "parties" | "flow"
  /**
   * Дії шапки; `registerPayment` — «Зареєструвати оплату», коли проект підключив оплати (ADR-0073);
   * `paymentLink` — QR-код і посилання на оплату боргу, `refundOverpayment` — «Повернути переплату», коли
   * проект підключив повернення (ADR-0083).
   */
  action:
    | "edit"
    | "copy"
    | "registerPayment"
    | "paymentLink"
    | "refundOverpayment"
    | "delete"
    | "print"
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
export type InvoiceDocumentExtension = DocumentExtension<
  Invoice,
  InvoiceIds,
  InvoiceStatus,
  InvoiceTransitionId
>

/**
 * Ключі модуля для кредит-нот (ADR-0072): ними сторінки модуля перевіряють свої списки. Кредит-ноту
 * створюють лише з рахунку, тож «Копіювати» немає; форма — дата й рядки.
 */
export interface CreditNoteIds {
  column: "number" | "client" | "invoice" | "date" | "total" | "status"
  filter: "clientId" | "date"
  tab: "all" | CreditNoteStatus | (string & {})
  field: "client" | "invoice" | "date" | "total" | "baseTotal"
  section: "lines" | "parties" | "flow"
  action: "edit" | "delete" | "print"
  formField: "date"
}
export type CreditNoteColumnId = CreditNoteIds["column"]
export type CreditNoteFilterId = CreditNoteIds["filter"]
export type CreditNoteTabId = CreditNoteIds["tab"]
export type CreditNoteFieldId = CreditNoteIds["field"]
export type CreditNoteSectionId = CreditNoteIds["section"]
export type CreditNoteActionId = CreditNoteIds["action"]
export type CreditNoteFormFieldId = CreditNoteIds["formField"]

/** Розширення кредит-ноти: поля, статуси й дії, список, картка й форма. */
export type CreditNoteDocumentExtension = DocumentExtension<
  CreditNote,
  CreditNoteIds,
  CreditNoteStatus,
  CreditNoteTransitionId
>

/** Рядки модуля (простір імен `K2-invoices`, `i18n/uk.json`). */
export type InvoicesMessages = typeof ukMessages

export interface InvoicesExtension {
  readonly invoices?: InvoiceDocumentExtension
  readonly creditNotes?: CreditNoteDocumentExtension
  /** Перевизначення рядків модуля за ключами `i18n/*.json`, напр. назва чи пояснення списку. */
  readonly strings?: ModuleStrings<InvoicesMessages>
}

/** Те, що беруть моки: дані без компонентів (файл полів проекту не тягне інтерфейс у моки). */
export interface InvoicesMockExtension {
  readonly invoices?: Pick<
    InvoiceDocumentExtension,
    "fields" | "statuses" | "transitions"
  >
  readonly creditNotes?: Pick<
    CreditNoteDocumentExtension,
    "fields" | "statuses" | "transitions"
  >
}
