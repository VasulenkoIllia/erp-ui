/**
 * Модуль B1 «Контакти й компанії» (SPEC §14, §17; ADR-0020, ADR-0025) — точка входу.
 *
 *   const contactsModule = createContactsModule({ basePath: "/crm", extension: contactsExtension })
 *   <Routes>{contactsModule.routes.map(…)}</Routes>  // чи useRoutes(contactsModule.routes)
 *
 * Фабрика повертає маршрути React Router зі сторінками модуля (лінивими чанками, `Suspense` і межа
 * помилок — у застосунку), пункти навігації, ресурси для прав і моків і `preload` за адресою. Без
 * розширення модуль такий, як у демо кіта. Файли модуля в проекті не правляться: зміни під
 * клієнта — у файлі розширення (`src/extensions/B1-contacts.ts`). Моки — окремо, `./mocks`
 * (`createContactsMocks`), щоб MSW не потрапив у застосунок.
 */
import type { LucideIcon } from "lucide-react"
import { createElement, type ComponentType } from "react"
import { Navigate, type RouteObject } from "react-router"

import type { LocalizedText } from "@/lib/auth"
import { MODULE_ICONS, SHELL_ICONS } from "@/lib/icons"
import { lazyWithPreload, type PreloadableComponent } from "@/lib/lazy"

import type { ContactsExtension } from "./extension"
import {
  ContactsModuleContext,
  contactsPaths,
  type ContactsModuleContextValue,
  type ContactsPaths,
} from "./module-context"
import { CONTACTS_RESOURCES, type ContactsResource } from "./resources"

export type {
  ContactActionId,
  ContactColumnId,
  ContactDetailRowId,
  ContactFieldId,
  ContactFilterId,
  ContactFormFieldId,
  ContactPeopleExtension,
  ContactSectionId,
  ContactsExtension,
  ContactsMessages,
  ContactsMockExtension,
  ContactTabId,
  OrganizationActionId,
  OrganizationColumnId,
  OrganizationDetailRowId,
  OrganizationFieldId,
  OrganizationFilterId,
  OrganizationFormFieldId,
  OrganizationSectionId,
  OrganizationsExtension,
  OrganizationTabId,
} from "./extension"
export type { ContactsPaths } from "./module-context"
export type { ContactsResource } from "./resources"
// Типи для файлу розширення й компонентів слотів проекту: не з внутрішніх файлів модуля.
export type { Contact, Organization } from "./contract"
export type { ExtensionField } from "@/lib/extension-fields"

export const CONTACTS_MODULE_ID = "B1"

export interface ContactsNavItem {
  readonly id: string
  /** Підпис мовою інтерфейсу — `localizedText(label, language)` з `@/lib/auth`. */
  readonly label: LocalizedText
  readonly href: string
  readonly icon: LucideIcon
}

export interface ContactsModule {
  readonly id: typeof CONTACTS_MODULE_ID
  readonly paths: ContactsPaths
  readonly routes: RouteObject[]
  readonly nav: readonly ContactsNavItem[]
  /** Ресурси модуля: права (`<ресурс>:<дія>`), журнал аудиту, токени API, сценарії моків. */
  readonly resources: readonly ContactsResource[]
  /** Завантажити чанк сторінки модуля за адресою заздалегідь (наведення, фокус на посиланні). */
  readonly preload: (pathname: string) => void
}

export interface ContactsModuleOptions {
  /** Початок адрес модуля: `""` — `/contacts`, `/organizations`; `"/crm"` — `/crm/contacts`. */
  readonly basePath?: string
  /** Розширення проекту (ADR-0020). */
  readonly extension?: ContactsExtension
}

const PAGES = {
  contacts: lazyWithPreload(() =>
    import("./pages/contacts-list-page").then((m) => m.ContactsListPage),
  ),
  contact: lazyWithPreload(() =>
    import("./pages/contact-page").then((m) => m.ContactPage),
  ),
  organizations: lazyWithPreload(() =>
    import("./pages/organizations-list-page").then(
      (m) => m.OrganizationsListPage,
    ),
  ),
  organization: lazyWithPreload(() =>
    import("./pages/organization-page").then((m) => m.OrganizationPage),
  ),
  segments: lazyWithPreload(() =>
    import("./pages/segments-list-page").then((m) => m.SegmentsListPage),
  ),
} satisfies Record<string, PreloadableComponent<object>>

const NO_EXTENSION: ContactsExtension = {}

/** Чанк сторінки за адресою: список чи картка контактів або організацій, довідник сегментів. */
function preloadFor(paths: ContactsPaths) {
  return (pathname: string) => {
    const path = pathname.split(/[?#]/)[0] ?? ""
    const inside = (list: string) =>
      path === list ? "list" : path.startsWith(`${list}/`) ? "card" : null
    const contacts = inside(paths.contacts)
    const organizations = inside(paths.organizations)
    const target = contacts
      ? PAGES[contacts === "list" ? "contacts" : "contact"]
      : organizations
        ? PAGES[organizations === "list" ? "organizations" : "organization"]
        : path === paths.segments
          ? PAGES.segments
          : null
    void target?.preload()
  }
}

export function createContactsModule({
  basePath = "",
  extension = NO_EXTENSION,
}: ContactsModuleOptions = {}): ContactsModule {
  const paths = contactsPaths(basePath)
  const preload = preloadFor(paths)
  const context: ContactsModuleContextValue = { extension, paths, preload }
  const page = (Page: ComponentType) =>
    createElement(
      ContactsModuleContext.Provider,
      { value: context },
      createElement(Page),
    )
  const routes: RouteObject[] = [
    { path: paths.contacts, element: page(PAGES.contacts) },
    { path: `${paths.contacts}/:id`, element: page(PAGES.contact) },
    { path: paths.organizations, element: page(PAGES.organizations) },
    { path: `${paths.organizations}/:id`, element: page(PAGES.organization) },
    { path: paths.segments, element: page(PAGES.segments) },
  ]
  // Адреса самого модуля (`/crm`) — список контактів.
  if (basePath.replace(/\/+$/, ""))
    routes.push({
      path: basePath,
      element: createElement(Navigate, { to: paths.contacts, replace: true }),
    })
  const nav: ContactsNavItem[] = [
    {
      id: "B1-contacts",
      label: { uk: "Контакти", en: "Contacts" },
      href: paths.contacts,
      icon: MODULE_ICONS.B1,
    },
    {
      id: "B1-organizations",
      label: { uk: "Організації", en: "Organizations" },
      href: paths.organizations,
      icon: SHELL_ICONS.company,
    },
    {
      id: "B1-segments",
      label: { uk: "Сегменти", en: "Segments" },
      href: paths.segments,
      icon: SHELL_ICONS.segments,
    },
  ]
  return {
    id: CONTACTS_MODULE_ID,
    paths,
    routes,
    nav,
    resources: CONTACTS_RESOURCES,
    preload,
  }
}
