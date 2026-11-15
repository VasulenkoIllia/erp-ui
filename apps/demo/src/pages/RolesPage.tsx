import { useAuthenticated } from "@/registry/lib/ra-core"

import { PageSkeleton } from "@/registry/erp/page-state"
import { RolesEditor } from "@/registry/erp/roles-editor"
import { useErpUiT } from "@/registry/lib/i18n"
import { ukRoles } from "@/registry/lib/i18n-uk-roles"
import { useDemoTranslation } from "@/i18n"
import { ukRolesPage } from "@/i18n/pages"

import { PageHeader } from "./PageHeader"
import { Section } from "./Section"

/** Ролі й матриця прав (ADR-0014, основа A2). */
export function RolesPage() {
  const { t } = useDemoTranslation([ukRolesPage], { keyPrefix: "rolesPage" })
  const kitT = useErpUiT(ukRoles)
  const { isPending } = useAuthenticated()
  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} lead={t("lead")} />
      {isPending ? (
        <PageSkeleton rows={6} />
      ) : (
        <div className="max-w-5xl">
          <Section
            title={kitT("roles.title")}
            description={kitT("roles.description")}
          >
            <RolesEditor />
          </Section>
        </div>
      )}
    </div>
  )
}
