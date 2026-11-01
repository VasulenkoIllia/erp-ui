import { useQueryClient } from "@tanstack/react-query"
import * as React from "react"

import { useErpAuthProvider } from "@/registry/erp/auth-layout"
import { useCompanyId } from "@/registry/hooks/use-company"
import { useMe } from "@/registry/hooks/use-me"
import { connectRealtime } from "@/registry/lib/realtime"
import { syncRealtimeCache } from "@/registry/lib/realtime-cache"

/**
 * Вмикає канал подій сервера для застосунку (PF19, ADR-0051). Ставиться один раз, лише для людини,
 * що увійшла, поруч із `SessionGuard`; нічого не показує.
 *
 *   {me ? <RealtimeSync /> : null}
 *
 * Перемикання компанії відкриває канал нової компанії. Без цього компонента, чи якщо бекенд каналу
 * не має, кіт працює опитуванням, як раніше.
 */
export function RealtimeSync() {
  const provider = useErpAuthProvider()
  const queryClient = useQueryClient()
  const companyId = useCompanyId()
  const accountId = useMe().data?.id
  const open = provider.realtime.open

  React.useEffect(() => syncRealtimeCache(queryClient), [queryClient])
  React.useEffect(() => {
    if (accountId === undefined) return
    return connectRealtime({ open, accountId, companyId })
  }, [open, accountId, companyId])
  return null
}
