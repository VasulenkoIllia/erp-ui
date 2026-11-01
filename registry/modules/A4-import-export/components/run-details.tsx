import { useGetOne } from "ra-core"
import type { RefObject } from "react"

import { StatusBadge } from "@/components/erp/status-badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { useImportErrorText } from "@/hooks/use-import-downloads"
import { useFormat } from "@/lib/format"
import type { JobFailureGroup } from "@/lib/jobs"

import { IMPORT_RUNS, type ImportRun } from "../contract"
import { useImportExportT } from "../use-import-export-t"
import { useImportExportTargets } from "../use-targets"
import { useRunStatus, useRunTargetLabel } from "./run-columns"

const COUNTS = ["total", "created", "updated", "skipped", "failed"] as const

function RunFailure({
  failure,
  text,
}: {
  failure: JobFailureGroup
  text: string
}) {
  const t = useImportExportT()
  const format = useFormat()
  const rows = failure.items.map((item) => item.id).join(", ")
  const hidden = failure.count - failure.items.length
  return (
    <li className="rounded-lg border p-3">
      <p className="font-medium break-words first-letter:uppercase">{text}</p>
      <p className="text-sm text-muted-foreground">
        {t("history.details.failureCount", {
          count: failure.count,
          value: format.number(failure.count),
        })}
      </p>
      {rows ? (
        <p className="text-sm break-words">
          {hidden > 0
            ? t("history.details.rowsMore", {
                rows,
                value: format.number(hidden),
              })
            : t("history.details.rows", { rows })}
        </p>
      ) : null}
    </li>
  )
}

/**
 * Подробиці запуску: лічильники й причини невдач. Файла запуску сервер не зберігає, тож файл помилок
 * доступний лише в майстрі: тут видно номери рядків, а виправлений файл людина завантажує знову.
 * Рядок списку — лише перший показ: запуск міг іти, тож свіжий запис береться окремо. Кеш запису тут не
 * годиться: `useGetList` кладе туди рядки й залишає старий, навіть якщо список уже новіший.
 */
export function RunDetails({
  run: listed,
  open,
  onOpenChange,
  finalFocus,
}: {
  run: ImportRun
  open: boolean
  onOpenChange: (open: boolean) => void
  finalFocus: RefObject<HTMLElement | null>
}) {
  const t = useImportExportT()
  const format = useFormat()
  const fresh = useGetOne<ImportRun>(
    IMPORT_RUNS,
    { id: listed.id },
    { refetchOnMount: "always" },
  )
  const run = fresh.isFetchedAfterMount && fresh.isSuccess ? fresh.data : listed
  const statusOf = useRunStatus()
  const labelOf = useRunTargetLabel()
  const target = useImportExportTargets().find(
    (item) => item.resource === run.target,
  )
  const errorText = useImportErrorText(
    target ?? { resource: run.target, label: run.target, fields: [] },
  )
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className="data-[side=right]:w-full data-[side=right]:sm:max-w-md"
        finalFocus={finalFocus}
      >
        <SheetHeader className="pe-12">
          <SheetTitle className="break-words">
            {run.fileName || t("history.noFile")}
          </SheetTitle>
          <SheetDescription>
            {t("history.details.subtitle", {
              target: labelOf(run.target),
              name: run.startedByName,
              date: format.date(run.startedAt, "dateTime"),
            })}
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          <StatusBadge status={statusOf(run.status)} />
          {run.status === "failed" ? (
            <Alert variant="destructive">
              <AlertDescription>{t("history.details.failed")}</AlertDescription>
            </Alert>
          ) : null}
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
            {COUNTS.map((key) => (
              <div key={key} className="contents">
                <dt className="text-muted-foreground">
                  {t(`history.details.counts.${key}`)}
                </dt>
                <dd className="text-end tabular-nums">
                  {format.number(run[key])}
                </dd>
              </div>
            ))}
          </dl>
          {run.failures.length ? (
            <section className="space-y-2">
              <h3 className="font-medium">{t("history.details.failures")}</h3>
              <ul className="space-y-2">
                {run.failures.map((failure) => (
                  <RunFailure
                    key={failure.code}
                    failure={failure}
                    text={errorText({ code: failure.code })}
                  />
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  )
}
