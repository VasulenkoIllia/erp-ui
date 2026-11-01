/**
 * Кеш за подіями каналу (PF19, ADR-0051): зміна запису на сервері перечитує відкриті списки й картки
 * ресурсу. Ключі ra-core починаються з ресурсу, тож ключів кіта (`erp-ui`: профіль, права, журнал)
 * подія ресурсу не зачіпає. Сповіщення — ресурс із кешем кіта: їхній ключ у `KIT_QUERY_KEYS`.
 *
 * Подій буває багато: масова зміна дає сотні `updated` поспіль. Тому ресурс перечитується не частіше
 * ніж раз на `REALTIME_FLUSH_MS`, скільки б подій не прийшло.
 */
import type { QueryClient, QueryKey } from "@tanstack/react-query"

import {
  INBOX_QUERY_KEYS,
  NOTIFICATIONS_RESOURCE,
} from "@/registry/lib/notifications"
import { REALTIME_RESYNC, subscribeRealtime } from "@/registry/lib/realtime"

export const REALTIME_FLUSH_MS = 1_000

const RECORD_EVENT = /\.(created|updated|deleted)$/

/** Ресурси, чий кеш живе не під назвою ресурсу. */
const KIT_QUERY_KEYS: Readonly<Record<string, QueryKey>> = {
  [NOTIFICATIONS_RESOURCE]: INBOX_QUERY_KEYS.all,
}

/** Почати оновлювати кеш за подіями; повертає зупинку. */
export function syncRealtimeCache(queryClient: QueryClient): () => void {
  const pending = new Set<string>()
  let timer: ReturnType<typeof setTimeout> | undefined

  const flush = () => {
    timer = undefined
    const resources = [...pending]
    pending.clear()
    for (const resource of resources)
      void queryClient.invalidateQueries({
        queryKey: KIT_QUERY_KEYS[resource] ?? [resource],
      })
  }

  const stop = subscribeRealtime((event) => {
    if (event.type === REALTIME_RESYNC) {
      // Обрив: подій за цей час могло не дійти. Профіль і права — ні: у них свій ритм перечитування.
      void queryClient.invalidateQueries({
        predicate: (query) => query.queryKey[0] !== "erp-ui",
      })
      for (const queryKey of Object.values(KIT_QUERY_KEYS))
        void queryClient.invalidateQueries({ queryKey })
      return
    }
    if (!RECORD_EVENT.test(event.type)) return
    pending.add(event.resource)
    timer ??= setTimeout(flush, REALTIME_FLUSH_MS)
  })

  return () => {
    stop()
    clearTimeout(timer)
  }
}
