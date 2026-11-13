/**
 * Модуль A5 «Аудит та історія» (SPEC §14, §17; ADR-0013, ADR-0020, ADR-0025, ADR-0045) — точка входу.
 *
 *   const auditModule = createAuditModule({ basePath: "/settings", extension: auditExtension })
 *   <Routes>{auditModule.routes.map(…)}</Routes>  // чи useRoutes(auditModule.routes)
 *
 * Фабрика повертає маршрут React Router зі сторінкою журналу (лінивим чанком, `Suspense` і межа
 * помилок — у застосунку), пункт навігації з правом, ресурс для прав і моків, `preload` за адресою.
 * Без розширення модуль такий, як у демо кіта. Файли модуля в проекті не правляться: зміни під
 * клієнта — у файлі розширення (`src/extensions/A5-audit.ts`). Шухляда історії на картках — спільна
 * частина кіта `erp/record-history`, вона працює й без модуля. Моки — окремо, `./mocks`.
 */
import { MODULE_ICONS } from "@/lib/icons"
import { lazyWithPreload, type PreloadableComponent } from "@/lib/lazy"
import { createModule, type ErpModule, type ModuleNavItem } from "@/lib/module"

import type { AuditExtension } from "./extension"
import {
  AuditModuleContext,
  auditPaths,
  type AuditPaths,
} from "./module-context"
import { AUDIT, AUDIT_RESOURCES, type AuditResource } from "./resources"

export type {
  AuditExtension,
  AuditJournalExtension,
  AuditMessages,
} from "./extension"
export type { AuditPaths } from "./module-context"
export type { AuditResource } from "./resources"

export const AUDIT_MODULE_ID = "A5"

export type AuditNavItem = ModuleNavItem

/** Ресурс модуля: право `audit:read`, сценарії моків. */
export type AuditModule = ErpModule<
  typeof AUDIT_MODULE_ID,
  AuditPaths,
  AuditNavItem,
  AuditResource
>

export interface AuditModuleOptions {
  /** Початок адрес модуля: `""` — `/audit`; `"/settings"` — `/settings/audit`. */
  readonly basePath?: string
  /** Розширення проекту (ADR-0020). */
  readonly extension?: AuditExtension
}

const JOURNAL_PAGE: PreloadableComponent<object> = lazyWithPreload(() =>
  import("./pages/journal-page").then((m) => m.JournalPage),
)

const NO_EXTENSION: AuditExtension = {}

export function createAuditModule({
  basePath = "",
  extension = NO_EXTENSION,
}: AuditModuleOptions = {}): AuditModule {
  const paths = auditPaths(basePath)
  return createModule({
    id: AUDIT_MODULE_ID,
    basePath,
    paths,
    pages: [{ path: paths.journal, page: JOURNAL_PAGE }],
    // Адреса самого модуля (`/settings`) — журнал.
    home: paths.journal,
    nav: [
      {
        id: "A5-audit",
        label: { uk: "Журнал аудиту", en: "Audit log" },
        href: paths.journal,
        icon: MODULE_ICONS.A5,
        access: { resource: AUDIT, action: "read" },
      },
    ],
    resources: AUDIT_RESOURCES,
    context: AuditModuleContext,
    value: { extension, paths },
  })
}
