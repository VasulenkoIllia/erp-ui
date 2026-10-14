"use client"

import * as React from "react"
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { toast } from "sonner"

import { DeviceIcon, deviceLabel } from "@/registry/erp/account-devices"
import {
  useAuthErrorText,
  useErpAuthProvider,
  useFieldError,
} from "@/registry/erp/auth-layout"
import { ConfirmDialog } from "@/registry/erp/confirm-dialog"
import { PageState, SectionSkeleton } from "@/registry/erp/page-state"
import { useReauth } from "@/registry/erp/reauth-dialog"
import { useResetFactors } from "@/registry/erp/reset-factors"
import { RolePicker, useRoles } from "@/registry/erp/roles-editor"
import { useCompanyId } from "@/registry/hooks/use-company"
import { useHasPermission, useMe } from "@/registry/hooks/use-me"
import { isApiError } from "@/registry/lib/api"
import { companyScope } from "@/registry/lib/company-scope"
import { useFormat } from "@/registry/lib/format"
import { useErpUiT } from "@/registry/lib/i18n"
import { ROLES_QUERY_KEYS } from "@/registry/lib/roles"
import {
  ADMIN_QUERY_KEYS,
  type AdminSession,
  type UserAccess,
} from "@/registry/lib/security-policy"
import { Alert, AlertDescription } from "@/registry/ui/alert"
import { Badge } from "@/registry/ui/badge"
import { Button } from "@/registry/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/registry/ui/dialog"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/registry/ui/field"
import { Input } from "@/registry/ui/input"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/registry/ui/sheet"
import { Spinner } from "@/registry/ui/spinner"
import { Textarea } from "@/registry/ui/textarea"

/**
 * Доступ користувачів для адміністратора (ADR-0013, PF01/A2): стан акаунта, двоетапна перевірка,
 * сесії; вийти на всіх пристроях, скинути другий крок, заблокувати чи розблокувати; активні сесії
 * всієї компанії.
 *
 *   const access = useUserAccessSheet()
 *   <Button onClick={() => access.open({ id, name, email })}>Доступ</Button>{access.sheet}
 */

export interface AccessTarget {
  id: string
  name: string
  email: string
}

/** Стан доступу користувача (право `users:update`). */
export function useUserAccess(userId: string, enabled = true) {
  const provider = useErpAuthProvider()
  const companyId = useCompanyId()
  return useQuery({
    queryKey: [...ADMIN_QUERY_KEYS.userAccess(userId), companyScope(companyId)],
    queryFn: () => provider.admin.getUserAccess(userId),
    enabled,
    // Сесії й стан змінюються будь-коли: панель відкривається зі свіжими даними.
    refetchOnMount: "always",
  })
}

/** «Заблоковано» в рядку списку користувачів; активний — нічого. */
export function UserBlockedBadge({ userId }: { userId: string }) {
  const t = useErpUiT()
  const { data } = useUserAccess(userId)
  return data?.status === "blocked" ? (
    <Badge variant="destructive">{t("userAccess.statusBlocked")}</Badge>
  ) : null
}

/** Після зміни доступу — оновити панель, список сесій і бейджі. */
function useRefreshAccess() {
  const queryClient = useQueryClient()
  return (userId: string) =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: ADMIN_QUERY_KEYS.userAccess(userId),
      }),
      queryClient.invalidateQueries({ queryKey: ADMIN_QUERY_KEYS.sessions }),
    ])
}

/**
 * Панель доступу користувача. `onChange` — після змін ролей чи блокування, щоб проект оновив
 * свій список користувачів.
 */
export function useUserAccessSheet({
  onChange,
}: { onChange?: () => void } = {}) {
  const [target, setTarget] = React.useState<AccessTarget | null>(null)
  const open = React.useCallback((user: AccessTarget) => {
    setTarget(user)
  }, [])
  const sheet = (
    <Sheet
      open={target !== null}
      onOpenChange={(next) => {
        if (!next) setTarget(null)
      }}
    >
      <SheetContent className="w-full overflow-y-auto data-[side=right]:sm:max-w-lg">
        {target ? (
          <AccessPanel key={target.id} target={target} onChange={onChange} />
        ) : null}
      </SheetContent>
    </Sheet>
  )
  return { open, sheet }
}

