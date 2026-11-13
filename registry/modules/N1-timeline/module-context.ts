import { createModuleContext, type ModuleContextValue } from "@/lib/module"

import type { TimelineExtension } from "./extension"

/** Адреси сторінок модуля від `basePath` фабрики. */
export interface TimelinePaths {
  readonly myActivities: string
}

export function timelinePaths(basePath: string): TimelinePaths {
  const base = basePath.replace(/\/+$/, "")
  return { myActivities: `${base}/my-activities` }
}

export type TimelineModuleContextValue = ModuleContextValue<
  TimelineExtension,
  TimelinePaths
>

/** Розширення й адреси для сторінок модуля: їх дає фабрика в маршрутах. */
export const [TimelineModuleContext, useTimelineModule] =
  createModuleContext<TimelineModuleContextValue>(
    "N1-timeline",
    "createTimelineModule",
  )
