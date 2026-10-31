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
import { HistoryIcon, type LucideIcon } from "lucide-react"
import { createElement, type ComponentType } from "react"
import { Navigate, type RouteObject } from "react-router"

import type { LocalizedText } from "@/lib/auth"
import { MODULE_ICONS } from "@/lib/icons"
import { lazyWithPreload, type PreloadableComponent } from "@/lib/lazy"

import type { ImportExportExtension } from "./extension"
import {
  ImportExportModuleContext,
  importExportPaths,
  type ImportExportModuleContextValue,
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

export interface ImportExportNavItem {
  readonly id: string
  /** Підпис мовою інтерфейсу — `localizedText(label, language)` з `@/lib/auth`. */
  readonly label: LocalizedText
  readonly href: string
  readonly icon: LucideIcon
  /** Право, без якого пункт ховають (`<ресурс>:<дія>`): сторінка однаково покаже «Немає доступу». */
  readonly access?: { readonly resource: string; readonly action: string }
}

export interface ImportExportModule {
  readonly id: typeof IMPORT_EXPORT_MODULE_ID
  readonly paths: ImportExportPaths
  readonly routes: RouteObject[]
  readonly nav: readonly ImportExportNavItem[]
  /** Ресурс модуля: право `import-runs:read`, сценарії моків. */
  readonly resources: readonly ImportExportResource[]
  /** Завантажити чанк сторінки модуля за адресою заздалегідь (наведення, фокус на посиланні). */
  readonly preload: (pathname: string) => void
}

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
  const context: ImportExportModuleContextValue = { extension, paths }
  const page = (Page: ComponentType) =>
    createElement(
      ImportExportModuleContext.Provider,
      { value: context },
      createElement(Page),
    )
  const hasHistory = extension.history?.page !== false
  const routes: RouteObject[] = [
    { path: paths.targets, element: page(PAGES.targets) },
    { path: paths.run, element: page(PAGES.run) },
  ]
  if (hasHistory)
    routes.push({ path: paths.history, element: page(PAGES.history) })
  // Адреса самого модуля (`/settings`) — цілі.
  if (basePath.replace(/\/+$/, ""))
    routes.push({
      path: basePath,
      element: createElement(Navigate, { to: paths.targets, replace: true }),
    })
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
  const preload = (pathname: string) => {
    const path = pathname.split(/[?#]/)[0] ?? ""
    if (path === paths.targets) void PAGES.targets.preload()
    else if (path === paths.history && hasHistory) void PAGES.history.preload()
    else if (path.startsWith(`${paths.targets}/`)) void PAGES.run.preload()
  }
  return {
    id: IMPORT_EXPORT_MODULE_ID,
    paths,
    routes,
    nav,
    resources: IMPORT_EXPORT_RESOURCES,
    preload,
  }
}
