import { useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef } from "react"

import { AUDIT_QUERY_KEYS } from "@/lib/audit"

/**
 * Історія картки перечитується, коли змінюється версія запису (ADR-0019, п. 7): зміна з картки —
 * реквізити, адреса, рахунок — одразу видна в журналі. Перша версія після завантаження — не зміна.
 */
export function useHistoryRefresh(version: number | undefined) {
  const queryClient = useQueryClient()
  const seen = useRef(version)
  useEffect(() => {
    const previous = seen.current
    seen.current = version
    if (previous === undefined || previous === version) return
    void queryClient.invalidateQueries({ queryKey: AUDIT_QUERY_KEYS.events })
  }, [queryClient, version])
}
