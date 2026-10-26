import { useLocation, useSearchParams } from "react-router"

import { TAB_PARAM } from "@/registry/lib/list-state"

export interface TabParam {
  /** Вибрана вкладка з адреси; `null` — перша. */
  readonly value: string | null
  readonly onValueChange: (tab: string) => void
}

/**
 * Вибрана вкладка картки модуля — в адресі (`?tab=`, ADR-0024) на React Router, без нового запису
 * історії: «Назад» веде з картки, а не по вкладках. Стан переходу лишається, тож «До списку» і
 * далі повертає фільтри списку.
 *
 *   const tabs = useTabParam()
 *   <ObjectPage tabs={{ ...tabs, label: "Розділи організації" }} … />
 */
export function useTabParam(): TabParam {
  const state: unknown = useLocation().state
  const [searchParams, setSearchParams] = useSearchParams()
  return {
    value: searchParams.get(TAB_PARAM),
    onValueChange: (tab) => {
      setSearchParams(
        (params) => {
          const next = new URLSearchParams(params)
          next.set(TAB_PARAM, tab)
          return next
        },
        { replace: true, state },
      )
    },
  }
}
