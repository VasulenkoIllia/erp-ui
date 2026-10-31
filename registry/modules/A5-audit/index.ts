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
import type { LucideIcon } from "lucide-react"
import { createElement, type ComponentType } from "react"
import { Navigate, type RouteObject } from "react-router"

import type { LocalizedText } from "@/lib/auth"
import { MODULE_ICONS } from "@/lib/icons"
import { lazyWithPreload, type PreloadableComponent } from "@/lib/lazy"

import type { AuditExtension } from "./extension"
import {
  AuditModuleContext,
  auditPaths,
  type AuditModuleContextValue,
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

export interface AuditNavItem {
  readonly id: string
  /** Підпис мовою інтерфейсу — `localizedText(label, language)` з `@/lib/auth`. */
  readonly label: LocalizedText
  readonly href: string
  readonly icon: LucideIcon
  /** Право, без якого пункт ховають (`<ресурс>:<дія>`): сторінка однаково покаже «Немає доступу». */
  readonly access?: { readonly resource: string; readonly action: string }
}

export interface AuditModule {
  readonly id: typeof AUDIT_MODULE_ID
  readonly paths: AuditPaths
  readonly routes: RouteObject[]
  readonly nav: readonly AuditNavItem[]
  /** Ресурс модуля: право `audit:read`, сценарії моків. */
  readonly resources: readonly AuditResource[]
  /** Завантажити чанк сторінки модуля за адресою заздалегідь (наведення, фокус на посиланні). */
  readonly preload: (pathname: string) => void
}

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
  const context: AuditModuleContextValue = { extension, paths }
  const page = (Page: ComponentType) =>
    createElement(
      AuditModuleContext.Provider,
      { value: context },
      createElement(Page),
    )
  const routes: RouteObject[] = [
    { path: paths.journal, element: page(JOURNAL_PAGE) },
  ]
  // Адреса самого модуля (`/settings`) — журнал.
  if (basePath.replace(/\/+$/, ""))
    routes.push({
      path: basePath,
      element: createElement(Navigate, { to: paths.journal, replace: true }),
    })
  return {
    id: AUDIT_MODULE_ID,
    paths,
    routes,
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
    preload: (pathname) => {
      if (pathname.split(/[?#]/)[0] === paths.journal)
        void JOURNAL_PAGE.preload()
    },
  }
}
