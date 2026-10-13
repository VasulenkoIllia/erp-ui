import { useEffect, useRef } from "react"

let firstRender = true

/** Заголовок сторінки демо. Після переходу між сторінками переносить фокус на h1 (для скрінрідерів). */
export function PageHeader({ title, lead }: { title: string; lead: string }) {
  const heading = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    document.title = `${title} · erp-ui`
    if (firstRender) {
      firstRender = false
      return
    }
    heading.current?.focus()
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
