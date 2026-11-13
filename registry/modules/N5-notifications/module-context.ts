import { createModuleContext, type ModuleContextValue } from "@/lib/module"

import type { NotificationsExtension } from "./extension"

/** Адреси сторінок модуля від `basePath` фабрики. */
export interface NotificationsPaths {
  readonly inbox: string
  readonly settings: string
}

export function notificationsPaths(basePath: string): NotificationsPaths {
  const base = basePath.replace(/\/+$/, "")
  return { inbox: `${base}/inbox`, settings: `${base}/notification-settings` }
}

export type NotificationsModuleContextValue = ModuleContextValue<
  NotificationsExtension,
  NotificationsPaths
>

/** Розширення й адреси для сторінок модуля: їх дає фабрика в маршрутах. */
export const [NotificationsModuleContext, useNotificationsModule] =
  createModuleContext<NotificationsModuleContextValue>(
    "N5-notifications",
    "createNotificationsModule",
  )
