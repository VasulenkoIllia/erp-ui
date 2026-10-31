import { useState } from "react"
import { useAuthenticated } from "ra-core"

import {
  CompanyBranchesSection,
  CompanyImages,
  CompanyProfileForm,
} from "@/components/erp/company-settings"
import { PageSkeleton, PageState } from "@/components/erp/page-state"
import { RecordHistory } from "@/components/erp/record-history"
import {
  ObjectPage,
  useRecordSlots,
  type ObjectPageHeader,
  type ObjectPageSectionItem,
} from "@/components/templates/object-page"
import { Badge } from "@/components/ui/badge"
import { useHistoryRefresh } from "@/hooks/use-history-refresh"
import { useHasPermission } from "@/hooks/use-me"
import { usePageHeading } from "@/hooks/use-page-heading"
import { useTabParam } from "@/hooks/use-tab-param"
import { errorStateKind } from "@/lib/api"
import { DEFAULT_BASE_CURRENCY, type CompanyProfile } from "@/lib/company"
import { applyKeyedChanges } from "@/lib/extensions"
import { useErpUiT } from "@/lib/i18n"

import { CompanyLocaleForm } from "../components/company-locale-form"
import { useCompanyPaletteActions } from "../components/use-company-palette-actions"
import {
  useCompanyState,
  type CompanyState,
} from "../components/use-company-state"
import { COMPANY } from "../contract"
import type { CompanySectionId } from "../extension"
import { useCompanyModule } from "../module-context"
import { useCompanyT } from "../use-company-t"

/**
 * Картка компанії на шаблоні Object Page з вкладками (SPEC §7; ADR-0014, ADR-0019, ADR-0043):
 * реквізити, логотип і печатка, філії (частини кіта `erp/company-settings`), локалізація й вкладки
 * розширення проекту; «Історія» з журналу аудиту — праворуч на широкому, останньою вкладкою на
 * вузькому, з `audit:read`. Компанія — поточна, тож списку й «Назад» немає. Читає кожен у компанії,
 * змінює `company:update`, вибрана вкладка — в адресі.
 */
export function CompanyPage() {
  const t = useCompanyT()
  // Без сесії ra-core перенаправить на вхід і повернеться сюди після входу.
  const { isPending } = useAuthenticated()
  const company = useCompanyState(!isPending)
  const heading = usePageHeading(
    company.profile?.name ?? t("company.title"),
    !company.isPending || company.failure !== undefined,
  )
  if (isPending) return <PageSkeleton rows={6} />
  return <CompanyCard company={company} heading={heading} />
}

function CompanyCard({
  company,
  heading,
}: {
  company: CompanyState
  heading: React.Ref<HTMLHeadingElement>
}) {
  const t = useCompanyT()
  const { extension } = useCompanyModule()
  const canAudit = useHasPermission("audit", "read")
  const { profile, failure, retry } = company
  // У профілю немає версії: журнал перечитуємо, коли профіль перечитано після змін.
  useHistoryRefresh(company.updatedAt || undefined)
  const slots = useRecordSlots({
    record: profile,
    resource: COMPANY,
    sections: extension.company?.sections,
    actions: extension.company?.actions,
  })
  const header = useCompanyHeader(profile)
  const tabs = useTabParam()
  const [isAddingBranch, setAddingBranch] = useState(false)
  const sections: (ObjectPageSectionItem & { id: CompanySectionId })[] = profile
    ? [
        {
          id: "details",
          title: t("company.sections.details"),
          content: <CompanyProfileForm />,
        },
        {
          id: "images",
          title: t("company.sections.images"),
          content: <CompanyImages />,
        },
        {
          id: "branches",
          title: t("company.sections.branches"),
          content: (
            <CompanyBranchesSection
              adding={isAddingBranch}
              onAddingChange={setAddingBranch}
            />
          ),
        },
        {
          id: "locale",
          title: t("company.sections.locale"),
          content: <CompanyLocaleForm profile={profile} />,
        },
      ]
    : []
  const shownSections = applyKeyedChanges(sections, slots.sections)
  useCompanyPaletteActions(profile, shownSections, tabs.onValueChange, () => {
    tabs.onValueChange("branches")
    setAddingBranch(true)
  })
  return (
    <ObjectPage
      title={t("company.title")}
      headingRef={heading}
      isPending={company.isPending}
      error={profile ? undefined : failure}
      onRetry={retry}
      header={
        header && {
          ...header,
          actions: applyKeyedChanges([], slots.actions),
        }
      }
      // Профіль є з кешу, а перечитати не вдалося: форми з незбереженим лишаються, стан помилки над
      // вкладками.
      statusBar={
        profile && failure ? (
          <PageState
            kind={errorStateKind(failure)}
            className="min-h-40"
            onRetry={retry}
          />
        ) : undefined
      }
      sections={shownSections}
      tabs={{ ...tabs, label: t("company.tabsLabel") }}
      // Бекенд без журналу змін — картка без «Історії» (`history: false` у розширенні).
      aside={
        extension.company?.history === false || !canAudit || !profile
          ? undefined
          : {
              label: t("company.history"),
              content: (
                <RecordHistory
                  target={{ type: COMPANY, id: profile.id, name: profile.name }}
                />
              ),
            }
      }
    />
  )
}

/** Шапка: назва, тип, код, ПДВ, базова валюта, скільки філій. */
function useCompanyHeader(
  profile: CompanyProfile | undefined,
): ObjectPageHeader | undefined {
  const t = useCompanyT()
  const kitT = useErpUiT()
  if (!profile) return undefined
  const isLegal = profile.kind === "legal"
  return {
    title: profile.name,
    status: (
      <Badge variant="secondary">
        {kitT(`companySettings.kinds.${profile.kind}`)}
      </Badge>
    ),
    fields: [
      {
        id: "code",
        label: kitT(
          isLegal ? "companySettings.edrpou" : "companySettings.rnokpp",
        ),
        value: isLegal ? profile.edrpou : profile.rnokpp,
      },
      {
        id: "vat",
        label: kitT("companySettings.vatPayer"),
        value: profile.vatPayer
          ? (profile.vatIpn ?? t("company.fields.vatYes"))
          : t("company.fields.vatNo"),
      },
      {
        id: "baseCurrency",
        label: t("company.fields.baseCurrency"),
        value: profile.baseCurrency ?? DEFAULT_BASE_CURRENCY,
      },
      {
        id: "branches",
        label: t("company.fields.branches"),
        value: profile.branches.length,
      },
    ],
  }
}
