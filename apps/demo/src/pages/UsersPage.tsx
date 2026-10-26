import { useGetList } from "ra-core"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router"

import { useImpersonation } from "@/registry/erp/impersonation"
import { InvitationsSection } from "@/registry/erp/invitations-section"
import { PageSkeleton, PageState } from "@/registry/erp/page-state"
import { RecoveryRequestsSection } from "@/registry/erp/reset-factors"
import {
  ActiveSessionsSection,
  UserBlockedBadge,
  useUserAccessSheet,
} from "@/registry/erp/user-access"
import { useMe } from "@/registry/hooks/use-me"
import { isApiError } from "@/registry/lib/api"
import { hasPermission } from "@/registry/lib/auth"
import { useErpUiT } from "@/registry/lib/i18n"
import { Avatar, AvatarFallback } from "@/registry/ui/avatar"
import { Button } from "@/registry/ui/button"
import { Card, CardContent } from "@/registry/ui/card"
import type { User } from "@/registry/modules/A2-users"

import { ROUTES } from "@/router"

import { PageHeader } from "./PageHeader"
import { Section } from "./Section"

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0] ?? "")
    .join("")

/**
 * Користувачі компанії: «Увійти як…» (ADR-0011), доступ — ролі, сесії, скидання другого кроку,
 * блокування (ADR-0013/0014), запрошення, запити на відновлення й активні сесії. Модуль A2 зі
 * списком і карткою людини — `/m/A2` (ADR-0031); тут — простий список.
 */
export function UsersPage() {
  const { t } = useTranslation("demo", { keyPrefix: "usersPage" })
  const kitT = useErpUiT()
  const navigate = useNavigate()
  const { data: me } = useMe()
  // Без `users:read` сервер віддав би лише довідник (ім'я та email, ADR-0031) — сторінки немає.
  const canRead = me ? hasPermission(me.permissions, "users", "read") : false
  const { data, isPending, error, refetch } = useGetList<User>(
    "users",
    {
      pagination: { page: 1, perPage: 50 },
      sort: { field: "name", order: "ASC" },
    },
    { enabled: canRead },
  )
  const { start, dialog } = useImpersonation({
    onStarted: () => {
      void navigate(ROUTES.data)
    },
  })
  const access = useUserAccessSheet({
    onChange: () => {
      void refetch()
    },
  })
  const canImpersonate = me
    ? hasPermission(me.permissions, "users", "impersonate")
    : false
  const canManage =
    me && !me.impersonator
      ? hasPermission(me.permissions, "users", "update")
      : false
  const canInvite =
    me && !me.impersonator
      ? hasPermission(me.permissions, "users", "create")
      : false

  let body: React.ReactNode
  if (!me) body = <PageSkeleton rows={3} />
  else if (!canRead) body = <PageState kind="forbidden" />
  else if (isPending) body = <PageSkeleton rows={3} />
  else if (error)
    body =
      isApiError(error) && error.status === 403 ? (
        <PageState kind="forbidden" />
      ) : (
        <PageState
          kind="error"
          onRetry={() => {
            void refetch()
          }}
        />
      )
  else
    body = (
      <Card>
        <CardContent className="@container">
          <ul className="divide-y" aria-label={t("listLabel")}>
            {(data ?? []).map((user) => (
              <li
                key={user.id}
                className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 @md:flex-row @md:items-center"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar>
                    <AvatarFallback>{initials(user.name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      <span className="truncate">{user.name}</span>
                      {canManage ? <UserBlockedBadge userId={user.id} /> : null}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">
                      {[
                        user.email,
                        user.roles.map((role) => role.name).join(", "),
                      ].join(" · ")}
                    </p>
                  </div>
                </div>
                {user.id !== me?.id ? (
                  <div className="flex flex-wrap gap-2">
                    {canImpersonate && !me?.impersonator ? (
                      <Button
                        variant="outline"
                        size="sm"
                        aria-label={kitT("auth.impersonation.actionFor", {
                          name: user.name,
                        })}
                        onClick={() => {
                          start({ id: user.id, name: user.name })
                        }}
                      >
                        {kitT("auth.impersonation.action")}
                      </Button>
                    ) : null}
                    {canManage ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={kitT("userAccess.actionFor", {
                          name: user.name,
                        })}
                        onClick={() => {
                          access.open({
                            id: user.id,
                            name: user.name,
                            email: user.email,
                          })
                        }}
                      >
                        {kitT("userAccess.action")}
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    )

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} lead={t("lead")} />
      <div className="max-w-3xl space-y-6">
        {canManage ? (
          <Section
            title={kitT("resetFactors.requestsTitle")}
            description={kitT("resetFactors.requestsDescription")}
          >
            <RecoveryRequestsSection />
          </Section>
        ) : null}
        {body}
        {canInvite ? (
          <Section
            title={t("invitationsTitle")}
            description={t("invitationsDescription")}
          >
            <InvitationsSection />
          </Section>
        ) : null}
        {canManage ? (
          <Section
            title={t("sessionsTitle")}
            description={t("sessionsDescription")}
          >
            <ActiveSessionsSection />
          </Section>
        ) : null}
      </div>
      {dialog}
      {access.sheet}
    </div>
  )
}
