/**
 * Тип розширення модуля A5 — публічний API модуля (ADR-0020, ADR-0025): несумісна зміна — мажорна
 * версія кіта й розділ «Як оновити розширення» в CHANGELOG.
 *
 * Розширення лежить у файлі проекту `src/extensions/A5-audit.ts` і передається у фабрику
 * `createAuditModule({ extension })`.
 */
import type { LocalizedText } from "@/lib/auth"
import type { ModuleStrings } from "@/lib/i18n-namespaces"

import type ukMessages from "./i18n/uk.json"

/** Сторінка журналу. */
export interface AuditJournalExtension {
  /**
   * Назви дій проекту мовами: `{ "invoices.paid": { uk: "Оплата рахунку", en: "Invoice paid" } }`.
   * Сервер може давати їх сам (`actionLabel`), назва розширення важливіша.
   */
  readonly actionLabels?: Readonly<Record<string, LocalizedText>>
  /** `false` — без кнопки «Експорт CSV»: бекенд не має `GET /audit-events/export`. За замовчуванням — є. */
  readonly export?: boolean
}

/** Рядки модуля (простір імен `A5-audit`, `i18n/uk.json`). */
export type AuditMessages = typeof ukMessages

export interface AuditExtension {
  readonly journal?: AuditJournalExtension
  /** Перевизначення рядків модуля за ключами `i18n/*.json`. */
  readonly strings?: ModuleStrings<AuditMessages>
}
