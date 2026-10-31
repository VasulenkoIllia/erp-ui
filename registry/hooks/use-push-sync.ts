import { useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef } from "react"

import { useErpAuthProvider } from "@/registry/erp/auth-layout"
import { useMe } from "@/registry/hooks/use-me"
import { safeRedirectPath } from "@/registry/lib/auth"
import { INBOX_QUERY_KEYS } from "@/registry/lib/notifications"
import {
  isPushSupported,
  PUSH_OPEN_MESSAGE,
  PUSH_RECEIVED_MESSAGE,
  pushLinkBase,
  PUSH_SW_URL,
  syncDevicePush,
} from "@/registry/lib/push-device"

/** Повідомлення шлють і інші фонові файли (MSW, PWA): слухаємо лише свій. */
function isPushWorker(source: MessageEventSource | null): boolean {
  const url = (source as ServiceWorker | null)?.scriptURL
  return url !== undefined && new URL(url).pathname === PUSH_SW_URL
}

/**
 * Web push у вкладці, яка відкрита (ADR-0046): звірити підписку під час запуску, оновити лічильник,
 * коли прийшов push, перейти за натиснутим сповіщенням. Без підписки на цьому пристрої хук нічого
 * не робить. Ставить його `InboxBell`. Під час «Увійти як…» профіль чужий, а пристрій адміністратора:
 * підписку не чіпаємо. Скасування під час виходу — `useSignOut`.
 */
export function usePushSync(onNavigate?: (link: string) => void): void {
  const provider = useErpAuthProvider()
  const queryClient = useQueryClient()
  const me = useMe().data
  const userId = me?.impersonator ? undefined : me?.id
  const navigate = useRef(onNavigate)
  useEffect(() => {
    navigate.current = onNavigate
  })

  useEffect(() => {
    if (!userId) return
    // Збій звірки не заважає роботі: наступний запуск спробує знову.
    syncDevicePush(provider.inbox.push, userId).catch(() => undefined)
  }, [provider, userId])

  useEffect(() => {
    if (!isPushSupported()) return
    const { serviceWorker } = navigator
    const refresh = () =>
      queryClient.invalidateQueries({ queryKey: INBOX_QUERY_KEYS.all })
    const onMessage = ({ data, source }: MessageEvent<unknown>) => {
      if (!isPushWorker(source)) return
      const message = data as { type: string; id?: string; link: string | null }
      if (message.type === PUSH_RECEIVED_MESSAGE) void refresh()
      if (message.type !== PUSH_OPEN_MESSAGE) return
      if (message.id)
        // Перевірочний push в інбокс не йде, а збій позначки не заважає перейти.
        provider.inbox
          .markRead(message.id, true)
          .then(refresh)
          .catch(() => undefined)
      if (!message.link) return
      const path = safeRedirectPath(message.link)
      if (navigate.current) navigate.current(path)
      else window.location.assign(`${pushLinkBase()}${path}`)
    }
    serviceWorker.addEventListener("message", onMessage)
    return () => {
      serviceWorker.removeEventListener("message", onMessage)
    }
  }, [provider, queryClient])
}
