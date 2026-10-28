/**
 * Тип розширення модуля A2 — публічний API модуля (ADR-0020, ADR-0025): несумісна зміна — мажорна
 * версія кіта й розділ «Як оновити розширення» в CHANGELOG.
 *
 * Розширення лежить у файлі проекту `src/extensions/A2-users.ts(x)` і передається у фабрику
 * `createUsersModule({ extension })`; моки беруть лише дані без компонентів (`fields`) —
 * `createUsersMocks({ extension })`. Ключі модуля в `hide`, `move` і `place` — типи нижче: модуль
 * перейменує ключ — TypeScript покаже місце у файлі розширення.
 *
 * Зміни згруповано за сутностями (`users`, `roles`): запрошення (крок A2b2b2) і права на рівні
 * записів (A2c) з'являться новими необов'язковими ключами поруч, тож наявні файли розширення не
 * ламаються.
 * Ключі модуля (`User…Id`, `UserStatus`) у мінорних версіях можуть доповнюватися: на них не
 * будують вичерпних `Record` чи `switch` без `default`.
 */
import type {
  ExtensionColumn,
  ExtensionColumnChange,
  ExtensionField,
  ExtensionFilter,
  ExtensionTab,
} from "@/lib/extension-fields"
import type { Keyed, KeyedChanges } from "@/lib/extensions"
import type { ModuleStrings } from "@/lib/i18n-namespaces"
import type {
  ExtensionAction,
  ExtensionSection,
} from "@/components/templates/object-page"

import type { User, UserStatus } from "./contract"
import type ukMessages from "./i18n/uk.json"

export type UserColumnId =
  | "name"
  | "email"
  | "position"
  | "status"
  | "roles"
  | "twoFactor"
  | "lastSignInAt"
export type UserFilterId = "roles" | "twoFactor"
/** Вкладки списку: «Усі» і статуси. */
export type UserTabId = "all" | UserStatus
/** Ключові поля шапки картки людини. */
export type UserFieldId = "email" | "position" | "roles" | "lastSignInAt"
/** Вкладки картки людини; «Історія» — окремо (`history`). */
export type UserSectionId = "access" | "roles" | "sessions"
export type UserActionId = "impersonate"

/** Ключі модуля для людей: ними сторінки модуля перевіряють свої списки. */
export interface UserIds {
  column: UserColumnId
  filter: UserFilterId
  tab: UserTabId
  field: UserFieldId
  section: UserSectionId
  action: UserActionId
}

/**
 * Зміни людей: поля, список (колонки, фільтри, вкладки), картка (шапка, вкладки, дії). Форми немає:
 * людину створює запрошення, а ролі й доступ змінюють вкладки картки.
 */
export interface UserPeopleExtension {
  /** Нові поля запису: схема, підписи, значення для моків (`lib/extension-fields`). */
  readonly fields?: readonly ExtensionField[]
  /**
   * Колонки списку; нова колонка — з поля розширення (ключ — ключ поля); `change` — назва, ширина
   * чи пріоритет колонки модуля без заміни.
   */
  readonly columns?: KeyedChanges<
    ExtensionColumn,
    UserColumnId,
    ExtensionColumnChange
  >
  /** Фільтри панелі списку; новий фільтр — з поля розширення. */
  readonly filters?: KeyedChanges<ExtensionFilter, UserFilterId>
  /** Вкладки-статуси списку з фільтром даними. */
  readonly tabs?: KeyedChanges<ExtensionTab, UserTabId>
  /** Ключові поля шапки картки; нове — з поля розширення. */
  readonly recordFields?: KeyedChanges<Keyed, UserFieldId>
  /** `false` — картка без журналу «Історія»: бекенд не веде журналу змін. За замовчуванням — є. */
  readonly history?: boolean
  /** Вкладки картки — компоненти проекту в слотах. */
  readonly sections?: KeyedChanges<ExtensionSection<User>, UserSectionId>
  /** Дії в шапці картки — компоненти проекту з правом `access`. */
  readonly actions?: KeyedChanges<ExtensionAction<User>, UserActionId>
}

/** Сторінка «Ролі й права» (ADR-0033). */
export interface UserRolesExtension {
  /**
   * `false` — модуль без сторінки ролей і її пункту навігації: ролі веде інша система чи бекенд
   * їх не віддає. Ролі людини на її картці лишаються. За замовчуванням — є.
   */
  readonly page?: boolean
}

/** Рядки модуля (простір імен `A2-users`, `i18n/uk.json`). */
export type UsersMessages = typeof ukMessages

export interface UsersExtension {
  readonly users?: UserPeopleExtension
  readonly roles?: UserRolesExtension
  /** Перевизначення рядків модуля за ключами `i18n/*.json`, напр. назва чи пояснення списку. */
  readonly strings?: ModuleStrings<UsersMessages>
}

/** Те, що беруть моки: дані без компонентів (файл полів проекту не тягне інтерфейс у моки). */
export interface UsersMockExtension {
  readonly users?: Pick<UserPeopleExtension, "fields">
}
