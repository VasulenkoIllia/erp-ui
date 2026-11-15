import { useNavigate } from "react-router"
import { useAuthenticated } from "@/registry/lib/ra-core"

import { NotificationInbox } from "@/registry/erp/notification-inbox"
import { PageSkeleton } from "@/registry/erp/page-state"
import { useDemoTranslation } from "@/i18n"
import { ukInboxPage } from "@/i18n/pages"

import { PageHeader } from "./PageHeader"

/** Центр сповіщень (ADR-0014, PF10): усі й непрочитані, позначки, «Прочитати все». */
export function InboxPage() {
  const { t } = useDemoTranslation([ukInboxPage], { keyPrefix: "inboxPage" })
  const navigate = useNavigate()
  const { isPending } = useAuthenticated()
  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} lead={t("lead")} />
      {isPending ? (
        <PageSkeleton rows={6} />
      ) : (
        <div className="max-w-3xl">
          <NotificationInbox
            onNavigate={(link) => {
              void navigate(link)
            }}
          />
        </div>
      )}
    </div>
  )
}
