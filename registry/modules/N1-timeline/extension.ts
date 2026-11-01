/**
 * Тип розширення модуля N1 — публічний API модуля (ADR-0020, ADR-0025): несумісна зміна — мажорна
 * версія кіта й розділ «Як оновити розширення» в CHANGELOG.
 *
 * Розширення лежить у файлі проекту `src/extensions/N1-timeline.ts` і передається у фабрику
 * `createTimelineModule({ extension })`. На картку стрічка потрапляє лише тоді, коли проект сам поставив її
 * в слот: `aside: timelineModule.aside` у розширенні модуля картки.
 */
import type { RecordTimelineProps } from "@/components/erp/record-timeline"
import type { LocalizedText } from "@/lib/auth"
import type { ModuleStrings } from "@/lib/i18n-namespaces"

import type { TimelineTarget } from "./contract"
import type ukMessages from "./i18n/uk.json"

/** Стрічка на картках. */
export interface TimelineCardExtension extends Pick<
  RecordTimelineProps,
  | "messages"
  | "files"
  | "followers"
  | "activities"
  | "mentions"
  | "renderMention"
  | "maxFileBytes"
> {
  /** Назва блоку праворуч і вкладки на вузькому екрані; типово «Стрічка». */
  readonly label?: LocalizedText
}

/** Сторінка «Мої справи». */
export interface MyActivitiesExtension {
  /** Дій на сторінку, до 100; за замовчуванням 20. */
  readonly perPage?: number
  /**
   * Адреса картки запису; без неї чи з `undefined` назва запису в рядку лишається текстом. Адреси
   * карток знає проект: модуль не знає, які ще модулі стоять поруч.
   */
  readonly recordHref?: (record: TimelineTarget) => string | undefined
}

/** Рядки модуля (простір імен `N1-timeline`, `i18n/uk.json`). */
export type TimelineMessages = typeof ukMessages

export interface TimelineExtension {
  readonly card?: TimelineCardExtension
  /** `false`: бекенд без `GET /me/activities`, сторінки й пункту навігації немає. */
  readonly myActivities?: MyActivitiesExtension | false
  /** Перевизначення рядків модуля за ключами `i18n/*.json`. */
  readonly strings?: ModuleStrings<TimelineMessages>
}
