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
import { MODULE_ICONS, SHELL_ICONS } from "@/lib/icons"
import { lazyWithPreload, type PreloadableComponent } from "@/lib/lazy"
import { createModule, type ErpModule, type ModuleNavItem } from "@/lib/module"

import type { ContactsExtension } from "./extension"
import {
  ContactsModuleContext,
  contactsPaths,
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

export type ContactsNavItem = ModuleNavItem

export type ContactsModule = ErpModule<
  typeof CONTACTS_MODULE_ID,
  ContactsPaths,
  ContactsNavItem,
  ContactsResource
>

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

export function createContactsModule({
  basePath = "",
  extension = NO_EXTENSION,
}: ContactsModuleOptions = {}): ContactsModule {
  const paths = contactsPaths(basePath)
  return createModule({
    id: CONTACTS_MODULE_ID,
    basePath,
    paths,
    pages: [
      { path: paths.contacts, page: PAGES.contacts },
      { path: `${paths.contacts}/:id`, page: PAGES.contact },
      { path: paths.organizations, page: PAGES.organizations },
      { path: `${paths.organizations}/:id`, page: PAGES.organization },
      { path: paths.segments, page: PAGES.segments },
    ],
    // Адреса самого модуля (`/crm`) — список контактів.
    home: paths.contacts,
    nav: [
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
    ],
    resources: CONTACTS_RESOURCES,
    context: ContactsModuleContext,
    value: { extension, paths },
  })
}
