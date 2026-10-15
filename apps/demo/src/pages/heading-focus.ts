import { useEffect, useRef } from "react"
import { useLocation } from "react-router"

import { useFocusHeadingOnNavigation } from "@/registry/hooks/use-focus-heading"

/**
 * h1 сторінки демо: фокус після переходу (`useFocusHeadingOnNavigation` з hooks/use-focus-heading)
 * і назва вкладки браузера. Зміна мови фокус не чіпає — лише назву вкладки.
 */
export function usePageHeading(title: string, ready = true) {
  const heading = useRef<HTMLHeadingElement>(null)
  useFocusHeadingOnNavigation(heading, useLocation().pathname, ready)
  useEffect(() => {
    document.title = `${title} · erp-ui`
  }, [title])
  return heading
}
