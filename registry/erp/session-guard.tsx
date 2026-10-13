"use client"

import * as React from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useLogout } from "ra-core"
import { toast } from "sonner"

import { useErpAuthProvider } from "@/registry/erp/auth-layout"
import { useRefreshMe, useResetUserData } from "@/registry/hooks/use-me"
import { isApiError } from "@/registry/lib/api"
import { ME_QUERY_KEY, type Me } from "@/registry/lib/auth"
import { useErpUiT } from "@/registry/lib/i18n"
import {
  getSessionExpiresAt,
  lastActivity,
  markActivity,
  subscribeAuthEvents,
  subscribeSessionExpiry,
  trackActivity,
} from "@/registry/lib/session"
import { Button } from "@/registry/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/registry/ui/dialog"

/** Запити ra-core ("auth", …), що на 401 самі ведуть на вхід. */
const RA_SELF_LOGOUT = new Set([
  "checkAuth",
  "getPermissions",
  "handleCallback",
])

const mmss = (seconds: number) =>
  `${String(Math.floor(seconds / 60))}:${String(seconds % 60).padStart(2, "0")}`

/**
 * Охорона сесії (ADR-0010) — ставиться один раз, коли користувач увійшов:
 *
 * - за `warnSeconds` до кінця сесії (заголовок `X-Session-Expires-At`) чи автовиходу через
 *   бездіяльність (`idleMinutes`, з `GET /auth/methods`) — діалог із відліком і «Продовжити роботу»;
 * - на нулі — вихід і сторінка входу (без мережі — лише тут: дані однаково ховаються);
 * - 401 у будь-якому запиті кешу (сервер завершив сесію) — сторінка входу, як для dataProvider;
 * - вихід в іншій вкладці виходить і тут; вхід в іншій вкладці оновлює профіль.
 * Бездіяльність рахується по всіх вкладках разом (lib/session).
 */
export function SessionGuard({
  idleMinutes,
  warnSeconds = 60,
}: {
  /** Автовихід після бездіяльності, хв; null — лише термін сесії сервера. */
  idleMinutes?: number | null
  warnSeconds?: number
}) {
  const t = useErpUiT()
  const provider = useErpAuthProvider()
  const logout = useLogout()
  const queryClient = useQueryClient()
  const resetUserData = useResetUserData()
  const refreshMe = useRefreshMe()
  const expiresAt = React.useSyncExternalStore(
    subscribeSessionExpiry,
    getSessionExpiresAt,
    () => null,
  )
  const [now, setNow] = React.useState(() => Date.now())
  const signedOut = React.useRef(false)

  React.useEffect(() => trackActivity(), [])
  React.useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now())
    }, 1000)
    return () => {
      clearInterval(timer)
    }
  }, [])

  React.useEffect(
    () =>
      subscribeAuthEvents((event) => {
        if (event.type === "logout") {
          void logout({ remote: true })
          return
        }
        // Вхід в іншій вкладці: та сама cookie могла стати сесією іншої людини чи «Увійти як…» —
        // тоді дані попередньої не показуємо навіть до перезапиту.
        const before = queryClient.getQueryData<Me | null>(ME_QUERY_KEY)
        // useRefreshMe кладе в кеш найсвіжіший профіль, навіть якщо відповіді прийшли не по черзі.
        refreshMe().then(
          (me) => {
            if (
              me?.id !== before?.id ||
              me?.impersonator?.id !== before?.impersonator?.id
            )
              resetUserData()
          },
          // useMe перезапитає профіль сам, і помилка (зокрема 401) піде звичним шляхом.
          () => queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY }),
        )
      }),
    [logout, queryClient, refreshMe, resetUserData],
  )

  // Сесію завершив сервер (адміністратор, «вийти на інших пристроях», блокування): запити кіта
  // йдуть повз dataProvider, тож 401 ловимо в кеші. Сесії на сервері вже немає — лише стан тут.
  // Запити ra-core, що на 401 виходять самі (checkAuth, права, повернення з SSO), пропускаємо.
  React.useEffect(
    () =>
      queryClient.getQueryCache().subscribe((event) => {
        if (event.type !== "updated" || event.action.type !== "error") return
        const key: unknown = event.query.queryKey
        if (
          Array.isArray(key) &&
          key[0] === "auth" &&
          RA_SELF_LOGOUT.has(String(key[1]))
        )
          return
        const error: unknown = event.action.error
        if (!isApiError(error) || error.status !== 401 || signedOut.current)
          return
        signedOut.current = true
        void logout({ remote: true })
      }),
    [logout, queryClient],
  )

  // Вихід за таймером: без мережі сервер не відповість, але дані на екрані однаково ховаємо —
  // людина могла відійти від комп'ютера.
  const expire = React.useCallback(() => {
    signedOut.current = true
    void logout().catch(() => logout({ remote: true }))
  }, [logout])

  // Вихід кнопкою: сесія на сервері має закінчитись, інакше людина думатиме, що вийшла (чужий ПК).
  const signOut = () => {
    signedOut.current = true
    logout().catch(() => {
      signedOut.current = false
      toast.error(t("auth.session.signOutFailed"))
    })
  }

  const sessionLeft = expiresAt
    ? Math.ceil((Date.parse(expiresAt) - now) / 1000)
    : Number.POSITIVE_INFINITY
  const idleLeft = idleMinutes
    ? Math.ceil((lastActivity() + idleMinutes * 60_000 - now) / 1000)
    : Number.POSITIVE_INFINITY
  const left = Math.min(sessionLeft, idleLeft)
  const idle = idleLeft <= sessionLeft
  const open = left <= warnSeconds && left > 0

  React.useEffect(() => {
    if (left > 0 || signedOut.current) return
    expire()
  }, [left, expire])

  const extend = () => {
    markActivity(Date.now() + 10_000)
    void provider.extendSession().catch(() => {
      // Сесія вже закінчилась — відлік дійде до нуля й поведе на вхід.
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) extend()
      }}
    >
      <DialogContent showCloseButton={false} role="alertdialog">
        <DialogHeader>
          <DialogTitle>
            {idle ? t("auth.session.idleTitle") : t("auth.session.title")}
          </DialogTitle>
          <DialogDescription>
            {t("auth.session.description", {
              time: mmss(Math.max(0, Number.isFinite(left) ? left : 0)),
            })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={signOut}>
            {t("auth.session.signOut")}
          </Button>
          <Button onClick={extend}>{t("auth.session.extend")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
