import { useAuthenticated } from "ra-core"

import { NotificationSettingsForm } from "@/components/erp/notification-settings-form"
import { PageSkeleton } from "@/components/erp/page-state"
import { ListReportHeader } from "@/components/templates/list-report"
import { usePageHeading } from "@/hooks/use-page-heading"

import { useNotificationsT } from "../use-notifications-t"

/**
 * Налаштування сповіщень людини (SPEC §7, N5; ADR-0013, ADR-0046): події × канали, тихі години,
 * push на цьому пристрої. Форма — частина кіта `erp/notification-settings-form`.
 */
export function SettingsPage() {
  const t = useNotificationsT()
  const { isPending } = useAuthenticated()
  const heading = usePageHeading(t("settings.title"))
  return (
    <div className="space-y-6">
      <ListReportHeader
        title={t("settings.title")}
        description={t("settings.lead")}
        headingRef={heading}
      />
      {isPending ? (
        <PageSkeleton rows={6} />
      ) : (
        <div className="max-w-4xl">
          <NotificationSettingsForm />
        </div>
      )}
    </div>
  )
}
