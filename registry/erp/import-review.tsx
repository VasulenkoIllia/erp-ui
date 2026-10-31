import * as React from "react"
import { DownloadIcon } from "lucide-react"

import { JobLost, JobResult, JobRunning } from "@/registry/erp/job-progress"
import {
  isJobPollFailing,
  isJobStatusLost,
  useJob,
} from "@/registry/hooks/use-job"
import type { ImportWizardApi } from "@/registry/hooks/use-import-wizard"
import { useFormat } from "@/registry/lib/format"
import { useErpUiT } from "@/registry/lib/i18n"
import { fieldValueText, type CheckedRow } from "@/registry/lib/import-rows"
import {
  isJobActive,
  type Job,
  type JobFailureGroup,
} from "@/registry/lib/jobs"
import { Alert, AlertDescription } from "@/registry/ui/alert"
import { Badge } from "@/registry/ui/badge"
import { Button } from "@/registry/ui/button"

/**
 * Кроки майстра імпорту після перевірки (PF07, ADR-0049): підсумок із помилками, перегляд перших
 * записів і звіт фонової задачі. Стан — `hooks/use-import-wizard`.
 *
 * Звіт бере частини `erp/job-progress` на сторінці, а не в сповіщенні: людина вже тут, а прогрес,
 * збій опитування, причини невдач і повтор працюють так само.
 */

/** Скільки рядків із помилками видно на сторінці: решта у файлі помилок. */
const SHOWN_ERROR_ROWS = 50
/** Скільки записів показує перегляд. */
const PREVIEW_ROWS = 5

const ACTION_COUNTS = ["create", "update", "skip", "invalid"] as const

export function ImportCheckStep({ api }: { api: ImportWizardApi }) {
  const t = useErpUiT()
  const format = useFormat()
  const { counts, state, errorText } = api
  const invalid = state.checked.filter(({ action }) => action === "invalid")
  const hidden = invalid.length - SHOWN_ERROR_ROWS
  return (
    <div className="@container space-y-4">
      <dl className="grid grid-cols-2 gap-3 @lg:grid-cols-4">
        {ACTION_COUNTS.map((action) => (
          <div key={action} className="rounded-lg border p-3">
            <dt className="text-sm text-muted-foreground">
              {t(`importWizard.check.${action}`)}
            </dt>
            <dd className="text-2xl font-semibold tabular-nums">
              {format.number(counts[action])}
            </dd>
          </div>
        ))}
      </dl>
      {counts.create + counts.update === 0 ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{t("importWizard.check.nothing")}</AlertDescription>
        </Alert>
      ) : invalid.length ? (
        <Alert>
          <AlertDescription>
            {t("importWizard.check.invalidNote")}
          </AlertDescription>
        </Alert>
      ) : (
        <p className="text-sm text-muted-foreground">
          {t("importWizard.check.allGood")}
        </p>
      )}
      {invalid.length ? (
        <>
          <ul className="divide-y rounded-lg border text-sm">
            {invalid.slice(0, SHOWN_ERROR_ROWS).map(({ row, errors }) => (
              <li key={row} className="grid gap-1 p-3">
                <span className="font-medium">
                  {t("importWizard.check.row", { row })}
                </span>
                <span className="break-words">
                  {errors.map(errorText).join("; ")}
                </span>
              </li>
            ))}
          </ul>
          {hidden > 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("importWizard.check.more", { count: format.number(hidden) })}
            </p>
          ) : null}
          <ImportErrorsButton api={api} />
        </>
      ) : null}
    </div>
  )
}

function ImportErrorsButton({ api }: { api: ImportWizardApi }) {
  const t = useErpUiT()
  return (
    <Button type="button" variant="outline" onClick={api.downloadErrors}>
      <DownloadIcon aria-hidden />
      {t("importWizard.check.download")}
    </Button>
  )
}

export function ImportPreviewStep({ api }: { api: ImportWizardApi }) {
  const t = useErpUiT()
  const format = useFormat()
  const records = api.state.checked.filter(
    ({ action }) => action === "create" || action === "update",
  )
  const shown = records.slice(0, PREVIEW_ROWS)
  return (
    <div className="@container space-y-3">
      <p className="text-sm text-muted-foreground">
        {t("importWizard.preview.shown", {
          shown: format.number(shown.length),
          total: format.number(records.length),
        })}
      </p>
      <ul className="grid gap-3 @2xl:grid-cols-2">
        {shown.map((record) => (
          <ImportPreviewCard key={record.row} api={api} record={record} />
        ))}
      </ul>
    </div>
  )
}

