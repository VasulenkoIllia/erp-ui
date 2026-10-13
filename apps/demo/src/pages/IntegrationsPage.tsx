import { useTranslation } from "react-i18next"
import { useAuthenticated } from "ra-core"

import { PageSkeleton } from "@/registry/erp/page-state"
import { WebhooksSection } from "@/registry/erp/webhooks-section"

import { PageHeader } from "./PageHeader"
import { Section } from "./Section"

/** Інтеграції компанії (PF11/PF17, ADR-0013): вебхуки. */
export function IntegrationsPage() {
  const { t } = useTranslation("demo", { keyPrefix: "integrationsPage" })
  const { isPending } = useAuthenticated()
  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} lead={t("lead")} />
      {isPending ? (
        <PageSkeleton rows={4} />
      ) : (
        <div className="max-w-4xl">
          <Section
            title={t("webhooksTitle")}
            description={t("webhooksDescription")}
          >
            <WebhooksSection />
          </Section>
        </div>
      )}
    </div>
  )
}
