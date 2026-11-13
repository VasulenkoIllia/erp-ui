import { createModuleContext, type ModuleContextValue } from "@/lib/module"

import type { AuditExtension } from "./extension"

/** Адреси сторінок модуля від `basePath` фабрики. */
export interface AuditPaths {
  readonly journal: string
}

export function auditPaths(basePath: string): AuditPaths {
  return { journal: `${basePath.replace(/\/+$/, "")}/audit` }
}

export type AuditModuleContextValue = ModuleContextValue<
  AuditExtension,
  AuditPaths
>

/** Розширення й адреси для сторінок модуля: їх дає фабрика в маршрутах. */
export const [AuditModuleContext, useAuditModule] =
  createModuleContext<AuditModuleContextValue>("A5-audit", "createAuditModule")
