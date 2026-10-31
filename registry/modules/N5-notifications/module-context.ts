import { createContext, useContext } from "react"

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

export interface NotificationsModuleContextValue {
  readonly extension: NotificationsExtension
  readonly paths: NotificationsPaths
}

/** Розширення й адреси для сторінок модуля: їх дає фабрика в маршрутах. */
export const NotificationsModuleContext =
  createContext<NotificationsModuleContextValue | null>(null)

export function useNotificationsModule(): NotificationsModuleContextValue {
  const value = useContext(NotificationsModuleContext)
  if (!value)
    throw new Error(
      "N5-notifications: page rendered outside routes of createNotificationsModule()",
    )
  return value
}
