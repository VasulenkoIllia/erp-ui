"use client"

import * as React from "react"
import { CheckIcon, ChevronRightIcon } from "lucide-react"

import { useErpUiT } from "@/registry/lib/i18n"
import { cn } from "@/registry/lib/utils"

/**
 * Шапка картки запису (SPEC §7 Object Page: RecordHeader і StatusBar; ADR-0019).
 *
 * - `RecordHeader` — назва запису як заголовок сторінки (h1), статус поруч, ключові поля списком
 *   `<dl>` і дії. На вузькому контейнері (`@container`, SPEC §9) дії переносяться під назву, поля —
 *   у дві колонки.
 * - `RecordStatusBar` — етапи життєвого циклу: пройдені з позначкою, поточний — `aria-current="step"`.
 *   Лише показ: перехід між етапами — дії шапки (права, підтвердження, сервер).
 */

export interface RecordField {
  id: string
  label: string
  /** Порожнє значення показується як «—» (SPEC §8.1). */
  value: React.ReactNode
}

export function RecordHeader({
  title,
  status,
  fields = [],
  actions,
  headingRef,
  className,
}: {
  /** Назва запису: «Рахунок 2026-0001». */
  title: string
  /** Статус (Badge) поруч із назвою. */
  status?: React.ReactNode
  /** Ключові поля під назвою. */
  fields?: readonly RecordField[]
  /** Дії запису, основна — першою. */
  actions?: React.ReactNode
  /** Фокус на заголовок після переходу: скрінрідер чує, куди прийшов (WCAG 2.4.3). */
  headingRef?: React.Ref<HTMLHeadingElement>
  className?: string
}) {
  return (
    <header
      data-slot="record-header"
      className={cn("@container space-y-4", className)}
    >
      <div className="flex flex-col gap-3 @2xl:flex-row @2xl:items-start @2xl:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="min-w-0 text-2xl font-semibold break-words focus-visible:outline-none"
          >
            {title}
          </h1>
          {status}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>
        ) : null}
      </div>
      {fields.length > 0 ? (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 @2xl:grid-cols-4">
          {fields.map((field) => (
            <div key={field.id} className="min-w-0 space-y-0.5">
              <dt className="text-sm text-muted-foreground">{field.label}</dt>
              <dd className="font-medium break-words tabular-nums">
                {isEmpty(field.value) ? "—" : field.value}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </header>
  )
}

const isEmpty = (value: React.ReactNode) =>
  value === null || value === undefined || value === ""

export interface RecordStep {
  id: string
  label: string
}

export function RecordStatusBar({
  label,
  steps,
  current,
  className,
}: {
  /** Назва для скрінрідера: «Етапи рахунку». */
  label: string
  steps: readonly RecordStep[]
  /** Id поточного етапу. */
  current: string
  className?: string
}) {
  const t = useErpUiT()
  const currentIndex = steps.findIndex((step) => step.id === current)
  // Етапу немає в переліку (стан поза життєвим циклом) — показати всі, а не порожню смугу.
  const known = currentIndex !== -1
  return (
    <div data-slot="record-status-bar" className={cn("@container", className)}>
      <ol
        aria-label={label}
        className="flex flex-wrap items-center gap-x-1 gap-y-1 text-sm"
      >
        {steps.map((step, index) => {
          const done = index < currentIndex
          const active = index === currentIndex
          return (
            <li
              key={step.id}
              // Вузький контейнер: лише поточний етап із «2 з 4» — ряд етапів не переноситься.
              className={cn(
                "items-center gap-1 @lg:flex",
                active || !known ? "flex" : "hidden",
              )}
            >
              {index > 0 ? (
                <ChevronRightIcon
                  aria-hidden
                  className="hidden size-4 text-muted-foreground @lg:block"
                />
              ) : null}
              <span
                aria-current={active ? "step" : undefined}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2 py-1",
                  // У forced-colors тло зникає: поточний етап — ще й контуром (WCAG 1.4.1).
                  active &&
                    "bg-primary font-medium text-primary-foreground forced-colors:outline-2 forced-colors:outline-solid",
                  done && "text-foreground",
                  !active && !done && "text-muted-foreground",
                )}
              >
                {done ? <CheckIcon aria-hidden className="size-4" /> : null}
                {step.label}
                {done ? (
                  <span className="sr-only">{`, ${t("recordHeader.stepDone")}`}</span>
                ) : null}
              </span>
              {active ? (
                <span className="text-muted-foreground tabular-nums @lg:hidden">
                  {t("recordHeader.stepOf", {
                    step: index + 1,
                    total: steps.length,
                  })}
                </span>
              ) : null}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
