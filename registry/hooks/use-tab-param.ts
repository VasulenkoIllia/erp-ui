import { useLocation, useSearchParams } from "react-router"

import { TAB_PARAM } from "@/registry/lib/list-state"

export interface TabParam {
  /** Вибрана вкладка з адреси; `null` — перша. */
  readonly value: string | null
  readonly onValueChange: (tab: string) => void
}

/** Значення параметра адреси сторінки й його зміна; `null` — прибрати параметр. */
export interface SearchParamState {
  readonly value: string | null
  readonly onValueChange: (value: string | null) => void
}

/**
 * Вибір на сторінці в адресі (`?<name>=`) на React Router, без нового запису історії: «Назад» веде
 * зі сторінки, а не по виборах (вкладка картки, роль на сторінці ролей, ADR-0033). Стан переходу
 * лишається, тож «До списку» і далі повертає фільтри списку.
 */
export function useSearchParamState(name: string): SearchParamState {
  const state: unknown = useLocation().state
  const [searchParams, setSearchParams] = useSearchParams()
  return {
    value: searchParams.get(name),
    onValueChange: (value) => {
      setSearchParams(
        (params) => {
          const next = new URLSearchParams(params)
          if (value === null) next.delete(name)
          else next.set(name, value)
          return next
        },
        { replace: true, state },
      )
    },
  }
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
  return useSearchParamState(TAB_PARAM)
}
