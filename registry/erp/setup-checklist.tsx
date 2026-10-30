import * as React from "react"
import { CircleCheckIcon, CircleIcon, CircleMinusIcon } from "lucide-react"
import { Link } from "react-router"

import { PageState, SectionSkeleton } from "@/registry/erp/page-state"
import { useSetupDismissals } from "@/registry/hooks/use-setup-dismissals"
import { errorStateKind } from "@/registry/lib/api"
import { useErpUiT } from "@/registry/lib/i18n"
import { cn } from "@/registry/lib/utils"
import { Button, buttonVariants } from "@/registry/ui/button"
import { Progress } from "@/registry/ui/progress"

/**
 * Чек-лист «Почніть роботу» (SPEC §12, PF12, ADR-0044): що лишилось налаштувати. Показує, що робити,
 * а що зроблено, вирішує той, хто дає `items`: чек-лист сам нічого не запитує.
 *
 * - Лишається, доки кожен пункт не зроблено чи не відхилено кнопкою «Не потрібно». Обов'язковий пункт
 *   відхилити не можна: «Не потрібно» лише в `optional`. Вибір лежить у браузері (`scope`).
 * - Відхилений пункт можна повернути, а якщо його зробили пізніше, він рахується зробленим.
 * - Стан і дії не пропадають із фокусу: кнопка «Не потрібно» стає «Повернути» на тому самому місці.
 *   Останній відхилений пункт закриває чек-лист: фокус переходить на повідомлення про завершення.
 * - Завантаження й помилка — усередині картки (SPEC §8.1): порожній стан не підміняє помилку, а
 *   помилка важливіша за завантаження, бо запит без мережі лишається «в очікуванні» назавжди.
 */
export interface SetupChecklistItem {
  readonly id: string
  readonly label: string
  readonly description?: string
  readonly done: boolean
  /** Дія пункту, що веде на екран налаштування. */
  readonly href: string
  readonly actionLabel: string
  /** Можна відхилити кнопкою «Не потрібно». */
  readonly optional?: boolean
}

export interface SetupChecklistProps {
  /** Кому належить вибір «Не потрібно»: зазвичай компанія. */
  readonly scope: string
  readonly items: readonly SetupChecklistItem[]
  /** Заголовок; за замовчуванням «Почніть роботу». */
  readonly title?: string
  readonly description?: string
  /** Дія під переліком: «Запустити майстер». */
  readonly action?: React.ReactNode
  readonly isPending?: boolean
  readonly error?: unknown
  readonly onRetry?: () => void
  /** Прогріти екран дії: наведення чи фокус на посиланні (ADR-0009). */
  readonly onPreload?: (href: string) => void
  readonly className?: string
}

export function SetupChecklist(props: SetupChecklistProps) {
  // Інша компанія — свій вибір «Не потрібно» й новий стан списку.
  return <Checklist key={props.scope} {...props} />
}

function Checklist({
  scope,
  items,
  title,
  description,
  action,
  isPending = false,
  error,
  onRetry,
  onPreload,
  className,
}: SetupChecklistProps) {
  const t = useErpUiT()
  const headingId = React.useId()
  const { dismissedIds, dismiss, restore } = useSetupDismissals(scope)
  const [closedHere, setClosedHere] = React.useState(false)
  const finishedNote = React.useRef<HTMLParagraphElement>(null)
  // Обов'язковий пункт не відхиляється, навіть якщо його код лишився в браузері зі старої версії.
  const isDismissed = (item: SetupChecklistItem) =>
    Boolean(item.optional) && dismissedIds.has(item.id)
  const isClosed = (item: SetupChecklistItem) => item.done || isDismissed(item)
  const closedCount = items.filter(isClosed).length
  const isFinished = !isPending && !error && closedCount === items.length
  // Чек-лист відкрився знову: коли він закриється сам, фокус не забираємо.
  if (closedHere && !isFinished) setClosedHere(false)

  React.useEffect(() => {
    if (closedHere && isFinished) finishedNote.current?.focus()
  }, [closedHere, isFinished])

  if (isFinished)
    return closedHere ? (
      <p
        ref={finishedNote}
        tabIndex={-1}
        role="status"
        className="text-sm text-muted-foreground"
      >
        {t("setup.finished")}
      </p>
    ) : null

  return (
    <section
      aria-labelledby={headingId}
      data-slot="setup-checklist"
      className={cn(
        "@container space-y-4 rounded-lg border bg-card p-4 text-card-foreground",
        className,
      )}
    >
      <div className="space-y-1">
        <h2 id={headingId} className="text-lg font-semibold break-words">
          {title ?? t("setup.title")}
        </h2>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {error ? (
        <PageState
          kind={errorStateKind(error)}
          className="min-h-40"
          onRetry={onRetry}
        />
      ) : isPending ? (
        <SectionSkeleton rows={3} />
      ) : (
        <>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {t("setup.progress", {
                done: closedCount,
                total: items.length,
              })}
            </p>
            <Progress
              value={closedCount}
              max={items.length}
              aria-label={t("setup.progressLabel")}
            />
          </div>
          <ul className="divide-y">
            {items.map((item) => (
              <ChecklistRow
                key={item.id}
                item={item}
                dismissed={isDismissed(item)}
                onPreload={onPreload}
                onDismiss={() => {
                  dismiss(item.id)
                  if (closedCount + 1 === items.length) setClosedHere(true)
                }}
                onRestore={() => {
                  restore(item.id)
                }}
              />
            ))}
          </ul>
          {action}
        </>
      )}
    </section>
  )
}

function ChecklistRow({
  item,
  dismissed,
  onPreload,
  onDismiss,
  onRestore,
}: {
  item: SetupChecklistItem
  dismissed: boolean
  onPreload: SetupChecklistProps["onPreload"]
  onDismiss: () => void
  onRestore: () => void
}) {
  const t = useErpUiT()
  const pending = !item.done && !dismissed
  const preload = () => {
    onPreload?.(item.href)
  }
  const Icon = item.done
    ? CircleCheckIcon
    : dismissed
      ? CircleMinusIcon
      : CircleIcon
  return (
    <li className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 @lg:flex-row @lg:items-center">
      <div className="flex min-w-0 flex-1 gap-2">
        <Icon
          aria-hidden
          className={cn(
            "mt-0.5 size-5 shrink-0",
            item.done ? "text-success-foreground" : "text-muted-foreground",
          )}
        />
        <div className="min-w-0 space-y-0.5">
          <p
            className={cn(
              "text-sm font-medium break-words",
              !pending && "text-muted-foreground",
            )}
          >
            {item.label}
            {pending ? null : (
              <span className="sr-only">
                {". "}
                {t(item.done ? "setup.done" : "setup.notNeeded")}
              </span>
            )}
          </p>
          {pending && item.description ? (
            <p className="text-sm text-muted-foreground">{item.description}</p>
          ) : null}
        </div>
      </div>
      {item.done ? null : (
        <div className="flex flex-wrap gap-2 @lg:shrink-0">
          {pending ? (
            <Link
              to={item.href}
              onPointerEnter={preload}
              onFocus={preload}
              aria-label={`${item.actionLabel}: ${item.label}`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              {item.actionLabel}
            </Link>
          ) : null}
          {item.optional ? (
            <Button
              variant="ghost"
              size="sm"
              aria-label={t(
                dismissed ? "setup.restoreFor" : "setup.dismissFor",
                { item: item.label },
              )}
              onClick={dismissed ? onRestore : onDismiss}
            >
              {t(dismissed ? "setup.restore" : "setup.notNeeded")}
            </Button>
          ) : null}
        </div>
      )}
    </li>
  )
}