function ImportPreviewCard({
  api,
  record,
}: {
  api: ImportWizardApi
  record: CheckedRow
}) {
  const t = useErpUiT()
  const format = useFormat()
  const text = {
    yes: t("importWizard.yes"),
    no: t("importWizard.no"),
    number: (value: number) => format.number(value),
    date: (value: string) => format.date(value, "date"),
  }
  const fields = api.target.fields.filter(
    (field) => record.values?.[field.key] !== undefined,
  )
  return (
    <li className="min-w-0 space-y-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground">
          {t("importWizard.check.row", { row: record.row })}
        </span>
        <Badge variant={record.action === "update" ? "secondary" : "outline"}>
          {t(
            record.action === "update"
              ? "importWizard.actions.update"
              : "importWizard.actions.create",
          )}
        </Badge>
      </div>
      <dl className="grid gap-1 text-sm">
        {fields.map((field) => (
          <div key={field.key} className="grid min-w-0 gap-x-2 @lg:grid-cols-2">
            <dt className="text-muted-foreground">{field.label}</dt>
            <dd className="min-w-0 break-words">
              {fieldValueText(field, record.values?.[field.key], text)}
            </dd>
          </div>
        ))}
      </dl>
    </li>
  )
}

interface ReportRun {
  readonly jobId: string
  /** Невдачі попередніх задач, яких повтор не бере. */
  readonly carried: readonly JobFailureGroup[]
  /** Лічильники задач до цього повтору. */
  readonly earlier: NonNullable<Job["outcomes"]>
}

const NO_OUTCOMES = { created: 0, updated: 0, skipped: 0 }

export function ImportReportStep({ api }: { api: ImportWizardApi }) {
  const t = useErpUiT()
  const format = useFormat()
  const { state, counts, target } = api
  const [run, setRun] = React.useState<ReportRun>({
    jobId: state.jobId ?? "",
    carried: [],
    earlier: NO_OUTCOMES,
  })
  const query = useJob(run.jobId)
  const { data: job, error } = query
  const finished = job && !isJobActive(job) ? job : null
  const lost = error && isJobStatusLost(error) ? error : null
  const title = t("importWizard.report.title", { target: target.label })
  const carriedFailed = run.carried.reduce((sum, { count }) => sum + count, 0)
  const summary = (done: Job) => {
    const outcomes = done.outcomes ?? NO_OUTCOMES
    const failed = done.failed + carriedFailed
    const values = {
      created: format.number(run.earlier.created + outcomes.created),
      updated: format.number(run.earlier.updated + outcomes.updated),
      skipped: format.number(run.earlier.skipped + outcomes.skipped),
    }
    return failed
      ? t("importWizard.report.partial", {
          ...values,
          failed: format.number(failed),
        })
      : t("importWizard.report.summary", values)
  }
  return (
    <div className="space-y-4">
      <div data-slot="import-report" className="rounded-lg border p-3">
        {lost || finished ? null : (
          <div className="grid gap-2">
            <JobRunning
              job={job}
              title={title}
              pollFailed={isJobPollFailing(query)}
            />
          </div>
        )}
        {/* Стоїть на сторінці від початку, інакше скрінрідер не оголосить підсумок; прогрес поза ним. */}
        <div role="status" className="grid gap-2">
          {lost ? <JobLost error={lost} /> : null}
          {finished && !lost ? (
            <JobResult
              jobId={run.jobId}
              job={finished}
              title={title}
              carried={[...run.carried]}
              // Сервер без лічильників: загальний текст задачі кращий за «створено 0».
              summary={finished.outcomes ? summary : undefined}
              failureLabel={target.errorLabel}
              onRetried={(jobId, from) => {
                setRun({
                  jobId,
                  carried: [
                    ...run.carried,
                    ...from.failures.filter((group) => !group.retryable),
                  ],
                  earlier: {
                    created:
                      run.earlier.created + (from.outcomes?.created ?? 0),
                    updated:
                      run.earlier.updated + (from.outcomes?.updated ?? 0),
                    skipped:
                      run.earlier.skipped + (from.outcomes?.skipped ?? 0),
                  },
                })
              }}
            />
          ) : null}
        </div>
      </div>
      {counts.invalid ? (
        <div className="space-y-2">
          <p className="text-sm">
            {t("importWizard.report.skippedInvalid", {
              count: format.number(counts.invalid),
            })}
          </p>
          <ImportErrorsButton api={api} />
        </div>
      ) : null}
    </div>
  )
}
