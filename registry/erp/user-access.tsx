import * as React from "react"

import { PageState, SectionSkeleton } from "@/registry/erp/page-state"
import {
  UserAccessButtons,
  useUserAccessActions,
  type UserAccessAction,
} from "@/registry/erp/user-access-actions"
import {
  useAccessCeiling,
  useUserAccess,
  type AccessTarget,
} from "@/registry/erp/user-access-data"
import { UserRolesSection } from "@/registry/erp/user-roles-section"
import {
  ActiveSessionsSection,
  UserSessionsList,
} from "@/registry/erp/user-sessions"
import { useMe } from "@/registry/hooks/use-me"
import { isApiError } from "@/registry/lib/api"
import { useFormat } from "@/registry/lib/format"
import { useErpUiT } from "@/registry/lib/i18n"
import type { UserAccess } from "@/registry/lib/security-policy"
import { Alert, AlertDescription } from "@/registry/ui/alert"
import { Badge } from "@/registry/ui/badge"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/registry/ui/sheet"

/**
 * Доступ користувачів для адміністратора (ADR-0013, PF01/A2): стан акаунта, двоетапна перевірка,
 * сесії; вийти на всіх пристроях, скинути другий крок, заблокувати чи розблокувати, вилучити з
 * компанії (ADR-0041); активні сесії всієї компанії.
 *
 *   const access = useUserAccessSheet()
 *   <Button onClick={() => access.open({ id, name, email })}>Доступ</Button>{access.sheet}
 *
 * Частини панелі — окремими елементами: дані (`erp/user-access-data`), дії (`erp/user-access-actions`),
 * ролі (`erp/user-roles-section`) і сесії (`erp/user-sessions`).
 */

// erp-ui: окремі import + export, бо shadcn CLI хибно переписує шляхи в `export … from`.
export { ActiveSessionsSection, useUserAccess }
export type { AccessTarget }

/** «Заблоковано» в рядку списку користувачів; активний — нічого. */
export function UserBlockedBadge({ userId }: { userId: string }) {
  const t = useErpUiT()
  const { data } = useUserAccess(userId)
  return data?.status === "blocked" ? (
    <Badge variant="destructive">{t("userAccess.statusBlocked")}</Badge>
  ) : null
}

/**
 * Панель доступу користувача. `onChange` — після змін ролей чи блокування, щоб проект оновив
 * свій список користувачів. Людину вилучили з компанії — панель закривається сама, а кнопки, з якої
 * її відкрили, разом із рядком більше немає: фокус іде на `returnFocus` (як у `ConfirmDialog`).
 */
