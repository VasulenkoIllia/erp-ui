import { useAuthenticated } from "ra-core"
import { useTranslation } from "react-i18next"

import { NumberingSettings } from "@/registry/erp/numbering-settings"
import { PageSkeleton } from "@/registry/erp/page-state"
import { useErpUiT } from "@/registry/lib/i18n"

import { PageHeader } from "./PageHeader"
import { Section } from "./Section"

/** Нумерація документів (PF03b, ADR-0058): серія сторінки «Документ» на моках. */
export function NumberingPage() {
  const { t } = useTranslation("demo", { keyPrefix: "numberingPage" })
  const kitT = useErpUiT()
  const { isPending } = useAuthenticated()
  return (
    <div className="space-y-6">
      <PageHeader title={kitT("numbering.title")} lead={t("lead")} />
      {isPending ? (
        <PageSkeleton rows={6} />
      ) : (
        <Section
          title={t("sectionTitle")}
          description={t("sectionDescription")}
        >
          <NumberingSettings
            labels={{ documents: t("labels.documents") }}
            headingLevel={3}
          />
        </Section>
      )}
    </div>
  )
}
