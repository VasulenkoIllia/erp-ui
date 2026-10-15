import { usePageHeading } from "./heading-focus"

/**
 * Заголовок сторінки демо. Після переходу між сторінками переносить фокус на h1 (для скрінрідерів);
 * зміна мови фокус не чіпає — лише назву вкладки.
 */
export function PageHeader({ title, lead }: { title: string; lead: string }) {
  const heading = usePageHeading(title)
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
