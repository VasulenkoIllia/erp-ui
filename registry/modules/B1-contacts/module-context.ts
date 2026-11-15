import { createModuleContext, type ModuleContextValue } from "@/lib/module"

import type { ContactsExtension } from "./extension"

/** Адреси сторінок модуля від `basePath` фабрики. */
export interface ContactsPaths {
  readonly contacts: string
  /** Кошик контактів (PF16, ADR-0095). */
  readonly contactsTrash: string
  readonly contact: (id: string) => string
  readonly organizations: string
  readonly organizationsTrash: string
  readonly organization: (id: string) => string
  /** Довідник сегментів (ADR-0027). */
  readonly segments: string
}

export function contactsPaths(basePath: string): ContactsPaths {
  const base = basePath.replace(/\/+$/, "")
  return {
    contacts: `${base}/contacts`,
    contactsTrash: `${base}/contacts/trash`,
    contact: (id) => `${base}/contacts/${encodeURIComponent(id)}`,
    organizations: `${base}/organizations`,
    organizationsTrash: `${base}/organizations/trash`,
    organization: (id) => `${base}/organizations/${encodeURIComponent(id)}`,
    segments: `${base}/segments`,
  }
}

export type ContactsModuleContextValue = ModuleContextValue<
  ContactsExtension,
  ContactsPaths
>

/** Розширення й адреси для сторінок модуля: їх дає фабрика в маршрутах. */
export const [ContactsModuleContext, useContactsModule] =
  createModuleContext<ContactsModuleContextValue>(
    "B1-contacts",
    "createContactsModule",
  )
