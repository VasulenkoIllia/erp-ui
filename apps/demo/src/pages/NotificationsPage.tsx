import { useTranslation } from "react-i18next"
import { useAuthenticated } from "ra-core"

import { NotificationSettingsForm } from "@/registry/erp/notification-settings-form"
import { PageSkeleton } from "@/registry/erp/page-state"
import { useErpUiT } from "@/registry/lib/i18n"

import { PageHeader } from "./PageHeader"
import { Section } from "./Section"

/** Налаштування сповіщень користувача (PF10, ADR-0013): події × канали, тихі години. */
export function NotificationsPage() {
  const { t } = useTranslation("demo", { keyPrefix: "notificationsPage" })
  const kitT = useErpUiT()
  const { isPending } = useAuthenticated()
  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} lead={t("lead")} />
      {isPending ? (
        <PageSkeleton rows={6} />
      ) : (
        <div className="max-w-4xl">
          <Section
            title={kitT("notificationSettings.title")}
            description={kitT("notificationSettings.description")}
          >
            <NotificationSettingsForm />
          </Section>
        </div>
      )}
    </div>
  )
}
