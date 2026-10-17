import { useEffect, useRef } from "react"
import { useLocation } from "react-router"

import { useFocusHeadingOnNavigation } from "@/hooks/use-focus-heading"

/**
 * h1 сторінки модуля: фокус після переходу й назва вкладки браузера. Зміна мови фокус не чіпає —
 * лише назву вкладки.
 */
export function usePageHeading(title: string, ready = true) {
  const heading = useRef<HTMLHeadingElement>(null)
  useFocusHeadingOnNavigation(heading, useLocation().pathname, ready)
  useEffect(() => {
    document.title = title
  }, [title])
  return heading
}
