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
  ExtensionColumnChange,
  ExtensionField,
  ExtensionFilter,
  ExtensionTab,
} from "@/lib/extension-fields"
import type { ExtensionFormChanges } from "@/lib/extension-form"
import type { Keyed, KeyedChanges } from "@/lib/extensions"
import type { ModuleStrings } from "@/lib/i18n-namespaces"
import type { ExtensionStatusChanges } from "@/lib/statuses"
import type {
  ExtensionAction,
  ExtensionAside,
  ExtensionSection,
} from "@/components/templates/object-page"

import type { Contact, Organization, OrganizationStatus } from "./contract"
import type ukMessages from "./i18n/uk.json"

export type OrganizationColumnId =
  | "pin"
  | "name"
  | "status"
  | "code"
  | "segments"
  | "city"
  | "responsibleId"
  | "phone"
export type OrganizationFilterId = "type" | "segments" | "responsibleId"
/**
 * Вкладки списку організацій: «Усі» і статуси. Статус розширення — теж вкладка з його ключем, тож
 * ключ вкладки — будь-який рядок; підказки редактора — ключі модуля.
 */
export type OrganizationTabId = "all" | OrganizationStatus | (string & {})
/** Ключові поля шапки картки організації. */
export type OrganizationFieldId =
  "code" | "type" | "city" | "phone" | "responsibleId"
/** Рядки вкладки «Реквізити» картки організації. */
export type OrganizationDetailRowId =
  "code" | "iban" | "phone" | "email" | "city" | "segments"
/** Вкладки картки організації. */
export type OrganizationSectionId =
  "requisites" | "addresses" | "bankAccounts" | "contacts"
export type OrganizationActionId = "edit" | "pin"
/** Поля форми організації (ключ — ім'я поля запису). */
export type OrganizationFormFieldId =
  | "name"
  | "type"
  | "code"
  | "status"
  | "phone"
  | "email"
  | "city"
  | "segments"
  | "responsibleId"

export type ContactColumnId =
  | "pin"
  | "name"
  | "organization"
  | "responsibleId"
  | "position"
  | "phone"
  | "email"
  | "segments"
export type ContactFilterId = "segments" | "responsibleId"
export type ContactTabId = "all" | "representatives" | "private"
export type ContactFieldId =
  "organization" | "position" | "phone" | "email" | "responsibleId"
/** Рядки секції «Подробиці» картки контакту. */
export type ContactDetailRowId = "phone" | "email" | "position" | "segments"
/** Секції картки контакту. */
export type ContactSectionId = "details" | "organization"
export type ContactActionId = "edit" | "pin"
/** Поля форми контакту (ключ — ім'я поля запису). */
export type ContactFormFieldId =
  | "name"
  | "organizationId"
  | "position"
  | "phone"
  | "email"
  | "segments"
  | "responsibleId"

/** Ключі модуля для однієї сутності: список і картка. */
interface EntityIds {
  column: string
  filter: string
  tab: string
  field: string
  detailRow: string
  section: string
  action: string
  formField: string
}

/**
 * Зміни однієї сутності: поля, список (колонки, фільтри, вкладки), картка (шапка, секції, дії),
 * форма створення й зміни.
 */
export interface EntityExtension<T, K extends EntityIds> {
  /** Нові поля запису: схема, підписи, значення для моків (`lib/extension-fields`). */
  readonly fields?: readonly ExtensionField[]
  /**
   * Колонки списку; нова колонка — з поля розширення (ключ — ключ поля); `change` — назва, ширина
   * чи пріоритет колонки модуля без заміни.
   */
  readonly columns?: KeyedChanges<
    ExtensionColumn,
    K["column"],
    ExtensionColumnChange
  >
  /** Фільтри панелі списку; новий фільтр — з поля розширення (список, так/ні, дата). */
  readonly filters?: KeyedChanges<ExtensionFilter, K["filter"]>
  /** Вкладки-статуси списку з фільтром даними. */
  readonly tabs?: KeyedChanges<ExtensionTab, K["tab"]>
  /** Ключові поля шапки картки; нове — з поля розширення. */
  readonly recordFields?: KeyedChanges<Keyed, K["field"]>
  /**
   * Рядки «Подробиць» картки (в організації — вкладки «Реквізити»): сховати рядок модуля, напр.
   * посаду, якої бекенд не має. Без розширення — усі рядки.
   */
  readonly detailRows?: Pick<KeyedChanges<Keyed, K["detailRow"]>, "hide">
  /** `false` — картка без журналу «Історія»: бекенд не веде журналу змін. За замовчуванням — є. */
  readonly history?: boolean
  /** `false` — картка без «Редагує …» (ADR-0051); бекенд без блокувань і так нічого не зламає: 404 мовчить. */
  readonly editLock?: boolean
  /**
   * Стрічка картки замість «Історії»: `timelineModule.aside` модуля N1 чи свій компонент (ADR-0054).
   * Без неї картка працює як раніше й не робить запитів стрічки: бекенд без стрічки нічого не помітить.
   */
  readonly aside?: ExtensionAside<T>
  /** Секції (у картці організації — вкладки) — компоненти проекту в слотах. */
  readonly sections?: KeyedChanges<ExtensionSection<T>, K["section"]>
  /** Дії в шапці картки — компоненти проекту з правом `access`. */
  readonly actions?: KeyedChanges<ExtensionAction<T>, K["action"]>
  /**
   * Форма створення й зміни (`lib/extension-form`): `add` — поле розширення з `fields` (обов'язкове
   * — неодмінно), `hide` і `move` — поля модуля, `change` — підпис і підказка поля модуля.
   */
  readonly form?: ExtensionFormChanges<K["formField"]>
}

/** Ключі модуля для організацій: ними сторінки модуля перевіряють свої списки. */
export interface OrganizationIds {
  column: OrganizationColumnId
  filter: OrganizationFilterId
  tab: OrganizationTabId
  field: OrganizationFieldId
  detailRow: OrganizationDetailRowId
  section: OrganizationSectionId
  action: OrganizationActionId
  formField: OrganizationFormFieldId
}

export interface OrganizationsExtension extends EntityExtension<
  Organization,
  OrganizationIds
> {
  /**
   * Статуси організації: додати, сховати з вибору; `change` — підпис, тон чи іконка статусу модуля
   * без заміни (ключ модуля в `add` — заміна статусу цілком).
   */
  readonly statuses?: ExtensionStatusChanges<OrganizationStatus>
}

/** Ключі модуля для контактів. */
export interface ContactIds {
  column: ContactColumnId
  filter: ContactFilterId
  tab: ContactTabId
  field: ContactFieldId
  detailRow: ContactDetailRowId
  section: ContactSectionId
  action: ContactActionId
  formField: ContactFormFieldId
}

export type ContactPeopleExtension = EntityExtension<Contact, ContactIds>

/** Рядки модуля (простір імен `B1-contacts`, `i18n/uk.json`). */
export type ContactsMessages = typeof ukMessages

export interface ContactsExtension {
  readonly organizations?: OrganizationsExtension
  readonly contacts?: ContactPeopleExtension
  /** Перевизначення рядків модуля за ключами `i18n/*.json`, напр. назва чи пояснення списку. */
  readonly strings?: ModuleStrings<ContactsMessages>
}

/** Те, що беруть моки: дані без компонентів (файл полів проекту не тягне інтерфейс у моки). */
export interface ContactsMockExtension {
  readonly organizations?: Pick<OrganizationsExtension, "fields" | "statuses">
  readonly contacts?: Pick<ContactPeopleExtension, "fields">
}