type Confirm = "signOut" | "block" | "unblock" | null

function AccessPanel({
  target,
  onChange,
}: {
  target: AccessTarget
  onChange?: () => void
}) {
  const t = useErpUiT()
  const provider = useErpAuthProvider()
  const errorText = useAuthErrorText()
  const format = useFormat()
  const refresh = useRefreshAccess()
  const { data: me } = useMe()
  const query = useUserAccess(target.id)
  const [confirm, setConfirm] = React.useState<Confirm>(null)
  const [ending, setEnding] = React.useState<string | null>(null)
  const reset = useResetFactors({
    onDone: () => {
      void refresh(target.id)
    },
  })
  const self = me?.id === target.id

  let body: React.ReactNode
  if (query.isPending) body = <SectionSkeleton rows={3} />
  else if (query.isError)
    body =
      isApiError(query.error) && query.error.status === 403 ? (
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
  else {
    const access: UserAccess = query.data
    const blocked = access.status === "blocked"
    body = (
      <div className="space-y-6">
        <div className="space-y-2">
          <Badge variant={blocked ? "destructive" : "success"}>
            {blocked
              ? t("userAccess.statusBlocked")
              : t("userAccess.statusActive")}
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
                <p>
                  {t("userAccess.reason", { reason: access.blocked.reason })}
                </p>
              </AlertDescription>
            </Alert>
          ) : null}
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted-foreground">
              {t("userAccess.twoFactor")}
            </dt>
            <dd>
              {access.factors.length
                ? access.factors
                    .map((type) => t(`auth.factors.types.${type}`))
                    .join(", ")
                : t("userAccess.twoFactorOff")}
            </dd>
            <dt className="text-muted-foreground">
              {t("userAccess.lastSignIn")}
            </dt>
            <dd>
              {access.lastSignInAt
                ? format.relative(access.lastSignInAt)
                : t("userAccess.noSignIn")}
            </dd>
          </dl>
        </div>

        <UserRolesSection
          key={access.roles.join()}
          userId={target.id}
          current={access.roles}
          self={self}
          onChange={onChange}
        />

        <section className="space-y-2">
          <h3 className="text-sm font-medium">
            {t("userAccess.sessionsTitle")}
          </h3>
          {access.sessions.length ? (
            <ul
              className="divide-y rounded-lg border"
              aria-label={t("userAccess.sessionsTitle")}
            >
              {access.sessions.map((session) => (
                <SessionRow
                  key={session.id}
                  session={session}
                  ending={ending === session.id}
                  onEnd={() => {
                    setEnding(session.id)
                    provider.admin
                      .endSession(session.id)
                      .then(() => {
                        toast.success(t("userAccess.sessionEnded"))
                        return refresh(target.id)
                      })
                      .catch((failure: unknown) => {
                        toast.error(errorText(failure))
                      })
                      .finally(() => {
                        setEnding(null)
                      })
                  }}
                />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t("userAccess.noSessions")}
            </p>
          )}
        </section>

        {self ? null : (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={!access.sessions.length}
              onClick={() => {
                setConfirm("signOut")
              }}
            >
              {t("userAccess.signOutAll")}
            </Button>
            {access.factors.length ? (
              <Button
                variant="outline"
                onClick={() => {
                  reset.start(target)
                }}
              >
                {t("resetFactors.action")}
              </Button>
            ) : null}
            {blocked ? (
              <Button
                variant="outline"
                onClick={() => {
                  setConfirm("unblock")
                }}
              >
                {t("userAccess.unblock")}
              </Button>
            ) : (
              <Button
                variant="destructive"
                onClick={() => {
                  setConfirm("block")
                }}
              >
                {t("userAccess.block")}
              </Button>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>{t("userAccess.title", { name: target.name })}</SheetTitle>
        <SheetDescription>{target.email}</SheetDescription>
      </SheetHeader>
      <div className="@container px-4 pb-4">{body}</div>
      {reset.dialog}
      {confirm === "block" ? (
        <BlockDialog
          target={target}
          onClose={() => {
            setConfirm(null)
          }}
          onDone={() => {
            setConfirm(null)
            void refresh(target.id)
            onChange?.()
          }}
        />
      ) : confirm ? (
        <AccessConfirm
          kind={confirm}
          target={target}
          onClose={() => {
            setConfirm(null)
          }}
          onDone={() => {
            setConfirm(null)
            void refresh(target.id)
            onChange?.()
          }}
        />
      ) : null}
    </>
  )
}

/**
 * Ролі користувача (ADR-0014): позначки ролей і «Зберегти ролі» з повторним підтвердженням.
 * Свої ролі — лише перегляд (щоб не втратити доступ); без права `roles:read` — назви з відповіді.
 */
function UserRolesSection({
  userId,
  current,
  self,
  onChange,
}: {
  userId: string
  current: string[]
  self: boolean
  onChange?: () => void
}) {
  const t = useErpUiT()
  const provider = useErpAuthProvider()
  const errorText = useAuthErrorText()
  const queryClient = useQueryClient()
  const refresh = useRefreshAccess()
  const { guard, dialog: reauthDialog } = useReauth()
  const canRead = useHasPermission("roles", "read")
  const query = useRoles(canRead)
  const [value, setValue] = React.useState(current)
  const [error, setError] = React.useState<string>()
  const [busy, setBusy] = React.useState(false)
  const dirty =
    value.length !== current.length || value.some((r) => !current.includes(r))

  if (!query.data)
    return (
      <section className="space-y-2">
        <h3 className="text-sm font-medium">{t("roles.userRolesTitle")}</h3>
        {canRead && query.isPending ? (
          <SectionSkeleton rows={2} />
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {current.map((role) => (
              <Badge key={role} variant="secondary">
                {role}
              </Badge>
            ))}
          </div>
        )}
      </section>
    )

  return (
    <section className="space-y-3">
      <RolePicker
        roles={query.data.roles}
        value={value}
        legend={t("roles.userRolesTitle")}
        error={error}
        disabled={self || busy}
        onChange={(next) => {
          setValue(next)
          setError(undefined)
        }}
      />
      {self ? null : (
        <Button
          variant="outline"
          disabled={!dirty || busy}
          onClick={() => {
            if (!value.length) {
              setError(t("roles.userRolesRequired"))
              return
            }
            setBusy(true)
            guard(() => provider.roles.setUserRoles(userId, value))
              .then(async () => {
                toast.success(t("roles.userRolesSaved"))
                onChange?.()
                await Promise.all([
                  refresh(userId),
                  queryClient.invalidateQueries({
                    queryKey: ROLES_QUERY_KEYS.list,
                  }),
                ])
              })
              .catch((failure: unknown) => {
                toast.error(errorText(failure))
              })
              .finally(() => {
                setBusy(false)
              })
          }}
        >
          {busy ? <Spinner aria-hidden /> : null}
          {t("roles.userRolesSave")}
        </Button>
      )}
      {reauthDialog}
    </section>
  )
}

function SessionRow({
  session,
  showUser,
  ending,
  onEnd,
}: {
  session: AdminSession
  showUser?: boolean
  ending: boolean
  onEnd: () => void
}) {
  const t = useErpUiT()
  const format = useFormat()
  const device = deviceLabel(session.device, t)
  return (
    <li className="flex flex-col gap-3 p-3 @md:flex-row @md:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <DeviceIcon device={session.device} />
        <div className="min-w-0 flex-1">
          {showUser ? (
            <p className="truncate font-medium">
              {session.user.name}
              <span className="font-normal text-muted-foreground">
                {` · ${session.user.email}`}
              </span>
            </p>
          ) : null}
          <p
            className={
              showUser
                ? "flex flex-wrap items-center gap-2 text-sm"
                : "flex flex-wrap items-center gap-2 font-medium"
            }
          >
            {device}
            {session.current ? (
              <Badge variant="success">{t("userAccess.current")}</Badge>
            ) : null}
          </p>
          <p className="text-sm text-muted-foreground">
            {[
              session.location,
              session.ip ? t("auth.signIns.ip", { ip: session.ip }) : "",
              session.current
                ? t("auth.devices.activeNow")
                : t("auth.devices.lastActive", {
                    when: format.relative(session.lastActiveAt),
                  }),
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {session.impersonatedBy ? (
            <p className="text-sm text-warning-foreground">
              {t("auth.devices.impersonatedBy", {
                name: session.impersonatedBy,
              })}
            </p>
          ) : null}
        </div>
      </div>
      {session.current ? null : (
        <Button
          variant="outline"
          size="sm"
          className="self-start @md:self-center"
          disabled={ending}
          aria-label={t("userAccess.endSessionFor", {
            name: session.user.name,
            device,
          })}
          onClick={onEnd}
        >
          {ending ? <Spinner aria-hidden /> : null}
          {t("userAccess.endSession")}
        </Button>
      )}
    </li>
  )
}

/* ----------------------------- Діалоги дій ----------------------------- */

function BlockDialog({
  target,
  onClose,
  onDone,
}: {
  target: AccessTarget
  onClose: () => void
  onDone: () => void
}) {
  const t = useErpUiT()
  const provider = useErpAuthProvider()
  const fieldError = useFieldError()
  const errorText = useAuthErrorText()
  const { guard, dialog: reauthDialog } = useReauth()
  const id = React.useId()
  const [reason, setReason] = React.useState("")
  const [reasonError, setReasonError] = React.useState<string>()
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent>
        <form
          className="grid gap-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            if (!reason.trim()) {
              setReasonError(t("auth.fieldErrors.required"))
              return
            }
            setReasonError(undefined)
            setError(null)
            setBusy(true)
            guard(() => provider.admin.blockUser(target.id, reason.trim()))
              .then(() => {
                toast.success(t("userAccess.blocked"))
                onDone()
              })
              .catch((failure: unknown) => {
                const message = fieldError(failure, "reason")
                if (message) setReasonError(message)
                else if (failure) setError(errorText(failure))
              })
              .finally(() => {
                setBusy(false)
              })
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {t("userAccess.blockTitle", { name: target.name })}
            </DialogTitle>
            <DialogDescription>
              {t("userAccess.blockDescription")}
            </DialogDescription>
          </DialogHeader>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <Field data-invalid={reasonError ? true : undefined}>
            <FieldLabel htmlFor={`${id}-reason`}>
              {t("userAccess.reasonLabel")}
            </FieldLabel>
            <Textarea
              id={`${id}-reason`}
              rows={2}
              maxLength={500}
              value={reason}
              aria-invalid={reasonError ? true : undefined}
              aria-describedby={`${id}-hint${reasonError ? ` ${id}-error` : ""}`}
              onChange={(event) => {
                setReason(event.target.value)
              }}
            />
            <FieldDescription id={`${id}-hint`}>
              {t("userAccess.reasonHint")}
            </FieldDescription>
            {reasonError ? (
              <FieldError id={`${id}-error`}>{reasonError}</FieldError>
            ) : null}
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t("auth.account.cancel")}
            </Button>
            <Button type="submit" variant="destructive" disabled={busy}>
              {busy ? <Spinner aria-hidden /> : null}
              {t("userAccess.block")}
            </Button>
          </DialogFooter>
        </form>
        {reauthDialog}
      </DialogContent>
    </Dialog>
  )
}

function AccessConfirm({
  kind,
  target,
  onClose,
  onDone,
}: {
  kind: "signOut" | "unblock"
  target: AccessTarget
  onClose: () => void
  onDone: () => void
}) {
  const t = useErpUiT()
  const provider = useErpAuthProvider()
  const errorText = useAuthErrorText()
  const { guard, dialog: reauthDialog } = useReauth()
  const signOut = kind === "signOut"

  return (
    <ConfirmDialog
      open
      title={
        signOut
          ? t("userAccess.signOutAllTitle", { name: target.name })
          : t("userAccess.unblockTitle", { name: target.name })
      }
      description={
        signOut
          ? t("userAccess.signOutAllDescription")
          : t("userAccess.unblockDescription")
      }
      confirmLabel={
        signOut ? t("userAccess.signOutAll") : t("userAccess.unblock")
      }
      destructive={signOut}
      onClose={onClose}
      onConfirm={() =>
        (signOut
          ? provider.admin.signOutUser(target.id)
          : guard(() => provider.admin.unblockUser(target.id))
        )
          .then(() => {
            toast.success(
              signOut
                ? t("userAccess.signedOutAll")
                : t("userAccess.unblocked"),
            )
            onDone()
          })
          .catch((failure: unknown) => {
            toast.error(errorText(failure))
          })
      }
    >
      {reauthDialog}
    </ConfirmDialog>
  )
}

/* ------------------------- Активні сесії компанії ------------------------- */

const PER_PAGE = 20

/** Активні сесії всіх користувачів: пошук за ім'ям чи email, завершення сесії. */
export function ActiveSessionsSection() {
  const t = useErpUiT()
  const provider = useErpAuthProvider()
  const queryClient = useQueryClient()
  const errorText = useAuthErrorText()
  const ids = React.useId()
  const [search, setSearch] = React.useState("")
  const [q, setQ] = React.useState("")
  const [ending, setEnding] = React.useState<string | null>(null)

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setQ(search)
    }, 300)
    return () => {
      clearTimeout(timer)
    }
  }, [search])

  const companyId = useCompanyId()
  const query = useInfiniteQuery({
    queryKey: [...ADMIN_QUERY_KEYS.sessions, q.trim(), companyScope(companyId)],
    queryFn: ({ pageParam }) =>
      provider.admin.getSessions(q, pageParam, PER_PAGE),
    refetchOnMount: "always",
    initialPageParam: 1,
    getNextPageParam: (last, pages) =>
      pages.length * PER_PAGE < last.total ? pages.length + 1 : undefined,
  })

  let body: React.ReactNode
  if (query.isPending) body = <SectionSkeleton rows={3} />
  else if (query.isError)
    body =
      isApiError(query.error) && query.error.status === 403 ? (
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
  else {
    const sessions = query.data.pages.flatMap((page) => page.data)
    const total = query.data.pages[0]?.total ?? 0
    body = sessions.length ? (
      <>
        <ul
          className="divide-y rounded-lg border"
          aria-label={t("userAccess.allSessionsLabel")}
        >
          {sessions.map((session) => (
            <SessionRow
              key={session.id}
              session={session}
              showUser
              ending={ending === session.id}
              onEnd={() => {
                setEnding(session.id)
                provider.admin
                  .endSession(session.id)
                  .then(() => {
                    toast.success(t("userAccess.sessionEnded"))
                    return Promise.all([
                      queryClient.invalidateQueries({
                        queryKey: ADMIN_QUERY_KEYS.sessions,
                      }),
                      queryClient.invalidateQueries({
                        queryKey: ADMIN_QUERY_KEYS.userAccess(session.user.id),
                      }),
                    ])
                  })
                  .catch((failure: unknown) => {
                    toast.error(errorText(failure))
                  })
                  .finally(() => {
                    setEnding(null)
                  })
              }}
            />
          ))}
        </ul>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {t("userAccess.shown", { shown: sessions.length, total })}
          </p>
          {query.hasNextPage ? (
            <Button
              variant="outline"
              size="sm"
              disabled={query.isFetchingNextPage}
              onClick={() => {
                void query.fetchNextPage()
              }}
            >
              {query.isFetchingNextPage ? <Spinner aria-hidden /> : null}
              {t("userAccess.more")}
            </Button>
          ) : null}
        </div>
      </>
    ) : (
      <p className="text-sm text-muted-foreground">
        {t("userAccess.noSessions")}
      </p>
    )
  }

  return (
    <div className="@container space-y-4" data-slot="active-sessions">
      <Field className="@md:max-w-sm">
        <FieldLabel htmlFor={`${ids}-q`}>
          {t("userAccess.searchLabel")}
        </FieldLabel>
        <Input
          id={`${ids}-q`}
          type="search"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value)
          }}
        />
      </Field>
      {body}
    </div>
  )
}
