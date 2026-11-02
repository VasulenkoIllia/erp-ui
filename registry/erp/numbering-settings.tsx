import { useCanAccess, useGetList } from "ra-core"
import * as React from "react"

import { NumberingSeriesForm } from "@/registry/erp/numbering-series-form"
import { PageState, SectionSkeleton } from "@/registry/erp/page-state"
import { useCompanyId } from "@/registry/hooks/use-company"
import { useHasPermission } from "@/registry/hooks/use-me"
import { useSearchParamState } from "@/registry/hooks/use-tab-param"
import { errorStateKind, MAX_PER_PAGE } from "@/registry/lib/api"
import { companyScope } from "@/registry/lib/company-scope"
import { useErpUiT } from "@/registry/lib/i18n"
import {
  NUMBERING_SERIES,
  type NumberingSeries,
} from "@/registry/lib/numbering"
import { cn } from "@/registry/lib/utils"
import { Alert, AlertDescription } from "@/registry/ui/alert"

/**
 * Налаштування нумерації документів (PF03b, ADR-0058): типи документів компанії зі своїми серіями,
 * форма вибраної серії з переглядом наступного номера. Серії створює сервер, тож порожній список —
 * у проекті ще немає документів із номерами.
 *
 * - Вибрана серія — в адресі (`?series=`), перехід до іншої з незбереженими змінами питає підтвердження.
 * - Широкий контейнер — список ліворуч і форма праворуч, вузький — одне під одним (`@container`).
 * - Без `numbering-series:read` — «немає доступу», без `numbering-series:update` — лише перегляд.
 * - Інша компанія — нова форма: незбережені правки до неї не переходять.
 */
export interface NumberingSettingsProps {
  /** Назви типів документів мовою інтерфейсу за ресурсом: `{ quotes: "Пропозиції" }`; немає — ресурс. */
  readonly labels?: Readonly<Record<string, string>>
  /** Рівень заголовка серії й станів: 2 — під h1 сторінки, 3 — у розділі під h2. */
  readonly headingLevel?: 2 | 3
}

/** Параметр адреси з вибраною серією. */
const NUMBERING_SERIES_PARAM = "series"

export function NumberingSettings({
  labels = {},
  headingLevel = 2,
}: NumberingSettingsProps) {
  const access = useCanAccess({ resource: NUMBERING_SERIES, action: "read" })
  if (access.isPending) return <SectionSkeleton rows={4} />
  if (!access.canAccess)
    return (
      <PageState
        kind="forbidden"
        headingLevel={headingLevel}
        className="min-h-40"
      />
    )
  return <SeriesBrowser labels={labels} headingLevel={headingLevel} />
}

function SeriesBrowser({
  labels,
  headingLevel,
}: Required<NumberingSettingsProps>) {
  const Heading = headingLevel === 2 ? "h2" : "h3"
  const t = useErpUiT()
  const companyId = useCompanyId()
  const canUpdate = useHasPermission(NUMBERING_SERIES, "update")
  const selected = useSearchParamState(NUMBERING_SERIES_PARAM)
  const headingId = React.useId()
  const heading = React.useRef<HTMLHeadingElement>(null)
  // Серію вибрала людина: фокус на її заголовок, бо на вузькому екрані форма під списком.
  const focusNext = React.useRef(false)
  React.useEffect(() => {
    if (!focusNext.current) return
    focusNext.current = false
    heading.current?.focus()
  }, [selected.value])
  const { data, isPending, error, refetch, fetchStatus } =
    useGetList<NumberingSeries>(NUMBERING_SERIES, {
      pagination: { page: 1, perPage: MAX_PER_PAGE },
      sort: { field: "resource", order: "ASC" },
      meta: companyScope(companyId),
    })
  const retry = () => {
    void refetch()
  }
  const failure = (className: string) => (
    <PageState
      kind={error ? errorStateKind(error) : "offline"}
      headingLevel={headingLevel}
      className={className}
      onRetry={retry}
    />
  )
  if (isPending)
    // Без мережі запит на паузі, помилки немає: інакше скелетон лишився б назавжди.
    return fetchStatus === "paused" ? (
      failure("min-h-40")
    ) : (
      <SectionSkeleton rows={4} />
    )
  // Серії є з кешу, а перечитати не вдалося: незбережене у формі лишається, стан — над нею.
  if (!data) return failure("min-h-40")
  const first = data[0]
  if (!first)
    return (
      <PageState
        kind="empty"
        title={t("numbering.emptyTitle")}
        description={t("numbering.emptyDescription")}
        headingLevel={headingLevel}
        className="min-h-40"
      />
    )
  const current = data.find((item) => item.id === selected.value) ?? first
  const labelOf = (series: NumberingSeries) =>
    labels[series.resource] ?? series.resource
  return (
    <div className="@container grid gap-4">
      {error ? failure("") : null}
      <div className="grid gap-6 @3xl:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
        <SeriesList
          series={data}
          currentId={current.id}
          labelOf={labelOf}
          onSelect={(id) => {
            focusNext.current = true
            selected.onValueChange(id)
          }}
        />
        <section aria-labelledby={headingId} className="grid min-w-0 gap-4">
          <Heading
            ref={heading}
            id={headingId}
            tabIndex={-1}
            className="text-lg font-semibold break-words focus-visible:outline-none"
          >
            {labelOf(current)}
          </Heading>
          {canUpdate ? null : (
            <Alert>
              <AlertDescription>{t("numbering.readOnly")}</AlertDescription>
            </Alert>
          )}
          <NumberingSeriesForm
            key={`${companyId ?? ""}:${current.id}`}
            series={current}
            readOnly={!canUpdate}
          />
        </section>
      </div>
    </div>
  )
}

/** Типи документів: вибрана — `aria-current`; під назвою — шаблон серії. */
function SeriesList({
  series,
  currentId,
  labelOf,
  onSelect,
}: {
  series: readonly NumberingSeries[]
  currentId: string
  labelOf: (series: NumberingSeries) => string
  onSelect: (id: string) => void
}) {
  const t = useErpUiT()
  return (
    <ul className="space-y-1" aria-label={t("numbering.seriesList")}>
      {series.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            aria-current={item.id === currentId ? "true" : undefined}
            className={cn(
              "grid min-h-touch w-full gap-0.5 rounded-md px-3 py-2 text-start text-sm transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              item.id === currentId && "bg-muted font-medium",
            )}
            onClick={() => {
              // Вибрана серія: перехід нічого не змінить, а захист змін спитав би даремно.
              if (item.id !== currentId) onSelect(item.id)
            }}
          >
            <span className="truncate">{labelOf(item)}</span>
            <span className="truncate font-mono text-xs font-normal text-muted-foreground">
              {item.template}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}
