/**
 * Модуль A4 «Імпорт і експорт» (SPEC §14, §17; ADR-0020, ADR-0025, ADR-0049, ADR-0050) — точка входу.
 *
 *   const importExportModule = createImportExportModule({ basePath: "/settings", extension })
 *   <Routes>{importExportModule.routes.map(…)}</Routes>  // чи useRoutes(importExportModule.routes)
 *
 * Фабрика повертає маршрути React Router зі сторінками модуля (лінивими чанками, `Suspense` і межа
 * помилок — у застосунку): цілі імпорту й експорту, майстер імпорту, історію запусків; пункти навігації,
 * ресурс для прав і моків, `preload` за адресою. Без розширення модуль такий, як у демо кіта. Файли
 * модуля в проекті не правляться: зміни під клієнта — у файлі розширення
 * (`src/extensions/A4-import-export.ts`). Моки — окремо, `./mocks` (`createImportExportMocks`), щоб MSW
 * не потрапив у застосунок.
 */
import { HistoryIcon } from "lucide-react"

import { MODULE_ICONS } from "@/lib/icons"
import { lazyWithPreload, type PreloadableComponent } from "@/lib/lazy"
import { createModule, type ErpModule, type ModuleNavItem } from "@/lib/module"

import type { ImportExportExtension } from "./extension"
import {
  ImportExportModuleContext,
  importExportPaths,
  type ImportExportPaths,
} from "./module-context"
import {
  IMPORT_EXPORT_RESOURCES,
  IMPORT_RUNS,
  type ImportExportResource,
} from "./resources"

export type {
  ImportExportExtension,
  ImportExportMessages,
  ImportExportTargetChange,
  ImportExportTargetId,
  ImportHistoryExtension,
  ImportRunColumnId,
  ImportRunFilterId,
} from "./extension"
export { importRunPath, type ImportExportPaths } from "./module-context"
export type { ImportExportResource } from "./resources"
export type {
  ImportExportTargetDefinition,
  TargetFieldDefinition,
} from "./targets"

export const IMPORT_EXPORT_MODULE_ID = "A4"

export type ImportExportNavItem = ModuleNavItem

/** Ресурс модуля: право `import-runs:read`, сценарії моків. */
export type ImportExportModule = ErpModule<
  typeof IMPORT_EXPORT_MODULE_ID,
  ImportExportPaths,
  ImportExportNavItem,
  ImportExportResource
>

export interface ImportExportModuleOptions {
  /** Початок адрес модуля: `""` — `/import-export`; `"/settings"` — `/settings/import-export`. */
  readonly basePath?: string
  /** Розширення проекту (ADR-0020). */
  readonly extension?: ImportExportExtension
}

const PAGES = {
  targets: lazyWithPreload(() =>
    import("./pages/targets-page").then((m) => m.TargetsPage),
  ),
  history: lazyWithPreload(() =>
    import("./pages/history-page").then((m) => m.HistoryPage),
  ),
  run: lazyWithPreload(() => import("./pages/run-page").then((m) => m.RunPage)),
} satisfies Record<keyof ImportExportPaths, PreloadableComponent<object>>

const NO_EXTENSION: ImportExportExtension = {}

export function createImportExportModule({
  basePath = "",
  extension = NO_EXTENSION,
}: ImportExportModuleOptions = {}): ImportExportModule {
  const paths = importExportPaths(basePath)
  const hasHistory = extension.history?.page !== false
  const nav: ImportExportNavItem[] = [
    {
      id: "A4-targets",
      label: { uk: "Імпорт і експорт", en: "Import and export" },
      href: paths.targets,
      icon: MODULE_ICONS.A4,
    },
  ]
  if (hasHistory)
    nav.push({
      id: "A4-history",
      label: { uk: "Історія імпорту", en: "Import history" },
      href: paths.history,
      icon: HistoryIcon,
      access: { resource: IMPORT_RUNS, action: "read" },
    })
  return createModule({
    id: IMPORT_EXPORT_MODULE_ID,
    basePath,
    paths,
    pages: [
      { path: paths.targets, page: PAGES.targets },
      { path: paths.run, page: PAGES.run },
      ...(hasHistory ? [{ path: paths.history, page: PAGES.history }] : []),
    ],
    // Адреса самого модуля (`/settings`) — цілі.
    home: paths.targets,
    nav,
    resources: IMPORT_EXPORT_RESOURCES,
    context: ImportExportModuleContext,
    value: { extension, paths },
  })
}
