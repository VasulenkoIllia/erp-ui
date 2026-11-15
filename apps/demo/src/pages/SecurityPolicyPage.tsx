import { useAuthenticated } from "@/registry/lib/ra-core"

import { PageSkeleton } from "@/registry/erp/page-state"
import { SecurityPolicyForm } from "@/registry/erp/security-policy-form"
import { useErpUiT } from "@/registry/lib/i18n"
import { ukAccess } from "@/registry/lib/i18n-uk-access"
import { useDemoTranslation } from "@/i18n"
import { ukSecurityPolicyPage } from "@/i18n/pages"

import { PageHeader } from "./PageHeader"
import { Section } from "./Section"

/** Політики безпеки організації для адміністратора (ADR-0012). */
export function SecurityPolicyPage() {
  const { t } = useDemoTranslation([ukSecurityPolicyPage], {
    keyPrefix: "securityPolicyPage",
  })
  const kitT = useErpUiT(ukAccess)
  const { isPending } = useAuthenticated()
  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} lead={t("lead")} />
      {isPending ? (
        <PageSkeleton rows={6} />
      ) : (
        <div className="max-w-3xl">
          <Section
            title={kitT("securityPolicy.title")}
            description={kitT("securityPolicy.description")}
          >
            <SecurityPolicyForm />
          </Section>
        </div>
      )}
    </div>
  )
}
