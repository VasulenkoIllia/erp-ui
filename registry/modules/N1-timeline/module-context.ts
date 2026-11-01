import { createContext, useContext } from "react"

import type { TimelineExtension } from "./extension"

/** Адреси сторінок модуля від `basePath` фабрики. */
export interface TimelinePaths {
  readonly myActivities: string
}

export function timelinePaths(basePath: string): TimelinePaths {
  const base = basePath.replace(/\/+$/, "")
  return { myActivities: `${base}/my-activities` }
}

export interface TimelineModuleContextValue {
  readonly extension: TimelineExtension
  readonly paths: TimelinePaths
}

/** Розширення й адреси для сторінок модуля: їх дає фабрика в маршрутах. */
export const TimelineModuleContext =
  createContext<TimelineModuleContextValue | null>(null)

export function useTimelineModule(): TimelineModuleContextValue {
  const value = useContext(TimelineModuleContext)
  if (!value)
    throw new Error(
      "N1-timeline: page rendered outside routes of createTimelineModule()",
    )
  return value
}
