/**
 * Тип розширення модуля N5 — публічний API модуля (ADR-0020, ADR-0025): несумісна зміна — мажорна
 * версія кіта й розділ «Як оновити розширення» в CHANGELOG.
 *
 * Розширення лежить у файлі проекту `src/extensions/N5-notifications.ts` і передається у фабрику
 * `createNotificationsModule({ extension })`. Події й канали дає сервер, тож колонок, фільтрів і
 * полів тут немає.
 */
import type { ModuleStrings } from "@/lib/i18n-namespaces"

import type ukMessages from "./i18n/uk.json"

/** Сторінка «Сповіщення». */
export interface NotificationsInboxExtension {
  /** Сповіщень на сторінку; за замовчуванням 20. */
  readonly perPage?: number
}

/** Рядки модуля (простір імен `N5-notifications`, `i18n/uk.json`). */
export type NotificationsMessages = typeof ukMessages

export interface NotificationsExtension {
  readonly inbox?: NotificationsInboxExtension
  /** Перевизначення рядків модуля за ключами `i18n/*.json`. */
  readonly strings?: ModuleStrings<NotificationsMessages>
}
