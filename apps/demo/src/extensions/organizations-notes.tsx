import { useTranslation } from "react-i18next"

import type { RecordSlotProps } from "@/registry/templates/object-page"

import type { Organization } from "@/data/organizations"

/**
 * Вкладка проекту «Нотатки» в картці організації (розширення — `organizations.ts`). Окремий чанк:
 * вантажиться, коли вкладку відкривають.
 */
export default function OrganizationNotes({
  record,
}: RecordSlotProps<Organization>) {
  const { t } = useTranslation("demo", { keyPrefix: "organizationPage" })
  return (
    <div className="space-y-2 text-sm" data-slot="organization-notes">
      <p>{t("notes.lead", { name: record.name })}</p>
      <p className="text-muted-foreground">{t("notes.hint")}</p>
    </div>
  )
}
