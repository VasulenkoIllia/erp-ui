import { useEffect, useRef } from "react"

import { useFocusHeadingOnNavigation } from "./heading-focus"

/**
 * Заголовок сторінки демо. Після переходу між сторінками переносить фокус на h1 (для скрінрідерів);
 * зміна мови фокус не чіпає — лише назву вкладки.
 */
export function PageHeader({ title, lead }: { title: string; lead: string }) {
  const heading = useRef<HTMLHeadingElement>(null)
  useFocusHeadingOnNavigation(heading)

  useEffect(() => {
    document.title = `${title} · erp-ui`
  }, [title])

  return (
    <div className="space-y-1">
      <h1
        ref={heading}
        tabIndex={-1}
        className="text-2xl font-semibold focus-visible:outline-none"
      >
        {title}
      </h1>
      <p className="text-muted-foreground">{lead}</p>
    </div>
  )
}
