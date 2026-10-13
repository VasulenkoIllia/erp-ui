"use client"

import * as React from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useLogout } from "ra-core"

import { useErpAuthProvider } from "@/registry/erp/auth-layout"
import { ME_QUERY_KEY } from "@/registry/lib/auth"
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

const mmss = (seconds: number) =>
  `${String(Math.floor(seconds / 60))}:${String(seconds % 60).padStart(2, "0")}`

/**
 * Охорона сесії (ADR-0010) — ставиться один раз, коли користувач увійшов:
 *
 * - за `warnSeconds` до кінця сесії (заголовок `X-Session-Expires-At`) чи автовиходу через
 *   бездіяльність (`idleMinutes`, з `GET /auth/methods`) — діалог із відліком і «Продовжити роботу»;
 * - на нулі — вихід і сторінка входу;
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
        if (event.type === "logout") void logout({ remote: true })
        else
          void provider.refreshMe().then((me) => {
            queryClient.setQueryData(ME_QUERY_KEY, me)
          })
      }),
    [logout, provider, queryClient],
  )

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
    signedOut.current = true
    void logout()
  }, [left, logout])

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
          <Button
            variant="outline"
            onClick={() => {
              signedOut.current = true
              void logout()
            }}
          >
            {t("auth.session.signOut")}
          </Button>
          <Button onClick={extend}>{t("auth.session.extend")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
