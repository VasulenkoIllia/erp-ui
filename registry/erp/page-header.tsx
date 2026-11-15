import * as React from "react"

/**
 * Шапка сторінки (SPEC §7, ADR-0091): h1, пояснення під ним і дії; на вузькому контейнері дії під
 * заголовком. Одна на всі екрани: список, форма документа, налаштування, ролі. Окремим елементом, щоб
 * сторінка без таблиці не тягнула код шаблону списку.
 *
 * - Сторінка ставить шапку над перевіркою сесії: тоді шапка — той самий вузол від першого кадру, а не
 *   новий після перевірки (перший екран не зсувається, фокус не губиться, ADR-0022).
 * - Фокус після переходу — на h1 через `headingRef` (`useFocusHeadingOnNavigation`, WCAG 2.4.3).
 * - Дії — список з ключами: розширення модуля додає, ховає чи переставляє дію за ключем (ADR-0020).
 */

/** Дія в шапці: «Створити», «Імпорт». */
export interface PageHeaderAction {
  id: string
  node: React.ReactNode
}

export interface PageHeaderProps {
  title: string
  /** Під заголовком: пояснення сторінки, хто дивиться. */
  description?: React.ReactNode
  /** Ціль фокуса після переходу на сторінку (h1). */
  headingRef?: React.Ref<HTMLHeadingElement>
  actions?: readonly PageHeaderAction[]
}

export function PageHeader({
  title,
  description,
  headingRef,
  actions,
}: PageHeaderProps) {
  return (
    <header data-slot="page-header" className="@container">
      <div className="flex flex-col gap-3 @2xl:flex-row @2xl:items-start @2xl:justify-between">
        <div className="min-w-0 space-y-1">
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="text-2xl font-semibold break-words focus-visible:outline-none"
          >
            {title}
          </h1>
          {description ? (
            <div className="space-y-1 text-muted-foreground">{description}</div>
          ) : null}
        </div>
        {actions?.length ? (
          <div className="flex shrink-0 flex-wrap gap-2">
            {actions.map((action) => (
              <React.Fragment key={action.id}>{action.node}</React.Fragment>
            ))}
          </div>
        ) : null}
      </div>
    </header>
  )
}