export function useUserAccessSheet({
  onChange,
  returnFocus,
}: {
  onChange?: () => void
  returnFocus?: () => HTMLElement | null
} = {}) {
  const [target, setTarget] = React.useState<AccessTarget | null>(null)
  const removed = React.useRef(false)
  const open = React.useCallback((user: AccessTarget) => {
    removed.current = false
    setTarget(user)
  }, [])
  const sheet = (
    <Sheet
      open={target !== null}
      onOpenChange={(next) => {
        if (!next) setTarget(null)
      }}
      // Не `finalFocus`: вкладений діалог закривається разом зі шторкою, і фокус туди не доходить.
      onOpenChangeComplete={(next) => {
        if (!next && removed.current) returnFocus?.()?.focus()
      }}
    >
      <SheetContent className="w-full overflow-y-auto data-[side=right]:sm:max-w-lg">
        {target ? (
          <AccessPanel
            key={target.id}
            target={target}
            onChange={onChange}
            onRemoved={() => {
              removed.current = true
              setTarget(null)
              onChange?.()
            }}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  )
  return { open, sheet }
}

/** Стан акаунта: активний чи заблокований (хто, коли, чому), другий крок, останній вхід. */
export function UserAccessSummary({ access }: { access: UserAccess }) {
  const t = useErpUiT()
  const format = useFormat()
  const blocked = access.status === "blocked"
  return (
    <div className="space-y-2">
      <Badge variant={blocked ? "destructive" : "success"}>
        {blocked ? t("userAccess.statusBlocked") : t("userAccess.statusActive")}
      </Badge>
      {access.blocked ? (
        <Alert variant="destructive">
          <AlertDescription className="space-y-1">
            <p>
              {t("userAccess.blockedInfo", {
                date: format.date(access.blocked.at, "dateTime"),
                by: access.blocked.by,
              })}
            </p>
            <p>{t("userAccess.reason", { reason: access.blocked.reason })}</p>
          </AlertDescription>
        </Alert>
      ) : null}
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted-foreground">{t("userAccess.twoFactor")}</dt>
        <dd>
          {access.factors.length
            ? access.factors
                .map((type) => t(`auth.factors.types.${type}`))
                .join(", ")
            : t("userAccess.twoFactorOff")}
        </dd>
        <dt className="text-muted-foreground">{t("userAccess.lastSignIn")}</dt>
        <dd>
          {access.lastSignInAt
            ? format.relative(access.lastSignInAt)
            : t("userAccess.noSignIn")}
        </dd>
      </dl>
    </div>
  )
}

/**
 * Доступ людини (`GET /users/:id/access`) зі станами: завантаження, немає права, помилка з повтором;
 * дані — у `children`. Спільний для панелі доступу й вкладок картки людини модуля A2.
 */
export function UserAccessQuery({
  userId,
  children,
}: {
  userId: string
  children: (access: UserAccess) => React.ReactNode
}) {
  const query = useUserAccess(userId)
  if (query.isPending) return <SectionSkeleton rows={3} />
  if (query.isError)
    return isApiError(query.error) && query.error.status === 403 ? (
      <PageState kind="forbidden" className="min-h-40" />
    ) : (
      <PageState
        kind="error"
        className="min-h-40"
        onRetry={() => {
          void query.refetch()
        }}
      />
    )
  return children(query.data)
}

/**
 * Стан, ролі, сесії й дії панелі; людина понад «стелю» — дії неактивні з причиною (ADR-0034), яку
 * видно один раз над сесіями й діями, а скрінрідер чує в описі кожної кнопки.
 */
function AccessDetails({
  target,
  access,
  self,
  onAction,
  onChange,
}: {
  target: AccessTarget
  access: UserAccess
  self: boolean
  onAction: (action: UserAccessAction) => void
  onChange?: () => void
}) {
  const t = useErpUiT()
  const ceiling = useAccessCeiling(access.roles, !self, access.canManage)
  return (
    <div className="space-y-6">
      <UserAccessSummary access={access} />

      <UserRolesSection
        key={access.roles.join()}
        userId={target.id}
        current={access.roles}
        self={self}
        onChange={onChange}
      />

      {ceiling.deniedReason ? (
        <p className="text-sm text-muted-foreground">{ceiling.deniedReason}</p>
      ) : null}

      <section className="space-y-2">
        <h3 className="text-sm font-medium">{t("userAccess.sessionsTitle")}</h3>
        <UserSessionsList
          userId={target.id}
          sessions={access.sessions}
          {...ceiling}
          showReason={false}
        />
      </section>

      {self ? null : (
        <UserAccessButtons
          access={access}
          onAction={onAction}
          {...ceiling}
          showReason={false}
        />
      )}
    </div>
  )
}

function AccessPanel({
  target,
  onChange,
  onRemoved,
}: {
  target: AccessTarget
  onChange?: () => void
  onRemoved: () => void
}) {
  const t = useErpUiT()
  const { data: me } = useMe()
  const actions = useUserAccessActions(target, { onChange, onRemoved })
  const self = me?.id === target.id

  const body = (
    <UserAccessQuery userId={target.id}>
      {(access) => (
        <AccessDetails
          target={target}
          access={access}
          self={self}
          onAction={actions.start}
          onChange={onChange}
        />
      )}
    </UserAccessQuery>
  )

  return (
    <>
      <SheetHeader>
        <SheetTitle>{t("userAccess.title", { name: target.name })}</SheetTitle>
        <SheetDescription>{target.email}</SheetDescription>
      </SheetHeader>
      <div className="@container px-4 pb-4">{body}</div>
      {actions.dialogs}
    </>
  )
}
