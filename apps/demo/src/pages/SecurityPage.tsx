import { useTranslation } from "react-i18next"
import { useAuthenticated } from "ra-core"

import {
  AccountDataSection,
  ChangeEmailForm,
  ChangePasswordForm,
} from "@/registry/erp/account-security"
import { PageSkeleton } from "@/registry/erp/page-state"
import { useErpUiT } from "@/registry/lib/i18n"

import { PageHeader } from "./PageHeader"
import { Section } from "./Section"

/** Налаштування безпеки акаунта (PF01): пароль, email, експорт і видалення. */
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
        <div className="grid max-w-2xl grid-cols-1 gap-6">
          <Section title={kitT("auth.account.passwordTitle")}>
            <ChangePasswordForm />
          </Section>
          <Section title={kitT("auth.account.emailTitle")}>
            <ChangeEmailForm />
          </Section>
          <Section title={kitT("auth.account.dataTitle")}>
            <AccountDataSection />
          </Section>
        </div>
      )}
    </div>
  )
}
