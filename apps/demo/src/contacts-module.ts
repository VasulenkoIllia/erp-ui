import { createElement } from "react"
import { useRoutes } from "react-router"

import type { NavItem } from "@/registry/erp/app-shell"
import { PageState } from "@/registry/erp/page-state"
import { localizedText } from "@/registry/lib/auth"
import { createContactsModule } from "@/registry/modules/B1-contacts"

import { contactsExtension } from "@/extensions/B1-contacts"
import { MODULE_ROUTES } from "@/router"

/**
 * Модуль B1 «Контакти й компанії» в демо на місці заглушки `/m/B1` (ADR-0025): так проект ставить
 * модуль — фабрика з адресою й розширенням проекту, маршрути — у своєму роутері, пункти — у своїй
 * навігації. Сторінки модуля — лінивими чанками, `Suspense` і межа помилок — в оболонці.
 */
export const contactsModule = createContactsModule({
  basePath: MODULE_ROUTES.contacts,
  extension: contactsExtension,
})

/** Сторінка модуля за адресою; невідома адреса всередині модуля — «не знайдено». */
export function ContactsModuleRoutes() {
  return (
    useRoutes(contactsModule.routes) ??
    createElement(PageState, { kind: "not-found" })
  )
}

/** Пункти модуля в навігації оболонки мовою інтерфейсу. */
export function contactsNavItems(language: string): NavItem[] {
  return contactsModule.nav.map((item) => ({
    id: item.id,
    label: localizedText(item.label, language) ?? item.id,
    href: item.href,
    icon: item.icon,
  }))
}

/** Пункт навігації модуля за адресою: список чи картка з нього. */
export function contactsNavId(pathname: string): string | undefined {
  const items = contactsModule.nav
  return (
    items.find(
      (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
    ) ?? items[0]
  )?.id
}
