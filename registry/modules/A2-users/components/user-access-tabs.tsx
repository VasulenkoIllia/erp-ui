import {
  UserAccessQuery,
  UserAccessSummary,
} from "@/components/erp/user-access"
import {
  UserAccessButtons,
  useUserAccessActions,
} from "@/components/erp/user-access-actions"
import {
  useAccessCeiling,
  useUserAccess,
  type AccessTarget,
} from "@/components/erp/user-access-data"
import { UserRolesSection } from "@/components/erp/user-roles-section"
import { UserSessionsList } from "@/components/erp/user-sessions"
import { useMe } from "@/hooks/use-me"

import type { User } from "../contract"
import { useUsersT } from "../use-users-t"
import { UserRoleBadges } from "./user-roles"

/**
 * Вкладки «Доступ», «Ролі» й «Сесії» картки людини — частини панелі доступу кіта (ADR-0013,
 * ADR-0014): стан і дії з `GET /users/:id/access`, ролі — `PUT /users/:id/roles`. Свій доступ
 * людина тут не змінює (ні блокування, ні ролей), лише бачить. Людині, якою керувати не можна, —
 * дії неактивні з причиною: вирішує сервер (`canManage`, ADR-0040), без цього поля — «стеля» за
 * каталогом ролей (ADR-0034). `onChange` — після зміни ролей чи доступу: картка й список
 * перечитують запис (статус, ролі, версія для «Історії»).
 */

const targetOf = (user: User): AccessTarget => ({
  id: user.id,
  name: user.name,
  email: user.email,
})

function useIsSelf(user: User): boolean {
  return useMe().data?.id === user.id
}

/** «Стеля» доступу: відповідь сервера, а без неї — ролі людини в компанії запиту з картки. */
const useUserCeiling = (user: User, self: boolean) => {
  const access = useUserAccess(user.id, !self)
  return useAccessCeiling(
    user.roles.map((role) => role.id),
    !self,
    access.isPending ? null : access.data?.canManage,
  )
}

export function UserAccessTab({
  user,
  onChange,
}: {
  user: User
  onChange: () => void
}) {
  const t = useUsersT()
  const self = useIsSelf(user)
  const ceiling = useUserCeiling(user, self)
  const actions = useUserAccessActions(targetOf(user), { onChange })
  return (
    <div className="@container space-y-6">
      <UserAccessQuery userId={user.id}>
        {(access) => (
          <>
            <UserAccessSummary access={access} />
            {self ? (
              <p className="text-sm text-muted-foreground">
                {t("user.selfAccess")}
              </p>
            ) : (
              <UserAccessButtons
                access={access}
                onAction={actions.start}
                {...ceiling}
              />
            )}
          </>
        )}
      </UserAccessQuery>
      {actions.dialogs}
    </div>
  )
}

export function UserSessionsTab({ user }: { user: User }) {
  const self = useIsSelf(user)
  const ceiling = useUserCeiling(user, self)
  return (
    <div className="@container">
      <UserAccessQuery userId={user.id}>
        {(access) => (
          <UserSessionsList
            userId={user.id}
            sessions={access.sessions}
            {...ceiling}
          />
        )}
      </UserAccessQuery>
    </div>
  )
}

/** Чому ролі лише для перегляду: «Увійти як…», немає права керувати доступом чи бачити ролі. */
export type UserRolesLock = "impersonating" | "noAccess" | "noCatalog"

const LOCK_NOTES = {
  impersonating: "user.rolesImpersonating",
  noAccess: "user.rolesReadOnly",
  noCatalog: "user.rolesNoCatalog",
} as const satisfies Record<UserRolesLock, string>

/** Ролі: без замка — вибір і «Зберегти ролі», із замком — назви й причина; свої — з поясненням. */
export function UserRolesTab({
  user,
  lock,
  onChange,
}: {
  user: User
  lock: UserRolesLock | null
  onChange: () => void
}) {
  const t = useUsersT()
  const self = useIsSelf(user)
  const current = user.roles.map((role) => role.id)
  if (lock)
    return (
      <div className="space-y-2">
        <UserRoleBadges roles={user.roles} />
        <p className="text-sm text-muted-foreground">{t(LOCK_NOTES[lock])}</p>
      </div>
    )
  return (
    <div className="space-y-2">
      <UserRolesSection
        // Ролі змінились на сервері (інша вкладка, «Зберегти») — вибір починається з них; порядок
        // ролей у відповіді (назви мовою запиту) вибору не скидає. Не нульовий символ: CLI shadcn
        // пише його справжнім NUL (як у `erp/pin-toggle`).
        key={JSON.stringify([...current].sort())}
        userId={user.id}
        current={current}
        self={self}
        selfReason={t("user.selfRoles")}
        onChange={onChange}
      />
    </div>
  )
}
