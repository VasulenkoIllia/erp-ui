import * as React from "react"
import { useDataProvider } from "ra-core"
import { toast } from "sonner"

import { ConfirmDialog } from "@/registry/erp/confirm-dialog"
import { tableTabStop } from "@/registry/erp/data-table-selection"
import { TransitionReasonField } from "@/registry/erp/document-action-dialogs"
import { DeniedAction } from "@/registry/erp/permission-gate"
import { useApiErrorMessage } from "@/registry/hooks/use-api-error-message"
import { useMe } from "@/registry/hooks/use-me"
import type { RowSelection } from "@/registry/hooks/use-row-selection"
import { isApiError, type FilterValue } from "@/registry/lib/api"
import { hasPermission } from "@/registry/lib/auth"
import type { ErpDataProvider } from "@/registry/lib/data-provider"
import { useFormat } from "@/registry/lib/format"
import { useErpUiT } from "@/registry/lib/i18n"
import { ACTION_ICONS, type ActionIcon } from "@/registry/lib/icons"
import type { BulkSelection, Job } from "@/registry/lib/jobs"
import { toBulkSelection } from "@/registry/lib/row-selection"
import { Button } from "@/registry/ui/button"

/**
 * Масова дія зі списку фоновою задачею сервера (SPEC §8.1 стани 12–14, ADR-0018, ADR-0066).
 *
 *   const cancel = useBulkAction({ resource, action: "cancel", selection, filter, label, reason: "required", texts })
 *   <ListReport bulk={{ actions: [{ id: "cancel", render: cancel.button }], rowLabel }} … />
 *   {cancel.dialog}
 *
 * - Кнопка панелі вибраного — з правом ролі `<ресурс>:<дія>`; без нього неактивна з причиною (§8.4).
 * - Підтвердження з кількістю й кнопкою-наслідком; дія з причиною — поле причини, одна на всі записи.
 *   Обов'язкова причина порожня — помилка біля поля, задача не починається; відмову сервера щодо
 *   причини (422) теж видно біля поля.
 * - Запуск — `startBulk` (`POST /<ресурс>/bulk/<дія>`), прогрес і підсумок — сповіщення
 *   erp/job-progress поза сторінкою (окремим чанком, прогрів — при відкритті підтвердження), невдачі —
 *   «Подробиці» з причиною кожної групи. Після запуску вибір знімається, фокус — на таблицю.
 */

// Прогрес задачі потрібен лише після запуску (ADR-0009).
const loadJobProgress = () => import("./job-progress")

export interface BulkActionTexts {
  /** Заголовок підтвердження для `count` записів: «Скасувати 3 пропозиції?». */
  title: (count: number, value: string) => string
  /** Наслідок дії під заголовком. */
  description: string
  /** Кнопка-наслідок: «Скасувати 3 пропозиції» (SPEC §8.2). */
  confirm: (count: number, value: string) => string
  /** Чому кнопка неактивна без права ролі. */
  denied: string
  /** Назва задачі в сповіщенні: «Скасування пропозицій». */
  progress: string
  /** Підсумок задачі: «Скасовано 8 з 10, не скасовано: 2»; без нього — текст кіта. */
  summary?: (job: Job) => string
}

export interface BulkActionOptions {
  resource: string
  /** Дія API й права: `POST /<ресурс>/bulk/<дія>`, `<ресурс>:<дія>`. */
  action: string
  /** Вибір списку (`useListReport(...).selection`): після запуску знімається. */
  selection: RowSelection
  /** Фільтр списку (`list.queryFilter`): для вибору «усі за фільтром». */
  filter: Record<string, FilterValue>
  label: string
  icon?: ActionIcon
  /** Основна дія панелі — із заливкою; решта — контуром. */
  variant?: "default" | "outline"
  /** Причина, одна на всі записи: `required` — без неї задача не починається (ADR-0066). */
  reason?: "required" | "optional"
  /** Червона кнопка підтвердження: видалення, скасування. */
  destructive?: boolean
  texts: BulkActionTexts
  /** Причина невдачі за кодом мовою модуля; загальні коди й заборони документа кіт знає сам. */
  failureLabel?: (code: string) => string | undefined
}

export interface BulkAction {
  /** Кнопка панелі вибраного для `count` записів (`ListReportBulkAction.render`). */
  button: (count: number) => React.ReactNode
  /**
   * Підтвердження — на сторінці поруч зі списком, а не в панелі: після запуску вибір знімається,
   * панель зникає, а діалог має закритись і повернути фокус на таблицю.
   */
  dialog: React.ReactNode
}

/** Чим скінчився запуск: задачу прийнято, причину відхилено (код 422) чи інша помилка (сповіщення). */
type StartOutcome = "started" | "failed" | { reasonError: string }

