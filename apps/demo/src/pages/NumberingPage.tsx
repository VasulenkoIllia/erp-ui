import { useAuthenticated } from "@/registry/lib/ra-core"

import { NumberingSettings } from "@/registry/erp/numbering-settings"
import { PageSkeleton } from "@/registry/erp/page-state"
import { useErpUiT } from "@/registry/lib/i18n"
import { ukNumbering } from "@/registry/lib/i18n-uk-numbering"
import { useDemoTranslation } from "@/i18n"
import { ukNumberingPage } from "@/i18n/pages"

import { PageHeader } from "./PageHeader"
import { Section } from "./Section"

/** Нумерація документів (PF03b, ADR-0058): серія сторінки «Документ» на моках. */
export function NumberingPage() {
  const { t } = useDemoTranslation([ukNumberingPage], {
    keyPrefix: "numberingPage",
  })
  const kitT = useErpUiT(ukNumbering)
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
            labels={{
              documents: t("labels.documents"),
              quotes: t("labels.quotes"),
            }}
            headingLevel={3}
          />
        </Section>
      )}
    </div>
  )
}
