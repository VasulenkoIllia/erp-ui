import { useAuthenticated } from "ra-core"
import { useNavigate } from "react-router"

import { NotificationInbox } from "@/components/erp/notification-inbox"
import { PageSkeleton } from "@/components/erp/page-state"
import { ListReportHeader } from "@/components/templates/list-report"
import { usePageHeading } from "@/hooks/use-page-heading"

import { useNotificationsModule } from "../module-context"
import { useNotificationsT } from "../use-notifications-t"

/**
 * Сторінка «Сповіщення» (SPEC §7, N5; ADR-0014): частина кіта `erp/notification-inbox` під шапкою
 * списку. Шаблон List Report не підходить: колонок, вибору й масових дій тут немає, сповіщення
 * довантажуються кнопкою.
 */
export function InboxPage() {
  const t = useNotificationsT()
  const { extension } = useNotificationsModule()
  const navigate = useNavigate()
  // Без сесії ra-core перенаправить на вхід і повернеться сюди після входу.
  const { isPending } = useAuthenticated()
  const heading = usePageHeading(t("inbox.title"))
  // Шапка — над перевіркою сесії: той самий вузол від першого кадру (ADR-0022).
  return (
    <div className="space-y-6">
      <ListReportHeader
        title={t("inbox.title")}
        description={t("inbox.lead")}
        headingRef={heading}
      />
      {isPending ? (
        <PageSkeleton rows={6} />
      ) : (
        <div className="max-w-3xl">
          <NotificationInbox
            perPage={extension.inbox?.perPage}
            onNavigate={(link) => {
              void navigate(link)
            }}
          />
        </div>
      )}
    </div>
  )
}
