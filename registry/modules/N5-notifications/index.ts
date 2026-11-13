/**
 * Модуль N5 «Сповіщення» (SPEC §14, §17; ADR-0013, ADR-0014, ADR-0020, ADR-0025, ADR-0046) — точка
 * входу.
 *
 *   const notificationsModule = createNotificationsModule({ extension: notificationsExtension })
 *   <Routes>{notificationsModule.routes.map(…)}</Routes>  // чи useRoutes(notificationsModule.routes)
 *
 * Фабрика повертає маршрути React Router зі сторінками «Сповіщення» й «Налаштування сповіщень»
 * (лінивими чанками, `Suspense` і межа помилок — у застосунку), пункти навігації, ресурс для моків,
 * `preload` за адресою. Без розширення модуль такий, як у демо кіта. Файли модуля в проекті не
 * правляться: зміни під клієнта — у файлі розширення (`src/extensions/N5-notifications.ts`). Дзвіник,
 * лічильник у вкладці й реакція на push — `InboxBell` з `erp/notification-inbox` в оболонці, вони
 * працюють і без модуля. Моки — окремо, `./mocks`.
 */
import { MODULE_ICONS } from "@/lib/icons"
import { lazyWithPreload, type PreloadableComponent } from "@/lib/lazy"
import { createModule, type ErpModule, type ModuleNavItem } from "@/lib/module"

import type { NotificationsExtension } from "./extension"
import {
  NotificationsModuleContext,
  notificationsPaths,
  type NotificationsPaths,
} from "./module-context"
import {
  NOTIFICATIONS_RESOURCES,
  type NotificationsResource,
} from "./resources"

export type {
  NotificationsExtension,
  NotificationsInboxExtension,
  NotificationsMessages,
} from "./extension"
export type { NotificationsPaths } from "./module-context"
export type { NotificationsResource } from "./resources"

export const NOTIFICATIONS_MODULE_ID = "N5"

export type NotificationsNavItem = ModuleNavItem

/** Ресурс модуля — для сценаріїв моків. Прав немає: людина бачить лише своє. */
export type NotificationsModule = ErpModule<
  typeof NOTIFICATIONS_MODULE_ID,
  NotificationsPaths,
  NotificationsNavItem,
  NotificationsResource
>

export interface NotificationsModuleOptions {
  /** Початок адрес модуля: `""` — `/inbox`; `"/account"` — `/account/inbox`. */
  readonly basePath?: string
  /** Розширення проекту (ADR-0020). */
  readonly extension?: NotificationsExtension
}

const INBOX_PAGE: PreloadableComponent<object> = lazyWithPreload(() =>
  import("./pages/inbox-page").then((m) => m.InboxPage),
)
const SETTINGS_PAGE: PreloadableComponent<object> = lazyWithPreload(() =>
  import("./pages/settings-page").then((m) => m.SettingsPage),
)

const NO_EXTENSION: NotificationsExtension = {}

export function createNotificationsModule({
  basePath = "",
  extension = NO_EXTENSION,
}: NotificationsModuleOptions = {}): NotificationsModule {
  const paths = notificationsPaths(basePath)
  return createModule({
    id: NOTIFICATIONS_MODULE_ID,
    basePath,
    paths,
    pages: [
      { path: paths.inbox, page: INBOX_PAGE },
      { path: paths.settings, page: SETTINGS_PAGE },
    ],
    // Адреса самого модуля (`/account`) — сповіщення.
    home: paths.inbox,
    nav: [
      {
        id: "N5-inbox",
        label: { uk: "Сповіщення", en: "Notifications" },
        href: paths.inbox,
        icon: MODULE_ICONS.N5,
      },
      {
        id: "N5-settings",
        label: { uk: "Налаштування сповіщень", en: "Notification settings" },
        href: paths.settings,
        icon: MODULE_ICONS.N5,
      },
    ],
    resources: NOTIFICATIONS_RESOURCES,
    context: NotificationsModuleContext,
    value: { extension, paths },
  })
}
