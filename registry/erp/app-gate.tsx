import * as React from "react"
import { useAuthenticated, useLogout } from "ra-core"
import { toast } from "sonner"

import { useErpAuthProvider } from "@/registry/erp/auth-layout"
import { LoadingFallback, PageState } from "@/registry/erp/page-state"
import { SessionGuard } from "@/registry/erp/session-guard"
import { useMe } from "@/registry/hooks/use-me"
import { errorStateKind } from "@/registry/lib/api"
import { useErpUiT } from "@/registry/lib/i18n"

export interface SessionGateProps {
  children: React.ReactNode
  /**
   * Автовихід після бездіяльності, хв, для `SessionGuard`: без пропса — політика сервера
   * (`idleTimeoutMinutes` з `GET /auth/methods`), null — лише термін сесії сервера.
   */
  idleMinutes?: number | null
  /** За скільки секунд до виходу попередити. */
  warnSeconds?: number
}

/**
 * Брама сесії (крок 1.9, ADR-0029): частина застосунку лише для тих, хто увійшов, — зазвичай
 * оболонка з усіма сторінками; екрани входу (erp/auth-routes) — поруч, поза брамою.
 *
 * - Гість (немає сесії) — на сторінку входу `/login`, після входу ra-core поверне на цю саму адресу.
 * - Поки сесія й профіль перевіряються вперше — спінер на місці сторінки. Повторна перевірка
 *   («Увійти як…», вхід в іншій вкладці скидають дані) оболонку не прибирає: незбережене не губиться.
 * - Профіль не завантажився (мережа, 5xx) — стан помилки з «Спробувати ще» і h1, а не вічний
 *   спінер і не «Увійти»: людина, можливо, вже увійшла. Поки повтор іде, стан лишається на місці —
 *   фокус на кнопці не губиться.
 * - Далі — вміст і `SessionGuard` (його ставить брама, окремо не ставте): попередження перед кінцем
 *   сесії, автовихід за політикою сервера, вихід у всіх вкладках.
 *
 *   <SessionGate><AppShell …>{page}</AppShell></SessionGate>
 */
export function SessionGate({
  children,
  idleMinutes,
  warnSeconds,
}: SessionGateProps) {
  const t = useErpUiT()
  // Без authProvider кіта — помилка налаштування одразу, а не вічний спінер.
  useErpAuthProvider()
  const { isPending } = useAuthenticated()
  const meQuery = useMe()
  const me = meQuery.data
  const [entered, setEntered] = React.useState(false)
  if (!entered && !isPending && me) setEntered(true)

  const failed =
    !me &&
    (meQuery.isError || (meQuery.isFetching && meQuery.errorUpdateCount > 0))
  if (failed)
    return (
      <main className="p-4 pt-24">
        <PageState
          kind={
            errorStateKind(meQuery.error) === "offline" ? "offline" : "error"
          }
          headingLevel={1}
          title={t("auth.session.meFailedTitle")}
          description={t("auth.session.meFailedDescription")}
          onRetry={() => {
            if (!meQuery.isFetching) void meQuery.refetch()
          }}
        />
      </main>
    )
  if (!me || (isPending && !entered))
    return <LoadingFallback className="mt-24" />
  return (
    <>
      {children}
      <SessionGuard idleMinutes={idleMinutes} warnSeconds={warnSeconds} />
    </>
  )
}

/**
 * Вихід із повідомленням для меню користувача: «Ви вийшли», а якщо сервер не завершив сесію
 * (офлайн, 5xx, 10 с без відповіді), — помилка, щоб людина не думала, що вийшла. Повторне
 * натискання, поки вихід іде, нічого не робить. Потрібен `<Toaster />` з ui/sonner у корені.
 *
 *   const signOut = useSignOut()
 *   <UserMenu user={…} onSignOut={signOut} />
 */
export function useSignOut(): () => void {
  const t = useErpUiT()
  const logout = useLogout()
  const pending = React.useRef(false)
  return React.useCallback(() => {
    if (pending.current) return
    pending.current = true
    void logout()
      .then(
        () => {
          toast(t("auth.session.signedOut"))
        },
        () => {
          toast.error(t("auth.session.signOutFailed"))
        },
      )
      .finally(() => {
        pending.current = false
      })
  }, [logout, t])
}
