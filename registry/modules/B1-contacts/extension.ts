/**
 * Тип розширення модуля B1 — публічний API модуля (ADR-0020, ADR-0025): несумісна зміна — мажорна
 * версія кіта й розділ «Як оновити розширення» в CHANGELOG.
 *
 * Розширення лежить у файлі проекту `src/extensions/B1-contacts.ts(x)` і передається у фабрику
 * `createContactsModule({ extension })`; моки беруть лише дані без компонентів (`fields`,
 * `statuses`) — `createContactsMocks({ extension })`. Ключі модуля в `hide`, `move` і `place` —
 * типи нижче: модуль перейменує ключ — TypeScript покаже місце у файлі розширення (крім вкладок
 * організацій: статус розширення теж вкладка, тож ключ вкладки — будь-який рядок).
 */
import type {
  ExtensionColumn,
  ExtensionField,
  ExtensionFilter,
  ExtensionTab,
} from "@/lib/extension-fields"
import type { Keyed, KeyedChanges } from "@/lib/extensions"
import type { MessagesOverride } from "@/lib/i18n-namespaces"
import type { ExtensionStatus } from "@/lib/statuses"
import type {
  ExtensionAction,
  ExtensionSection,
} from "@/components/templates/object-page"

import type { Contact, Organization, OrganizationStatus } from "./contract"
import type ukMessages from "./i18n/uk.json"

export type OrganizationColumnId =
  "pin" | "name" | "status" | "code" | "segments" | "city" | "phone"
export type OrganizationFilterId = "type" | "segments"
/**
 * Вкладки списку організацій: «Усі» і статуси. Статус розширення — теж вкладка з його ключем, тож
 * ключ вкладки — будь-який рядок; підказки редактора — ключі модуля.
 */
export type OrganizationTabId = "all" | OrganizationStatus | (string & {})
/** Ключові поля шапки картки організації. */
export type OrganizationFieldId = "code" | "type" | "city" | "phone"
/** Вкладки картки організації. */
export type OrganizationSectionId =
  "requisites" | "addresses" | "bankAccounts" | "contacts"
export type OrganizationActionId = "pin"

export type ContactColumnId =
  "pin" | "name" | "organization" | "position" | "phone" | "email" | "segments"
export type ContactFilterId = "segments"
export type ContactTabId = "all" | "representatives" | "private"
export type ContactFieldId = "organization" | "position" | "phone" | "email"
/** Секції картки контакту. */
export type ContactSectionId = "details" | "organization"
export type ContactActionId = "pin"

/** Ключі модуля для однієї сутності: список і картка. */
interface EntityIds {
  column: string
  filter: string
  tab: string
  field: string
  section: string
  action: string
}

/** Зміни однієї сутності: поля, список (колонки, фільтри, вкладки), картка (шапка, секції, дії). */
export interface EntityExtension<T, K extends EntityIds> {
  /** Нові поля запису: схема, підписи, значення для моків (`lib/extension-fields`). */
  readonly fields?: readonly ExtensionField[]
  /** Колонки списку; нова колонка — з поля розширення (ключ — ключ поля). */
  readonly columns?: KeyedChanges<ExtensionColumn, K["column"]>
  /** Фільтри панелі списку; новий фільтр — з поля розширення (список, так/ні, дата). */
  readonly filters?: KeyedChanges<ExtensionFilter, K["filter"]>
  /** Вкладки-статуси списку з фільтром даними. */
  readonly tabs?: KeyedChanges<ExtensionTab, K["tab"]>
  /** Ключові поля шапки картки; нове — з поля розширення. */
  readonly recordFields?: KeyedChanges<Keyed, K["field"]>
  /** Секції (у картці організації — вкладки) — компоненти проекту в слотах. */
  readonly sections?: KeyedChanges<ExtensionSection<T>, K["section"]>
  /** Дії в шапці картки — компоненти проекту з правом `access`. */
  readonly actions?: KeyedChanges<ExtensionAction<T>, K["action"]>
}

/** Ключі модуля для організацій: ними сторінки модуля перевіряють свої списки. */
export interface OrganizationIds {
  column: OrganizationColumnId
  filter: OrganizationFilterId
  tab: OrganizationTabId
  field: OrganizationFieldId
  section: OrganizationSectionId
  action: OrganizationActionId
}

export interface OrganizationsExtension extends EntityExtension<
  Organization,
  OrganizationIds
> {
  /** Статуси організації: додати, перейменувати (ключ модуля в `add`), сховати з вибору. */
  readonly statuses?: KeyedChanges<ExtensionStatus, OrganizationStatus>
}

/** Ключі модуля для контактів. */
export interface ContactIds {
  column: ContactColumnId
  filter: ContactFilterId
  tab: ContactTabId
  field: ContactFieldId
  section: ContactSectionId
  action: ContactActionId
}

export type ContactPeopleExtension = EntityExtension<Contact, ContactIds>

/** Рядки модуля (простір імен `B1-contacts`, `i18n/uk.json`). */
export type ContactsMessages = typeof ukMessages

export interface ContactsExtension {
  readonly organizations?: OrganizationsExtension
  readonly contacts?: ContactPeopleExtension
  /** Перевизначення рядків модуля за ключами `i18n/*.json`, напр. назва чи пояснення списку. */
  readonly strings?: {
    readonly uk?: MessagesOverride<ContactsMessages>
    readonly en?: MessagesOverride<ContactsMessages>
  }
}

/** Те, що беруть моки: дані без компонентів (файл полів проекту не тягне інтерфейс у моки). */
export interface ContactsMockExtension {
  readonly organizations?: Pick<OrganizationsExtension, "fields" | "statuses">
  readonly contacts?: Pick<ContactPeopleExtension, "fields">
}
