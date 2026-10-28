import { createElement } from "react"
import { useRoutes, type RouteObject } from "react-router"

import type { NavItem } from "@/registry/erp/app-shell"
import { PageState } from "@/registry/erp/page-state"
import {
  hasPermission,
  localizedText,
  type LocalizedText,
} from "@/registry/lib/auth"
import type { ModuleId } from "@/registry/lib/icons"

import { contactsModule } from "@/contacts-module"
import type { KitModuleKey } from "@/router"
import { usersModule } from "@/users-module"

/**
 * Модулі кіта в демо (ADR-0025): так проект ставить модуль — фабрика з адресою й розширенням
 * проекту, маршрути — у своєму роутері, пункти — у своїй навігації. Сторінки модуля — лінивими
 * чанками, `Suspense` і межа помилок — в оболонці.
 */
interface KitModule {
  readonly id: string
  readonly routes: RouteObject[]
  readonly nav: readonly {
    readonly id: string
    readonly label: LocalizedText
    readonly href: string
    readonly icon: NavItem["icon"]
    readonly access?: { readonly resource: string; readonly action: string }
  }[]
  readonly preload: (pathname: string) => void
}

export const KIT_MODULES = {
  contacts: contactsModule,
  usersModule,
} as const satisfies Record<KitModuleKey, KitModule>

/** Модуль кіта на місці заглушки розділу (`/m/B1`, `/m/A2`); інший розділ — заглушка. */
export function kitModuleOf(id: ModuleId): KitModule | undefined {
  return Object.values(KIT_MODULES).find((module) => module.id === id)
}

/** Сторінка модуля за адресою; невідома адреса всередині модуля — «не знайдено» з h1 сторінки. */
export function KitModuleRoutes({ moduleKey }: { moduleKey: KitModuleKey }) {
  return (
    useRoutes(KIT_MODULES[moduleKey].routes) ??
    createElement(PageState, { kind: "not-found", headingLevel: 1 })
  )
}

/**
 * Пункти модуля в навігації оболонки мовою інтерфейсу; пункт із правом (`access`) — лише тому, хто
 * його має (профіль ще вантажиться — без таких пунктів).
 */
export function kitModuleNavItems(
  module: KitModule,
  language: string,
  permissions: readonly string[] | undefined,
): NavItem[] {
  const allowed = ({ access }: KitModule["nav"][number]) =>
    !access ||
    (permissions !== undefined &&
      hasPermission(permissions, access.resource, access.action))
  return module.nav.filter(allowed).map((item) => ({
    id: item.id,
    label: localizedText(item.label, language) ?? item.id,
    href: item.href,
    icon: item.icon,
  }))
}

/** Пункт навігації модуля за адресою: список чи картка з нього. */
export function kitModuleNavId(
  moduleKey: KitModuleKey,
  pathname: string,
): string | undefined {
  const items = KIT_MODULES[moduleKey].nav
  return (
    items.find(
      (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
    ) ?? items[0]
  )?.id
}
