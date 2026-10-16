import { useCallback } from "react"
import { useTranslation } from "react-i18next"

import type { Organization } from "@/data/organizations"

/** Ресурс довідника організацій (mocks/handlers). */
export const ORGANIZATIONS = "organizations"

export const organizationLabel = (organization: Organization) =>
  organization.name

/** Варіанти за назвою. */
export const ORGANIZATION_SORT = { field: "name", order: "ASC" } as const

/** Другий рядок варіанта: «ЄДРПОУ 41234005 · Київ»; без міста — лише код. */
export function useOrganizationDescription() {
  const { t } = useTranslation("demo", { keyPrefix: "pickersPage" })
  return useCallback(
    (organization: Organization) =>
      [
        t(organization.type === "fop" ? "option.fop" : "option.legal", {
          code: organization.code,
        }),
        organization.city,
      ]
        .filter(Boolean)
        .join(" · "),
    [t],
  )
}
