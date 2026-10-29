import { useAuthenticated, useCanAccess } from "ra-core"

import { InvitationsSection } from "@/components/erp/invitations-section"
import { PageSkeleton, PageState } from "@/components/erp/page-state"
import { ListReportHeader } from "@/components/templates/list-report"
import { usePageHeading } from "@/hooks/use-page-heading"

import { USERS } from "../contract"
import { useUsersT } from "../use-users-t"

/**
 * Запрошення колег (SPEC §7; ADR-0014, ADR-0035): хто ще не прийняв запрошення, «Запросити
 * колегу» з ролями, надіслати ще раз, відкликати; запрошення з ролями понад свої права — дії
 * неактивні з причиною. Без `users:create` — «Немає доступу» без запиту.
 */
export function InvitationsPage() {
  const t = useUsersT()
  // Без сесії ra-core перенаправить на вхід і повернеться сюди після входу.
  const { isPending } = useAuthenticated()
  const access = useCanAccess({ resource: USERS, action: "create" })
  const heading = usePageHeading(t("invitations.title"))
  // Шапка — над перевіркою сесії: той самий вузол від першого кадру (ADR-0022).
  return (
    <div className="space-y-6">
      <ListReportHeader
        title={t("invitations.title")}
        description={t("invitations.lead")}
        headingRef={heading}
      />
      {isPending || access.isPending ? (
        <PageSkeleton rows={4} />
      ) : access.canAccess ? (
        <div className="max-w-3xl">
          <InvitationsSection />
        </div>
      ) : (
        <PageState kind="forbidden" />
      )}
    </div>
  )
}
