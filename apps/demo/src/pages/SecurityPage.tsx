import { useTranslation } from "react-i18next"
import { useAuthenticated } from "ra-core"

import {
  SessionsSection,
  SignInAlertsSwitch,
  SignInHistory,
  TrustedDevicesSection,
} from "@/registry/erp/account-devices"
import { FactorsSection } from "@/registry/erp/account-factors"
import { ApiTokensSection } from "@/registry/erp/api-tokens"
import {
  AccountDataSection,
  ChangeEmailForm,
  ChangePasswordForm,
} from "@/registry/erp/account-security"
import { PageSkeleton } from "@/registry/erp/page-state"
import { useErpUiT } from "@/registry/lib/i18n"

import { PageHeader } from "./PageHeader"
import { Section } from "./Section"

/**
 * Налаштування безпеки акаунта (PF01): способи входу, пароль, email, сесії й пристрої, журнал
 * входів, токени API, експорт і видалення.
 */
export function SecurityPage() {
  const { t } = useTranslation("demo", { keyPrefix: "securityPage" })
  const kitT = useErpUiT()
  const { isPending } = useAuthenticated()
  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} lead={t("lead")} />
      {isPending ? (
        <PageSkeleton rows={4} />
      ) : (
        <div className="grid max-w-3xl grid-cols-1 gap-6">
          <Section
            title={kitT("auth.factors.title")}
            description={kitT("auth.factors.description")}
          >
            <FactorsSection />
          </Section>
          <Section title={kitT("auth.account.passwordTitle")}>
            <ChangePasswordForm />
          </Section>
          <Section title={kitT("auth.account.emailTitle")}>
            <ChangeEmailForm />
          </Section>
          <Section
            title={kitT("auth.devices.sessionsTitle")}
            description={kitT("auth.devices.sessionsDescription")}
          >
            <SessionsSection />
          </Section>
          <Section
            title={kitT("auth.devices.trustedTitle")}
            description={kitT("auth.devices.trustedDescription")}
          >
            <TrustedDevicesSection />
          </Section>
          <Section
            title={kitT("auth.signIns.title")}
            description={kitT("auth.signIns.description")}
          >
            <SignInAlertsSwitch />
            <SignInHistory />
          </Section>
          <Section
            title={kitT("apiTokens.title")}
            description={kitT("apiTokens.description")}
          >
            <ApiTokensSection />
          </Section>
          <Section title={kitT("auth.account.dataTitle")}>
            <AccountDataSection />
          </Section>
        </div>
      )}
    </div>
  )
}
