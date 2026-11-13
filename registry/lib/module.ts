/**
 * Каркас модуля (ADR-0085): спільні типи модуля, пункту навігації й ресурсу, збирання маршрутів зі
 * сторінок модуля, прогрів чанка за адресою, контекст сторінок і пункти навігації за правами. Модулі
 * не імпортують один одного (ADR-0070), тож спільне для них лежить тут, а не копіюється в кожен.
 *
 *   export const [ContactsModuleContext, useContactsModule] =
 *     createModuleContext<ContactsModuleContextValue>("B1-contacts", "createContactsModule")
 *
 *   return createModule({
 *     id: CONTACTS_MODULE_ID, basePath, paths, nav, resources: CONTACTS_RESOURCES,
 *     pages: [{ path: paths.contacts, page: PAGES.contacts }, …], home: paths.contacts,
 *     context: ContactsModuleContext, value: { extension, paths },
 *   })
 *
 * - Сторінки модуля беруть розширення проекту й опції фабрики лише хуком модуля з
 *   `createModuleContext`, на кожен рендер. Налаштування, які зміняться під час роботи (PF09, A3),
 *   додаються в цей хук одним місцем, а не в кожен модуль.
 * - Фабрика модуля читає розширення лише для складу маршрутів і пунктів (`page: false`).
 * - Проект показує пункти модуля в навігації через `moduleNavItems` (пункт із правом — лише тому,
 *   хто його має), активний пункт — `moduleNavId`.
 */
import type { LucideIcon } from "lucide-react"
import { createContext, createElement, useContext, type Context } from "react"
import { matchRoutes, Navigate, type RouteObject } from "react-router"

import {
  hasPermission,
  localizedText,
  type LocalizedText,
} from "@/registry/lib/auth"
import type { PreloadableComponent } from "@/registry/lib/lazy"

/** Право `<ресурс>:<дія>`, без якого пункт навігації ховають. */
export interface ModuleAccess {
  readonly resource: string
  readonly action: string
}

export interface ModuleNavItem {
  readonly id: string
  /** Підпис мовою інтерфейсу — `localizedText(label, language)` з `@/lib/auth`. */
  readonly label: LocalizedText
  readonly href: string
  readonly icon: LucideIcon
  /** Право, без якого пункт ховають: сторінка однаково покаже «Немає доступу». */
  readonly access?: ModuleAccess
}

/** Пункт, який видно лише з правом. */
export type ModuleNavItemWithAccess = ModuleNavItem & {
  readonly access: ModuleAccess
}

/** Ресурс модуля: права, журнал аудиту, токени API, сценарії моків. */
export interface ModuleResource {
  readonly name: string
  readonly label: LocalizedText
  /** Дії прав (`<ресурс>:<дія>`); без них прав немає: людина бачить лише своє. */
  readonly actions?: readonly string[]
}

/** Ресурс із правами. */
export type ModuleResourceWithActions = ModuleResource & {
  readonly actions: readonly string[]
}

/** Модуль, як його ставить проект: маршрути — у свій роутер, пункти — у свою навігацію. */
export interface ErpModule<
  Id extends string = string,
  Paths = unknown,
  Nav extends ModuleNavItem = ModuleNavItem,
  Resource extends ModuleResource = ModuleResource,
> {
  readonly id: Id
  /** Адреси сторінок модуля від `basePath` фабрики. */
  readonly paths: Paths
  readonly routes: RouteObject[]
  readonly nav: readonly Nav[]
  /** Ресурси модуля: права (`<ресурс>:<дія>`), журнал аудиту, токени API, сценарії моків. */
  readonly resources: readonly Resource[]
  /** Завантажити чанк сторінки модуля за адресою заздалегідь (наведення, фокус на посиланні). */
  readonly preload: (pathname: string) => void
}

/** Що бачать сторінки модуля; модуль додає свої опції фабрики. */
export interface ModuleContextValue<Extension extends object, Paths> {
  readonly extension: Extension
  readonly paths: Paths
  /** Прогріти чанк сторінки модуля за адресою (наведення чи фокус на посиланні, ADR-0009). */
  readonly preload: (pathname: string) => void
}

/**
 * Контекст сторінок модуля і його хук. Поза маршрутами фабрики хук кидає помилку з назвою модуля й
 * фабрики: так сторінку, вставлену в застосунок напряму, видно одразу.
 */
export function createModuleContext<
  Value extends ModuleContextValue<object, unknown>,
