import { createModuleContext, type ModuleContextValue } from "@/lib/module"

import type { ContactsExtension } from "./extension"

/** Адреси сторінок модуля від `basePath` фабрики. */
export interface ContactsPaths {
  readonly contacts: string
  readonly contact: (id: string) => string
  readonly organizations: string
  readonly organization: (id: string) => string
  /** Довідник сегментів (ADR-0027). */
  readonly segments: string
}

export function contactsPaths(basePath: string): ContactsPaths {
  const base = basePath.replace(/\/+$/, "")
  return {
    contacts: `${base}/contacts`,
    contact: (id) => `${base}/contacts/${encodeURIComponent(id)}`,
    organizations: `${base}/organizations`,
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
