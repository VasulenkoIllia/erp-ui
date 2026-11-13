import { createElement } from "react"
import { useRoutes } from "react-router"

import { PageState } from "@/registry/erp/page-state"
import type { ModuleId } from "@/registry/lib/icons"
import { moduleNavId, type ErpModule } from "@/registry/lib/module"

import { companyModule } from "@/company-module"
import { contactsModule } from "@/contacts-module"
import { salesModule } from "@/sales-module"
import type { KitModuleKey } from "@/router"
import { usersModule } from "@/users-module"
// Останнім: першим у цьому списку модуль міняє порядок виконання, і збирач розбиває вхідний чанк на
// дрібні шматки (плюс 5,7 КБ gzip і 23 попередні завантаження). Перевірено збіркою, ADR-0045.
import { auditModule } from "@/audit-module"
import { notificationsModule } from "@/notifications-module"
import { dictionariesModule } from "@/dictionaries-module"
import { importExportModule } from "@/import-export-module"
import { timelineModule } from "@/timeline-module"
import { invoicesModule } from "@/invoices-module"
import { paymentsModule } from "@/payments-module"

/**
 * Модулі кіта в демо (ADR-0025): так проект ставить модуль — фабрика з адресою й розширенням
 * проекту, маршрути — у своєму роутері, пункти — у своїй навігації (`moduleNavItems`). Сторінки
 * модуля — лінивими чанками, `Suspense` і межа помилок — в оболонці.
 */
export const KIT_MODULES = {
  contacts: contactsModule,
  salesModule,
  usersModule,
  companyModule,
  auditModule,
  notificationsModule,
  dictionariesModule,
  importExportModule,
  timelineModule,
  invoicesModule,
  paymentsModule,
} as const satisfies Record<KitModuleKey, ErpModule>

/** Модуль кіта на місці заглушки розділу (`/m/B1`, `/m/B3`, `/m/K2`, `/m/K4`, `/m/A2`, `/m/A1`, `/m/A5`, `/m/N5`, `/m/A6`, `/m/A4`, `/m/N1`); інший розділ — заглушка. */
export function kitModuleOf(id: ModuleId): ErpModule | undefined {
  return Object.values(KIT_MODULES).find((module) => module.id === id)
}

/** Сторінка модуля за адресою; невідома адреса всередині модуля — «не знайдено» з h1 сторінки. */
export function KitModuleRoutes({ moduleKey }: { moduleKey: KitModuleKey }) {
  return (
    useRoutes(KIT_MODULES[moduleKey].routes) ??
    createElement(PageState, { kind: "not-found", headingLevel: 1 })
  )
}

/** Пункт навігації модуля за адресою: список чи картка з нього, інша адреса модуля — перший пункт. */
export function kitModuleNavId(
  moduleKey: KitModuleKey,
  pathname: string,
): string | undefined {
  const { nav } = KIT_MODULES[moduleKey]
  return moduleNavId(nav, pathname) ?? nav[0]?.id
}
