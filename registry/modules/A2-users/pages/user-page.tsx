import { useQueryClient } from "@tanstack/react-query"
import { useAuthenticated, useCanAccess } from "ra-core"
import { useCallback } from "react"
import { useNavigate, useParams } from "react-router"

import { AuditLog } from "@/components/erp/audit-log"
import { PageSkeleton, PageState } from "@/components/erp/page-state"
import { BackToList } from "@/components/erp/record-link"
import {
  ObjectPage,
  useRecordSlots,
  type ObjectPageSectionItem,
} from "@/components/templates/object-page"
import { useCardRecord } from "@/hooks/use-card-record"
import { useHasPermission, useMe } from "@/hooks/use-me"
import { useHistoryRefresh } from "@/hooks/use-history-refresh"
import { usePageHeading } from "@/hooks/use-page-heading"
import {
  usePaletteActions,
  useSectionActions,
} from "@/hooks/use-palette-actions"
import { useTabParam } from "@/hooks/use-tab-param"
import { ApiError, errorStateKind } from "@/lib/api"
import { applyKeyedChanges } from "@/lib/extensions"

import {
  UserAccessTab,
  UserRolesTab,
  UserSessionsTab,
  type UserRolesLock,
} from "../components/user-access-tabs"
import { useUserHeader } from "../components/user-header"
import { useUserStatuses } from "../components/user-statuses"
import { USERS, type User } from "../contract"
import type { UserSectionId } from "../extension"
import { useUsersModule } from "../module-context"
import { useUsersT } from "../use-users-t"

/** Без `users:read` картки немає: сервер віддав би лише довідник (ім'я та email). */
const FORBIDDEN = new ApiError(403, {
  code: "forbidden",
  message: "Missing permission users:read",
})

/**
 * Картка людини на шаблоні Object Page з вкладками (SPEC §7; ADR-0019, ADR-0024, ADR-0031): «Доступ»
 * (стан, другий крок, дії адміністратора), «Ролі», «Сесії» і вкладки розширення проекту; «Історія» з
 * журналу аудиту — праворуч на широкому, останньою вкладкою на вузькому. «Доступ» і «Сесії» — з
 * правом `users:update` і не під час «Увійти як…», «Історія» — з `audit:read` (SPEC §8.4: розділ
 * без доступу ховається). Вибрана вкладка — в адресі.
 */
export function UserPage() {
  const { id = "" } = useParams()
  // Без сесії ra-core перенаправить на вхід і повернеться сюди після входу.
  const { isPending } = useAuthenticated()
  const access = useCanAccess({ resource: USERS, action: "read" })
  // Вкладки залежать від прав профілю: без нього набір вкладок змінився б уже на екрані.
  const me = useMe()
  if (isPending || access.isPending || me.isPending)
    return <PageSkeleton rows={4} />
  // Інша людина — інша картка: вкладка й фокус не переходять від попередньої.
  return access.canAccess ? <UserCard key={id} id={id} /> : <ForbiddenCard />
}

function ForbiddenCard() {
  const t = useUsersT()
  const { paths } = useUsersModule()
  const heading = usePageHeading(t("user.title"))
  return (
    <ObjectPage
      title={t("user.title")}
      headingRef={heading}
      back={<BackToList to={paths.users} label={t("user.back")} />}
      error={FORBIDDEN}
      sections={[]}
    />
  )
}

function UserCard({ id }: { id: string }) {
  const t = useUsersT()
  const { extension, paths } = useUsersModule()
  const card = useCardRecord<User>(USERS, id)
  const user = card.record
  const heading = usePageHeading(
    user?.name ?? t("user.title"),
    !card.isPending || card.pageError !== undefined,
  )
  useHistoryRefresh(user?.version)
  const statuses = useUserStatuses()
  const slots = useRecordSlots({
    record: user,
    resource: USERS,
    sections: extension.users?.sections,
    actions: extension.users?.actions,
  })
  const { header, dialog, paletteAction } = useUserHeader(
    user,
    statuses,
    slots.actions,
  )
  const impersonating = Boolean(useMe().data?.impersonator)
  // Під час «Увійти як…» сервер відмовляє в змінах доступу (ADR-0011): вкладок змін немає.
  const canManage = useHasPermission(USERS, "update") && !impersonating
  const canPickRoles = useHasPermission("roles", "read")
  const canAudit = useHasPermission("audit", "read")
  const rolesLock: UserRolesLock | null = impersonating
    ? "impersonating"
    : !canManage
      ? "noAccess"
      : !canPickRoles
        ? "noCatalog"
        : null
  const queryClient = useQueryClient()
  // Ролі чи доступ змінились: картка й список перечитують запис (статус, ролі, версія).
  const refreshUser = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: [USERS] })
  }, [queryClient])
  const navigate = useNavigate()
  // Людину вилучили з компанії: до списку; її запис тепер 404, тож перечитуємо лише списки.
  const leaveCard = useCallback(() => {
    void navigate(paths.users)
    void queryClient.invalidateQueries({
      queryKey: [USERS],
      predicate: (query) => query.queryKey[1] !== "getOne",
    })
  }, [navigate, paths.users, queryClient])
  const tabs = useTabParam()
  const sections: (ObjectPageSectionItem & { id: UserSectionId })[] = user
    ? [
        ...(canManage
          ? [
              {
                id: "access" as const,
                title: t("user.sections.access"),
                content: (
                  <UserAccessTab
                    user={user}
                    onChange={refreshUser}
                    onRemoved={leaveCard}
                  />
                ),
              },
            ]
          : []),
        {
          id: "roles",
          title: t("user.sections.roles"),
          content: (
            <UserRolesTab user={user} lock={rolesLock} onChange={refreshUser} />
          ),
        },
        ...(canManage
          ? [
              {
                id: "sessions" as const,
                title: t("user.sections.sessions"),
                content: <UserSessionsTab user={user} />,
              },
            ]
          : []),
      ]
    : []

  const shownSections = applyKeyedChanges(sections, slots.sections)
  const sectionActions = useSectionActions(shownSections, tabs.onValueChange)
  usePaletteActions(
    user
      ? {
          title: user.name,
          actions: paletteAction
            ? [paletteAction, ...sectionActions]
            : sectionActions,
        }
      : null,
  )

  return (
    <>
      <ObjectPage
        title={t("user.title")}
        headingRef={heading}
        back={<BackToList to={paths.users} label={t("user.back")} />}
        isPending={card.isPending}
        error={card.pageError}
        onRetry={card.retry}
        header={header}
        // Запис є з кешу, а перечитати не вдалося (після змін чи повернення на вкладку) — шапка може
        // бути застарілою: стан помилки з повтором над вкладками.
        statusBar={
          user && card.failure ? (
            <PageState
              kind={errorStateKind(card.failure)}
              className="min-h-40"
              onRetry={card.retry}
            />
          ) : undefined
        }
        sections={shownSections}
        tabs={{ ...tabs, label: t("user.tabsLabel") }}
        // Бекенд без журналу змін — картка без «Історії» (`history: false` у розширенні).
        aside={
          extension.users?.history === false || !canAudit
            ? undefined
            : {
                label: t("user.history"),
                content: (
                  <AuditLog
                    filter={{ targetType: USERS, targetId: id }}
                    filters={false}
                    exportable={false}
                    perPage={10}
                  />
                ),
              }
        }
      />
      {dialog}
    </>
  )
}
