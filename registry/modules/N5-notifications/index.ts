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
import type { LucideIcon } from "lucide-react"
import { createElement, type ComponentType } from "react"
import { Navigate, type RouteObject } from "react-router"

import type { LocalizedText } from "@/lib/auth"
import { MODULE_ICONS } from "@/lib/icons"
import { lazyWithPreload, type PreloadableComponent } from "@/lib/lazy"

import type { NotificationsExtension } from "./extension"
import {
  NotificationsModuleContext,
  notificationsPaths,
  type NotificationsModuleContextValue,
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

export interface NotificationsNavItem {
  readonly id: string
  /** Підпис мовою інтерфейсу — `localizedText(label, language)` з `@/lib/auth`. */
  readonly label: LocalizedText
  readonly href: string
  readonly icon: LucideIcon
}

export interface NotificationsModule {
  readonly id: typeof NOTIFICATIONS_MODULE_ID
  readonly paths: NotificationsPaths
  readonly routes: RouteObject[]
  readonly nav: readonly NotificationsNavItem[]
  /** Ресурс модуля: сценарії моків. Прав немає: людина бачить лише своє. */
  readonly resources: readonly NotificationsResource[]
  /** Завантажити чанк сторінки модуля за адресою заздалегідь (наведення, фокус на посиланні). */
  readonly preload: (pathname: string) => void
}

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
  const context: NotificationsModuleContextValue = { extension, paths }
  const page = (Page: ComponentType) =>
    createElement(
      NotificationsModuleContext.Provider,
      { value: context },
      createElement(Page),
    )
  const routes: RouteObject[] = [
    { path: paths.inbox, element: page(INBOX_PAGE) },
    { path: paths.settings, element: page(SETTINGS_PAGE) },
  ]
  // Адреса самого модуля (`/account`) — сповіщення.
  if (basePath.replace(/\/+$/, ""))
    routes.push({
      path: basePath,
      element: createElement(Navigate, { to: paths.inbox, replace: true }),
    })
  return {
    id: NOTIFICATIONS_MODULE_ID,
    paths,
    routes,
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
    preload: (pathname) => {
      const path = pathname.split(/[?#]/)[0]
      if (path === paths.inbox) void INBOX_PAGE.preload()
      if (path === paths.settings) void SETTINGS_PAGE.preload()
    },
  }
}
