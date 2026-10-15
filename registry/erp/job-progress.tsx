"use client"

import * as React from "react"
import { CircleCheckIcon, TriangleAlertIcon } from "lucide-react"
import { useDataProvider } from "ra-core"
import { toast } from "sonner"

import { JobFailuresDialog, mergeFailures } from "@/registry/erp/job-failures"
import { useApiErrorMessage } from "@/registry/hooks/use-api-error-message"
import {
  isJobPollFailing,
  isJobStatusLost,
  useJob,
} from "@/registry/hooks/use-job"
import { isKnownApiErrorCode } from "@/registry/lib/api"
import type { ErpDataProvider } from "@/registry/lib/data-provider"
import { useFormat } from "@/registry/lib/format"
import { useErpUiT } from "@/registry/lib/i18n"
import {
  isJobActive,
  retryableCount,
  type Job,
  type JobFailureGroup,
} from "@/registry/lib/jobs"
import { Button } from "@/registry/ui/button"
import { Progress } from "@/registry/ui/progress"
import { Spinner } from "@/registry/ui/spinner"

/**
 * Прогрес масової дії фоновою задачею сервера (SPEC §8.1 стани 13–14, §8.2; ADR-0018).
 *
 *   const { jobId } = await dataProvider.startBulk("invoices", "approve", selection)
 *   showJobProgress({ jobId, title: t("approving"), summary, failureLabel })
 *
 * - Сповіщення живе в оболонці (`Toaster`), а не на сторінці: можна піти зі сторінки, прогрес і
 *   опитування лишаються. Поки задача йде, сповіщення не закривається.
 * - Прогрес-бар і «340 з 1 200» (понад 10 с людина працює далі, §8.2). Число — для очей: скрінрідер
 *   не чує його щосекунди (воно в `aria-valuetext` прогрес-бару), а чує підсумок — новий текст у
 *   live-регіоні сповіщень.
 * - Без невдач — підсумок, сповіщення зникає само. З невдачами — «Подробиці» (причини групами з
 *   кількістю й першими записами) і «Повторити (N)» для тих, що можна повторити; сповіщення чекає.
 * - Опитування не вдалося (офлайн, сервер мовчить) — «перевіряємо знову», опитування триває
 *   (hooks/use-job, `isJobPollFailing`). Стан не дізнатись (задачі немає, сесія скінчилась) —
 *   причина, і сповіщення можна закрити.
 * - Повтор показує нову задачу в тому самому сповіщенні, і фокус лишається в ньому: кнопка, з якої
 *   повторили, зникає (WCAG 2.4.3). Невдачі, яких повтор не бере, лишаються в «Подробицях».
 */
export interface JobProgressOptions {
  jobId: string
  /** Що відбувається: «Погодження рахунків». */
  title: string
  /** Підсумок після завершення: «Погоджено 1 150 з 1 200 рахунків». */
  summary?: (job: Job) => string
  /** Причина невдачі за кодом модуля (`invalid_status`); загальні коди API кіт знає сам. */
  failureLabel?: (code: string) => string | undefined
  /**
   * Задача завершилась (зокрема з невдачами) чи її стан не дізнатись; після повтору — знову. Напр.,
   * щоб знову ввімкнути дію, яку вимкнули на час задачі.
   */
  onSettled?: () => void
}

/** Сповіщення без невдач зникає само, як і будь-яке без дій (SPEC §8.2). */
const DONE_TOAST_MS = 8000

export function showJobProgress(options: JobProgressOptions): void {
  renderJobToast(options, options.jobId)
}

interface ToastState {
  finished?: boolean
  failed?: boolean
  focus?: boolean
  /** Невдачі попередніх задач, яких повтор не бере: лишаються в «Подробицях». */
  carried?: JobFailureGroup[]
}

/** Сповіщення задачі; `toastId` — те саме для повтору, щоб нова задача стала на місце старої. */
function renderJobToast(
  options: JobProgressOptions,
  toastId: string,
  {
    finished = false,
    failed = false,
    focus = false,
    carried = [],
  }: ToastState = {},
) {
  toast(
    <JobToast {...options} toastId={toastId} focus={focus} carried={carried} />,
    {
      id: toastId,
      // Без невдач зникає само; з невдачами чи поки йде — чекає на людину.
      duration: finished && !failed ? DONE_TOAST_MS : Number.POSITIVE_INFINITY,
      closeButton: finished,
      dismissible: finished,
    },
  )
}

/** Текст причини невдачі мовою інтерфейсу. */
function useReason(failureLabel: JobProgressOptions["failureLabel"]) {
  const t = useErpUiT()
  return (code: string) =>
    failureLabel?.(code) ??
    (isKnownApiErrorCode(code)
      ? t(`apiErrors.${code}`)
      : t("jobs.unknownReason", { code }))
}

/**
 * Фокус пішов у діалог «Подробиці» (портал поза областю сповіщень): sonner, коли фокус виходить з
 * області, повертає його на елемент, з якого в неї зайшли. Тут не треба — діалог тримає фокус сам.
 */
const keepFocusInDialog = (event: React.FocusEvent) => {
  const next = event.relatedTarget
  if (next instanceof Element && next.closest('[role="dialog"]'))
    event.stopPropagation()
}