>(module: string, factory: string) {
  const ModuleContext = createContext<Value | null>(null)
  // Назва модуля в React DevTools: хуки й контексти всіх модулів створює ця сама функція.
  ModuleContext.displayName = module
  function useModule(): Value {
    const value = useContext(ModuleContext)
    if (!value)
      throw new Error(`${module}: page rendered outside routes of ${factory}()`)
    return value
  }
  return [ModuleContext, useModule] as const
}

/** Сторінка модуля: шаблон адреси React Router і лінивий компонент. */
export interface ModulePage {
  readonly path: string
  readonly page: PreloadableComponent<object>
}

export interface ModuleSpec<
  Id extends string,
  Paths,
  Nav extends ModuleNavItem,
  Resource extends ModuleResource,
  Value extends ModuleContextValue<object, Paths>,
> {
  readonly id: Id
  readonly basePath: string
  readonly paths: Paths
  /** Сторінки в порядку маршрутів. */
  readonly pages: readonly ModulePage[]
  /** Куди веде адреса самого модуля (`basePath`, напр. `/crm`); без неї переадресації немає. */
  readonly home?: string | undefined
  readonly nav: readonly Nav[]
  readonly resources: readonly Resource[]
  readonly context: Context<Value | null>
  /** Значення контексту для сторінок без `preload`: його додає `createModule`. */
  readonly value: Omit<Value, "preload">
}

/**
 * Модуль з опису: кожна сторінка — маршрут у контексті модуля, адреса самого модуля веде на `home`,
 * прогрів чанка — за тими самими маршрутами й правилами, що й роутер (`/new` перемагає `/:id` незалежно від
 * порядку).
 */
export function createModule<
  Id extends string,
  Paths,
  Nav extends ModuleNavItem,
  Resource extends ModuleResource,
  Value extends ModuleContextValue<object, Paths>,
>({
  id,
  basePath,
  paths,
  pages,
  home,
  nav,
  resources,
  context,
  value: pageValue,
}: ModuleSpec<Id, Paths, Nav, Resource, Value>): ErpModule<
  Id,
  Paths,
  Nav,
  Resource
> {
  const preload = preloadByRoutes(pages)
  // `Value` — це `pageValue` і `preload`: TypeScript не виводить цього для загального типу.
  const value = { ...pageValue, preload } as Value
  const routes: RouteObject[] = pages.map(({ path, page }) => ({
    path,
    element: createElement(context.Provider, { value }, createElement(page)),
  }))
  if (home !== undefined && basePath.replace(/\/+$/, ""))
    routes.push({
      path: basePath,
      element: createElement(Navigate, { to: home, replace: true }),
    })
  return { id, paths, routes, nav, resources, preload }
}

function preloadByRoutes(pages: readonly ModulePage[]) {
  const routes = [...pages]
  return (pathname: string) => {
    const path = pathname.split(/[?#]/)[0] ?? ""
    void matchRoutes(routes, path)?.[0]?.route.page.preload()
  }
}

/** Пункт навігації мовою інтерфейсу; підходить у `NavItem` оболонки `erp/app-shell` (без `badge` і `mobile`). */
export type ModuleNavLink = Omit<ModuleNavItem, "label" | "access"> & {
  readonly label: string
}

/**
 * Пункти модуля в навігації мовою інтерфейсу: пункт із правом (`access`) — лише тому, хто його має;
 * поки права не відомі (профіль вантажиться), таких пунктів немає.
 */
export function moduleNavItems(
  nav: readonly ModuleNavItem[],
  language: string,
  permissions: readonly string[] | undefined,
): ModuleNavLink[] {
  return nav
    .filter(
      ({ access }) =>
        !access ||
        (permissions !== undefined &&
          hasPermission(permissions, access.resource, access.action)),
    )
    .map(({ id, label, href, icon }) => ({
      id,
      label: localizedText(label, language) ?? id,
      href,
      icon,
    }))
}

/**
 * Активний пункт модуля для оболонки (`activeId` в `erp/app-shell`): пункт, адреса якого — сама сторінка
 * чи її початок (`/invoices` для `/invoices/7/edit`); з кількох — найдовша адреса. Адреса поза пунктами
 * модуля — `undefined`.
 */
export function moduleNavId(
  nav: readonly ModuleNavItem[],
  pathname: string,
): string | undefined {
  let found: ModuleNavItem | undefined
  for (const item of nav)
    if (
      (pathname === item.href || pathname.startsWith(`${item.href}/`)) &&
      item.href.length > (found?.href.length ?? -1)
    )
      found = item
  return found?.id
}
