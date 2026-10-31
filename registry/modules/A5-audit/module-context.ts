import { createContext, useContext } from "react"

import type { AuditExtension } from "./extension"

/** Адреси сторінок модуля від `basePath` фабрики. */
export interface AuditPaths {
  readonly journal: string
}

export function auditPaths(basePath: string): AuditPaths {
  return { journal: `${basePath.replace(/\/+$/, "")}/audit` }
}

export interface AuditModuleContextValue {
  readonly extension: AuditExtension
  readonly paths: AuditPaths
}

/** Розширення й адреси для сторінок модуля: їх дає фабрика в маршрутах. */
export const AuditModuleContext = createContext<AuditModuleContextValue | null>(
  null,
)

export function useAuditModule(): AuditModuleContextValue {
  const value = useContext(AuditModuleContext)
  if (!value)
    throw new Error(
      "A5-audit: page rendered outside routes of createAuditModule()",
    )
  return value
}