function JobToast({
  toastId,
  focus,
  carried,
  ...options
}: JobProgressOptions & {
  toastId: string
  focus: boolean
  carried: JobFailureGroup[]
}) {
  const { jobId, title } = options
  const query = useJob(jobId)
  const { data: job, error } = query
  const finished = job && !isJobActive(job) ? job : null
  const lost = error && isJobStatusLost(error) ? error : null
  const isSettled = finished !== null || lost !== null
  const ref = React.useRef<HTMLDivElement>(null)
  const titleId = React.useId()

  // Завершилась чи стан не дізнатись — сповіщення можна закрити; без невдач воно ще й зникне само.
  const settle = React.useEffectEvent(() => {
    renderJobToast(options, toastId, {
      finished: true,
      failed:
        lost !== null ||
        carried.length > 0 ||
        Boolean(finished && (finished.failed || finished.status === "failed")),
      carried,
    })
    options.onSettled?.()
  })
  React.useEffect(() => {
    if (isSettled) settle()
  }, [isSettled])
  // Повтор із цього сповіщення: фокус — на нього, а не в нікуди.
  React.useLayoutEffect(() => {
    if (focus) ref.current?.focus()
  }, [focus, jobId])

  const retry = (next: string, from: Job) => {
    renderJobToast({ ...options, jobId: next }, toastId, {
      focus: true,
      carried: [
        ...carried,
        ...from.failures.filter((group) => !group.retryable),
      ],
    })
  }
  return (
    // Група з назвою: після повтору фокус тут, і скрінрідер чує, куди потрапив.
    <div
      ref={ref}
      role="group"
      aria-labelledby={titleId}
      tabIndex={-1}
      data-slot="job-progress"
      className="grid w-full gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <p id={titleId} className="font-medium">
        {title}
      </p>
      {lost ? (
        <JobLost error={lost} />
      ) : finished ? (
        <JobResult
          job={finished}
          carried={carried}
          onRetried={retry}
          {...options}
        />
      ) : (
        <JobRunning
          job={job}
          title={title}
          pollFailed={isJobPollFailing(query)}
        />
      )}
    </div>
  )
}

function JobRunning({
  job,
  title,
  pollFailed,
}: {
  job: Job | undefined
  title: string
  pollFailed: boolean
}) {
  const t = useErpUiT()
  const format = useFormat()
  const started = job && job.status !== "queued"
  const progress = started
    ? t("jobs.progress", {
        done: format.number(job.processed),
        total: format.number(job.total),
      })
    : t("jobs.queued")
  return (
    <>
      <Progress
        aria-label={title}
        value={started && job.total ? (job.processed / job.total) * 100 : null}
        getAriaValueText={() => progress}
      />
      <span aria-hidden className="text-sm text-muted-foreground tabular-nums">
        {progress}
      </span>
      {pollFailed ? (
        <p className="text-sm text-warning-foreground">
          {t("jobs.pollFailed")}
        </p>
      ) : null}
    </>
  )
}

/** Стан задачі не дізнатись: причина; задача могла завершитись — список варто перечитати. */
function JobLost({ error }: { error: unknown }) {
  const t = useErpUiT()
  const errorMessage = useApiErrorMessage()
  return (
    <p className="flex items-start gap-2 text-sm text-destructive-foreground">
      <TriangleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
      {t("jobs.statusLost", { message: errorMessage(error) })}
    </p>
  )
}

function JobResult({
  job,
  carried,
  onRetried,
  ...options
}: JobProgressOptions & {
  job: Job
  carried: JobFailureGroup[]
  onRetried: (jobId: string, from: Job) => void
}) {
  const t = useErpUiT()
  const format = useFormat()
  const reason = useReason(options.failureLabel)
  const retry = useRetry(job, onRetried)
  const [details, setDetails] = React.useState(false)
  const failures = mergeFailures([...job.failures, ...carried])
  if (job.status === "failed")
    return (
      <p className="flex items-start gap-2 text-sm text-destructive-foreground">
        <TriangleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
        {t("jobs.failed", { message: reason(job.error?.code ?? "server") })}
      </p>
    )
  const text =
    options.summary?.(job) ??
    (job.failed
      ? t("jobs.partial", {
          done: format.number(job.succeeded),
          total: format.number(job.total),
          failed: format.number(job.failed),
        })
      : t("jobs.done", { value: format.number(job.succeeded) }))
  const Icon = failures.length ? TriangleAlertIcon : CircleCheckIcon
  return (
    <>
      <p className="flex items-start gap-2 text-sm">
        <Icon
          aria-hidden
          className={
            failures.length
              ? "mt-0.5 size-4 shrink-0 text-warning-foreground"
              : "mt-0.5 size-4 shrink-0 text-success-foreground"
          }
        />
        {text}
      </p>
      {failures.length ? (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setDetails(true)
            }}
            onBlur={keepFocusInDialog}
          >
            {t("jobs.details")}
          </Button>
          {retry.button}
        </div>
      ) : null}
      {details ? (
        <JobFailuresDialog
          failures={failures}
          title={options.title}
          reason={reason}
          retry={retry.button}
          onClose={() => {
            setDetails(false)
          }}
        />
      ) : null}
    </>
  )
}

/** «Повторити (N)»: нова задача для невдач, які можна повторити. */
function useRetry(job: Job, onRetried: (jobId: string, from: Job) => void) {
  const t = useErpUiT()
  const format = useFormat()
  const errorMessage = useApiErrorMessage()
  const dataProvider = useDataProvider<ErpDataProvider>()
  const [busy, setBusy] = React.useState(false)
  const count = retryableCount(job)
  const run = async () => {
    setBusy(true)
    let jobId: string
    try {
      ;({ jobId } = await dataProvider.retryJob(job.id))
    } catch (error) {
      toast.error(t("jobs.retryFailed", { message: errorMessage(error) }))
      setBusy(false)
      return
    }
    onRetried(jobId, job)
  }
  return {
    button: count ? (
      <Button
        size="sm"
        disabled={busy}
        focusableWhenDisabled
        aria-busy={busy || undefined}
        onClick={() => {
          void run()
        }}
      >
        {busy ? <Spinner aria-hidden /> : null}
        {t("jobs.retry", { value: format.number(count) })}
      </Button>
    ) : null,
  }
}