function useStartBulk(options: BulkActionOptions) {
  const t = useErpUiT()
  const errorMessage = useApiErrorMessage()
  const dataProvider = useDataProvider<ErpDataProvider>()
  const { resource, action, texts, failureLabel } = options
  return async (
    target: BulkSelection,
    reason: string | undefined,
  ): Promise<StartOutcome> => {
    const startJob = async () => {
      // Спершу чанк: якщо він не завантажився, задачу не запущено й видно чому.
      const { showJobProgress } = await loadJobProgress()
      const { jobId } = await dataProvider.startBulk(
        resource,
        action,
        target,
        reason === undefined ? undefined : { reason },
      )
      return { showJobProgress, jobId }
    }
    let started: Awaited<ReturnType<typeof startJob>>
    try {
      started = await startJob()
    } catch (error) {
      const reasonError = isApiError(error)
        ? error.fieldErrors?.reason
        : undefined
      if (reasonError) return { reasonError }
      toast.error(t("jobs.failed", { message: errorMessage(error) }))
      return "failed"
    }
    // Поза `try`: задачу вже прийнято, повтор із діалогу запустив би її вдруге.
    started.showJobProgress({
      jobId: started.jobId,
      title: texts.progress,
      summary: texts.summary,
      failureLabel,
    })
    return "started"
  }
}

export function useBulkAction(options: BulkActionOptions): BulkAction {
  const { resource, action, label, icon, variant = "outline", texts } = options
  // Право ролі — як у панелі дій документа: дія лише над своїми теж дає кнопку, решту скаже звіт.
  const { data: me } = useMe()
  const canAccess = hasPermission(me?.permissions ?? [], resource, action)
  const [open, setOpen] = React.useState(false)
  // Кількість лишається в заголовку, поки діалог зникає після запуску. Вибір — знімок у момент
  // кліку: підтверджують саме ці записи, навіть якщо фільтр чи вибір зміниться під діалогом.
  const [target, setTarget] = React.useState<{
    count: number
    selection: BulkSelection
  }>({ count: 0, selection: { ids: [] } })
  const table = React.useRef<Element | null>(null)
  const start = useStartBulk(options)
  const Icon = icon ? ACTION_ICONS[icon] : null
  const content = (
    <>
      {Icon ? <Icon aria-hidden /> : null}
      {label}
    </>
  )
  const button = (selected: number) =>
    canAccess ? (
      <Button
        size="sm"
        variant={variant}
        onClick={(event) => {
          // Лише прогрів чанка: збій покаже запуск задачі.
          loadJobProgress().catch(() => undefined)
          table.current = event.currentTarget.closest(
            '[data-slot="data-table"]',
          )
          setTarget({
            count: selected,
            selection: toBulkSelection(options.selection.state, options.filter),
          })
          setOpen(true)
        }}
      >
        {content}
      </Button>
    ) : (
      <DeniedAction variant={variant} size="sm" reason={texts.denied}>
        {content}
      </DeniedAction>
    )
  const dialog = (
    <BulkActionDialog
      options={options}
      open={open}
      count={target.count}
      onClose={() => {
        setOpen(false)
      }}
      onConfirm={async (reason) => {
        const outcome = await start(target.selection, reason)
        if (outcome === "started") {
          setOpen(false)
          options.selection.clear()
        }
        return outcome
      }}
      returnFocus={() => tableTabStop(table.current)}
    />
  )
  return { button, dialog }
}

function BulkActionDialog({
  options,
  open,
  count,
  onClose,
  onConfirm,
  returnFocus,
}: {
  options: BulkActionOptions
  open: boolean
  count: number
  onClose: () => void
  onConfirm: (reason: string | undefined) => Promise<StartOutcome>
  returnFocus: () => HTMLElement | null
}) {
  const t = useErpUiT()
  const format = useFormat()
  const fieldRef = React.useRef<HTMLTextAreaElement>(null)
  const [reason, setReason] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  // Кожне відкриття — з порожнього поля.
  const [wasOpen, setWasOpen] = React.useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setReason("")
      setError(null)
    }
  }
  const { texts, destructive } = options
  const value = format.number(count)
  const fail = (message: string) => {
    setError(message)
    fieldRef.current?.focus()
  }
  const confirm = async () => {
    const text = reason.trim()
    if (options.reason === "required" && !text)
      return fail(t("documentActions.reasonRequired"))
    const outcome = await onConfirm(options.reason && text ? text : undefined)
    if (typeof outcome === "object")
      fail(
        outcome.reasonError === "required"
          ? t("documentActions.reasonRequired")
          : t("apiErrors.validation"),
      )
  }
  return (
    <ConfirmDialog
      open={open}
      title={texts.title(count, value)}
      description={texts.description}
      confirmLabel={texts.confirm(count, value)}
      destructive={destructive}
      cancelLabel={t("documentActions.keep")}
      onClose={onClose}
      onConfirm={confirm}
      returnFocus={returnFocus}
      lockWhileBusy
      body={
        options.reason ? (
          <TransitionReasonField
            ref={fieldRef}
            reason={options.reason}
            value={reason}
            error={error}
            onChange={(next) => {
              setReason(next)
              setError(null)
            }}
          />
        ) : null
      }
    />
  )
}
