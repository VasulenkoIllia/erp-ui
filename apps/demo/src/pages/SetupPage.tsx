import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router"

import {
  SetupChecklist,
  type SetupChecklistItem,
} from "@/registry/erp/setup-checklist"
import { buttonVariants } from "@/registry/ui/button"

import { companyModule } from "@/company-module"
import { ROUTES } from "@/router"

import { PageHeader } from "./PageHeader"
import { Section } from "./Section"

/** Онбординг PF12 (ADR-0044): чек-лист компанії з модуля A1, майстер і стани SetupChecklist. */
export function SetupPage() {
  const { t } = useTranslation()
  const sample = useMemo<SetupChecklistItem[]>(
    () => [
      {
        id: "first",
        label: t("setupPage.items.first"),
        done: true,
        href: ROUTES.company,
        actionLabel: t("setupPage.items.open"),
      },
      {
        id: "second",
        label: t("setupPage.items.second"),
        description: t("setupPage.items.secondHint"),
        done: false,
        href: ROUTES.company,
        actionLabel: t("setupPage.items.open"),
        optional: true,
      },
      {
        id: "third",
        label: t("setupPage.items.third"),
        done: false,
        href: ROUTES.users,
        actionLabel: t("setupPage.items.open"),
        optional: true,
      },
    ],
    [t],
  )
  return (
    <div className="space-y-6">
      <PageHeader title={t("app.pages.setup")} lead={t("setupPage.lead")} />
      <Section
        title={t("setupPage.liveTitle")}
        description={t("setupPage.liveDescription")}
      >
        {companyModule.setupChecklist}
        <p className="text-sm text-muted-foreground">
          {t("setupPage.liveEmpty")}
        </p>
        <Link
          to={companyModule.paths.setup}
          className={buttonVariants({ variant: "outline" })}
        >
          {t("setupPage.wizardLink")}
        </Link>
      </Section>
      <Section
        title={t("setupPage.statesTitle")}
        description={t("setupPage.statesDescription")}
      >
        <h3 className="font-medium">{t("setupPage.partly")}</h3>
        <SetupChecklist scope="demo-sample" items={sample} />
        <h3 className="font-medium">{t("setupPage.pending")}</h3>
        <SetupChecklist scope="demo-pending" items={[]} isPending />
        <h3 className="font-medium">{t("setupPage.error")}</h3>
        <SetupChecklist
          scope="demo-error"
          items={[]}
          error={new Error("Simulated failure")}
          onRetry={() => undefined}
        />
      </Section>
    </div>
  )
}
