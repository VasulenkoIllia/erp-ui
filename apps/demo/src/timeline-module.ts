import { createTimelineModule } from "@/registry/modules/N1-timeline"

import { timelineExtension } from "@/extensions/N1-timeline"
import { MODULE_ROUTES } from "@/router"

/**
 * Модуль N1 «Стрічка запису» в демо на місці заглушки `/m/N1` (ADR-0054): фабрика з адресою й
 * розширенням проекту; маршрути й навігація — у `kit-modules.ts`, стрічка на картках — у розширенні B1
 * і на картці рахунку.
 */
export const timelineModule = createTimelineModule({
  basePath: MODULE_ROUTES.timelineModule,
  extension: timelineExtension,
})
