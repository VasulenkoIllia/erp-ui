import { useTranslation } from "react-i18next"
import { useAuthenticated } from "ra-core"

import {
  CompanyBranchesSection,
  CompanyImages,
  CompanyProfileForm,
} from "@/registry/erp/company-settings"
import { PageSkeleton } from "@/registry/erp/page-state"

import { PageHeader } from "./PageHeader"
import { Section } from "./Section"

/** Налаштування компанії (ADR-0014, основа A1): реквізити, логотип і печатка, філії. */
export function CompanyPage() {
  const { t } = useTranslation("demo", { keyPrefix: "companyPage" })
  const { isPending } = useAuthenticated()
  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} lead={t("lead")} />
      {isPending ? (
        <PageSkeleton rows={6} />
      ) : (
        <div className="max-w-3xl space-y-6">
          <Section
            title={t("profileTitle")}
            description={t("profileDescription")}
          >
            <CompanyProfileForm />
          </Section>
          <Section
            title={t("imagesTitle")}
            description={t("imagesDescription")}
          >
            <CompanyImages />
          </Section>
          <Section
            title={t("branchesTitle")}
            description={t("branchesDescription")}
          >
            <CompanyBranchesSection />
          </Section>
        </div>
      )}
    </div>
  )
}
