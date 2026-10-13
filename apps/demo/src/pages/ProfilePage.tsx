import { useTranslation } from "react-i18next"
import { useAuthenticated } from "ra-core"

import { PageSkeleton } from "@/registry/erp/page-state"
import { ProfileForm, ProfilePhoto } from "@/registry/erp/profile-form"
import { useErpUiT } from "@/registry/lib/i18n"

import { PageHeader } from "./PageHeader"
import { Section } from "./Section"

/** Профіль користувача (PF01, ADR-0012): фото, ім'я, посада, телефон, часовий пояс, підпис. */
export function ProfilePage() {
  const { t } = useTranslation("demo", { keyPrefix: "profilePage" })
  const kitT = useErpUiT()
  const { isPending } = useAuthenticated()
  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} lead={t("lead")} />
      {isPending ? (
        <PageSkeleton rows={4} />
      ) : (
        <div className="grid max-w-3xl grid-cols-1 gap-6">
          <Section title={kitT("profile.photoTitle")}>
            <ProfilePhoto />
          </Section>
          <Section title={kitT("profile.title")}>
            <ProfileForm />
          </Section>
        </div>
      )}
    </div>
  )
}
