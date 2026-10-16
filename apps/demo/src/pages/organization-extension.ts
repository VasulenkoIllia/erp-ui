import type { KeyedChanges } from "@/registry/lib/extensions"
import type { ExtensionSection } from "@/registry/templates/object-page"

import type { Organization } from "@/data/organizations"

/**
 * Точки розширення картки організації (ADR-0020): вкладки картки за ключем. Зразок для модуля B1
 * (крок 1.4), де розширення проекту додає вкладки «Послуги» й «Задачі».
 */

/** Ключі вкладок картки — те, що розширення може сховати, переставити чи взяти за орієнтир. */
export type OrganizationSectionId = "requisites" | "invoices"

export interface OrganizationsExtension {
  sections?: KeyedChanges<ExtensionSection<Organization>, OrganizationSectionId>
}

export const NO_ORGANIZATIONS_EXTENSION: OrganizationsExtension = {}
