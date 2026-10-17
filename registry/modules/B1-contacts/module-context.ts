import { createContext, useContext } from "react"

import type { ContactsExtension } from "./extension"

/** Адреси сторінок модуля від `basePath` фабрики. */
export interface ContactsPaths {
  readonly contacts: string
  readonly contact: (id: string) => string
  readonly organizations: string
  readonly organization: (id: string) => string
}

export function contactsPaths(basePath: string): ContactsPaths {
  const base = basePath.replace(/\/+$/, "")
  return {
    contacts: `${base}/contacts`,
    contact: (id) => `${base}/contacts/${encodeURIComponent(id)}`,
    organizations: `${base}/organizations`,
    organization: (id) => `${base}/organizations/${encodeURIComponent(id)}`,
  }
}

export interface ContactsModuleContextValue {
  readonly extension: ContactsExtension
  readonly paths: ContactsPaths
  /** Прогріти чанк сторінки модуля за адресою (наведення чи фокус на посиланні, ADR-0009). */
  readonly preload: (pathname: string) => void
}

/** Розширення й адреси для сторінок модуля: їх дає фабрика в маршрутах. */
export const ContactsModuleContext =
  createContext<ContactsModuleContextValue | null>(null)

export function useContactsModule(): ContactsModuleContextValue {
  const value = useContext(ContactsModuleContext)
  if (!value)
    throw new Error(
      "B1-contacts: page rendered outside routes of createContactsModule()",
    )
  return value
}
