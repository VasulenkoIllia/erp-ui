/**
 * Модуль N1 «Стрічка запису» (SPEC §14, §17; ADR-0020, ADR-0025, ADR-0053, ADR-0054) — точка входу.
 *
 *   const timelineModule = createTimelineModule({ extension: timelineExtension })
 *   <Routes>{timelineModule.routes.map(…)}</Routes>  // чи useRoutes(timelineModule.routes)
 *   // Картка модуля: розширення зі слотом. Своя картка: <timelineModule.Timeline resource id />.
 *   const contactsExtension = { contacts: { aside: timelineModule.aside } }
 *
 * Фабрика повертає маршрут сторінки «Мої справи» (лінивим чанком, `Suspense` і межа помилок — у
 * застосунку), пункт навігації, ресурс для моків, `preload` за адресою, стрічку для картки. Без
 * розширення модуль такий, як у демо кіта. Файли модуля в проекті не правляться: зміни під клієнта — у
 * файлі розширення (`src/extensions/N1-timeline.ts`). Сама стрічка — `erp/record-timeline`, контракт —
 * `lib/timeline`. Модулі карток про N1 не знають: поки проект не поставив стрічку в слот, картка живе
 * без неї й не робить жодного запиту. Моки — окремо, `./mocks`.
 */
import { createElement, type ComponentType } from "react"

import type { ExtensionAside } from "@/components/templates/object-page"
import type { LocalizedText } from "@/lib/auth"
import { MODULE_ICONS } from "@/lib/icons"
import { lazyWithPreload, type PreloadableComponent } from "@/lib/lazy"
import { createModule, type ErpModule, type ModuleNavItem } from "@/lib/module"

import type { TimelineCardProps } from "./components/timeline-card"
import type { TimelineExtension } from "./extension"
import {
  TimelineModuleContext,
  timelinePaths,
  type TimelinePaths,
} from "./module-context"
import { TIMELINE_RESOURCES, type TimelineResource } from "./resources"

export type {
  MyActivitiesExtension,
  TimelineCardExtension,
  TimelineExtension,
  TimelineMessages,
} from "./extension"
export type { TimelineTarget } from "@/lib/timeline"
export type { TimelineCardProps } from "./components/timeline-card"
export type { TimelinePaths } from "./module-context"
export type { TimelineResource } from "./resources"

export const TIMELINE_MODULE_ID = "N1"

export type TimelineNavItem = ModuleNavItem

/** Запис картки: досить `id`; `version` перечитує стрічку після зміни запису. */
export interface TimelineRecord {
  readonly id: string
  readonly version?: number
}

/** Ресурс модуля — для сценаріїв моків. Окремого права немає: досить `<ресурс>:read`. */
export interface TimelineModule extends ErpModule<
  typeof TIMELINE_MODULE_ID,
  TimelinePaths,
  TimelineNavItem,
  TimelineResource
> {
  /** Стрічка з налаштуваннями `card` розширення, лінивим чанком: для своєї картки проекту. */
  readonly Timeline: ComponentType<TimelineCardProps>
  /** Слот стрічки для розширення модуля картки: `contacts: { aside: timelineModule.aside }`. */
  readonly aside: ExtensionAside<TimelineRecord>
}

export interface TimelineModuleOptions {
  /** Початок адрес модуля: `""` — `/my-activities`; `"/work"` — `/work/my-activities`. */
  readonly basePath?: string
  /** Розширення проекту (ADR-0020). */
  readonly extension?: TimelineExtension
}

const MY_ACTIVITIES_PAGE: PreloadableComponent<object> = lazyWithPreload(() =>
  import("./pages/my-activities-page").then((m) => m.MyActivitiesPage),
)
// Не React.lazy: збій чанка той запам'ятовує назавжди, і «Спробувати ще» картки не допоможе.
const TIMELINE_CARD = lazyWithPreload(() =>
  import("./components/timeline-card").then((m) => m.TimelineCard),
)

const NO_EXTENSION: TimelineExtension = {}
const DEFAULT_LABEL: LocalizedText = { uk: "Стрічка", en: "Timeline" }

export function createTimelineModule({
  basePath = "",
  extension = NO_EXTENSION,
}: TimelineModuleOptions = {}): TimelineModule {
  const paths = timelinePaths(basePath)
  const hasMyActivities = extension.myActivities !== false
  const { label = DEFAULT_LABEL, ...card } = extension.card ?? {}
  const Timeline: ComponentType<TimelineCardProps> = (props) =>
    createElement(TIMELINE_CARD, { ...card, ...props })
  return {
    ...createModule({
      id: TIMELINE_MODULE_ID,
      basePath,
      paths,
      pages: hasMyActivities
        ? [{ path: paths.myActivities, page: MY_ACTIVITIES_PAGE }]
        : [],
      // Адреса самого модуля (`/work`) — «Мої справи».
      home: hasMyActivities ? paths.myActivities : undefined,
      nav: hasMyActivities
        ? [
            {
              id: "N1-my-activities",
              label: { uk: "Мої справи", en: "My activities" },
              href: paths.myActivities,
              icon: MODULE_ICONS.N1,
            },
          ]
        : [],
      resources: TIMELINE_RESOURCES,
      context: TimelineModuleContext,
      value: { extension, paths },
    }),
    Timeline,
    aside: {
      label,
      component: ({ record, resource }) =>
        createElement(Timeline, {
          resource,
          id: record.id,
          version: record.version,
        }),
    },
  }
}
