import { useAuthenticated } from "@/registry/lib/ra-core"

import { AuditLog } from "@/registry/erp/audit-log"
import { PageSkeleton } from "@/registry/erp/page-state"
import { useErpUiT } from "@/registry/lib/i18n"
import { ukAudit } from "@/registry/lib/i18n-uk-audit"
import { useDemoTranslation } from "@/i18n"
import { ukAuditPage } from "@/i18n/pages"

import { PageHeader } from "./PageHeader"
import { Section } from "./Section"

/** Журнал аудиту компанії (ADR-0013, основа A5). */
export function AuditPage() {
  const { t } = useDemoTranslation([ukAuditPage], { keyPrefix: "auditPage" })
  const kitT = useErpUiT(ukAudit)
  const { isPending } = useAuthenticated()
  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} lead={t("lead")} />
      {isPending ? (
        <PageSkeleton rows={6} />
      ) : (
        <div className="max-w-5xl">
          <Section
            title={kitT("audit.title")}
            description={kitT("audit.description")}
          >
            <AuditLog />
          </Section>
        </div>
      )}
    </div>
  )
}
