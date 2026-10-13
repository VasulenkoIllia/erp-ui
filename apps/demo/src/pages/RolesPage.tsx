import { useTranslation } from "react-i18next"
import { useAuthenticated } from "ra-core"

import { PageSkeleton } from "@/registry/erp/page-state"
import { RolesEditor } from "@/registry/erp/roles-editor"
import { useErpUiT } from "@/registry/lib/i18n"

import { PageHeader } from "./PageHeader"
import { Section } from "./Section"

/** Ролі й матриця прав (ADR-0014, основа A2). */
export function RolesPage() {
  const { t } = useTranslation("demo", { keyPrefix: "rolesPage" })
  const kitT = useErpUiT()
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
