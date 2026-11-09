import { useQueryClient } from "@tanstack/react-query"
import { useUpdate } from "ra-core"
import * as React from "react"
import { toast } from "sonner"

import { ConfirmDialog } from "@/registry/erp/confirm-dialog"
import { useApiErrorMessage } from "@/registry/hooks/use-api-error-message"
import { useCompanyId } from "@/registry/hooks/use-company"
import { useCompanyProfile } from "@/registry/hooks/use-company-profile"
import { companyScope } from "@/registry/lib/company-scope"
import { todayIn } from "@/registry/lib/dates"
import { useFormat } from "@/registry/lib/format"
import { useErpUiT } from "@/registry/lib/i18n"
import {
  fiscalYears,
  PERIOD_LOCK,
  type FiscalYear,
  type PeriodLock,
} from "@/registry/lib/period-lock"
import { useUserTimeZone } from "@/registry/lib/user-timezone"
import { cn } from "@/registry/lib/utils"
import { Button } from "@/registry/ui/button"

/**
 * Роки компанії (PF13, ADR-0069; рішення 30.10.2026, ADR-0043): поточний фінансовий рік і два
 * попередні з місяця початку профілю компанії (`fiscalYearStartMonth`, поки профіль не прийшов —
 * січень), стан кожного щодо закритого періоду й «Закрити рік» для року, що вже скінчився.
 *
 * - Закрити рік — та сама дата закриття (`PATCH /period-lock/current` з останнім днем року) після
 *   підтвердження з наслідком; відкрити знову — у полі дати з причиною.
 * - Без права — лише стан, без кнопок. Конфлікт версій — повідомлення й перечитаний запис.
 * - Закритий рік втрачає кнопку, тож фокус після підтвердження — на заголовку списку, а не на `body`:
 *   діалог повертає його на кнопку, поки запис ще старий, а кнопка зникає з наступним рендером.
 * - Широкий контейнер — назва, межі й стан в один рядок, вузький — одне під одним (`@container`).
 */
export interface FiscalYearListProps {
  readonly lock: PeriodLock
  readonly readOnly: boolean
  /** Рівень заголовка списку: 2 — під h1 сторінки, 3 — у розділі під h2. */
  readonly headingLevel?: 2 | 3
}

export function FiscalYearList({
  lock,
  readOnly,
  headingLevel = 2,
}: FiscalYearListProps) {
  const Heading = headingLevel === 2 ? "h2" : "h3"
  const t = useErpUiT()
  const format = useFormat()
  const today = todayIn(useUserTimeZone())
  const { data: profile } = useCompanyProfile()
  const years = fiscalYears({
    startMonth: profile?.fiscalYearStartMonth,
    lockedThrough: lock.lockedThrough,
    today,
  })
  // Рік лишається в діалозі й після закриття: текст не зникає, поки діалог згасає.
  const [closing, setClosing] = React.useState<FiscalYear | null>(null)
  const [isConfirming, setConfirming] = React.useState(false)
  const close = useCloseYear(lock)
  const headingId = React.useId()
  const headingRef = React.useRef<HTMLHeadingElement>(null)
  const closedYear = React.useRef<FiscalYear | null>(null)
  const { lockedThrough } = lock
  React.useEffect(() => {
    const year = closedYear.current
    if (!year || !lockedThrough || lockedThrough < year.end) return
    closedYear.current = null
    headingRef.current?.focus()
  }, [lockedThrough])
  const current = years[0]
  return (
    <section aria-labelledby={headingId} className="@container grid gap-3">
      <div className="grid gap-1">
        <Heading
          ref={headingRef}
          id={headingId}
          tabIndex={-1}
          className="text-base font-semibold outline-none"
        >
          {t("periodLock.years.title")}
        </Heading>
        {current ? (
          <p className="text-sm text-muted-foreground">
            {t("periodLock.years.description", {
              date: format.date(current.start, "dayMonth"),
            })}
          </p>
        ) : null}
      </div>
      <ul
        aria-label={t("periodLock.years.listLabel")}
        className="divide-y rounded-lg border"
      >
        {years.map((year) => (
          <li
            key={year.start}
            data-status={year.status}
            className="flex flex-col gap-2 px-3 py-2 text-sm @lg:flex-row @lg:items-center"
          >
            <div className="grid min-w-0 flex-1 gap-0.5">
              <span className="font-medium tabular-nums">{year.label}</span>
              <span className="text-muted-foreground tabular-nums">
                {t("periodLock.years.range", {
                  from: format.date(year.start, "date"),
                  to: format.date(year.end, "date"),
                })}
              </span>
            </div>
            <YearStatus year={year} lockedThrough={lock.lockedThrough} />
            {!readOnly && !year.isCurrent && year.status !== "closed" ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="self-start @lg:self-auto"
                onClick={() => {
                  setClosing(year)
                  setConfirming(true)
                }}
              >
                {t("periodLock.years.close", { year: year.label })}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={isConfirming}
        title={t("periodLock.years.closeTitle", { year: closing?.label ?? "" })}
        description={t("periodLock.years.closeDescription", {
          date: closing ? format.date(closing.end, "date") : "",
        })}
        confirmLabel={t("periodLock.years.close", {
          year: closing?.label ?? "",
        })}
        lockWhileBusy
        returnFocus={() => headingRef.current}
        onClose={() => {
          setConfirming(false)
        }}
        onConfirm={async () => {
          if (!closing) return
          if (!(await close(closing))) return
          closedYear.current = closing
          setConfirming(false)
        }}
      />
    </section>
  )
}

/** Стан року текстом, а не лише кольором (WCAG 1.4.1). */
function YearStatus({
  year,
  lockedThrough,
}: {
  year: FiscalYear
  lockedThrough: string | null
}) {
  const t = useErpUiT()
  const format = useFormat()
  const text =
    year.status === "closed"
      ? t("periodLock.years.closed")
      : year.status === "partly" && lockedThrough
        ? t("periodLock.years.partly", {
            date: format.date(lockedThrough, "date"),
          })
        : year.isCurrent
          ? t("periodLock.years.current")
          : t("periodLock.years.open")
  return (
    <span
      className={cn(
        "text-sm",
        year.status === "open" ? "text-muted-foreground" : "font-medium",
      )}
    >
      {text}
    </span>
  )
}

/** Закрити рік: дата закриття — останній день року; `true` — збережено. */
function useCloseYear(lock: PeriodLock) {
  const t = useErpUiT()
  const companyId = useCompanyId()
  const errorText = useApiErrorMessage()
  const queryClient = useQueryClient()
  const [update] = useUpdate<PeriodLock>()
  return async (year: FiscalYear): Promise<boolean> => {
    try {
      await update(
        PERIOD_LOCK,
        {
          id: lock.id,
          data: { lockedThrough: year.end },
          previousData: lock,
          meta: companyScope(companyId),
        },
        { mutationMode: "pessimistic", returnPromise: true },
      )
      toast.success(t("periodLock.years.done", { year: year.label }))
      return true
    } catch (error) {
      toast.error(errorText(error))
      // Конфлікт чи відмова: запис на екрані міг застаріти.
      void queryClient.invalidateQueries({ queryKey: [PERIOD_LOCK] })
      return false
    }
  }
}
