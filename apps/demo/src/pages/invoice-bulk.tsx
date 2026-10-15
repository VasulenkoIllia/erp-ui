import { useCanAccess, useDataProvider } from "ra-core"
import { useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { ConfirmDialog } from "@/registry/erp/confirm-dialog"
import { tableTabStop } from "@/registry/erp/data-table-selection"
import { DeniedAction } from "@/registry/erp/permission-gate"
import { useApiErrorMessage } from "@/registry/hooks/use-api-error-message"
import type { RowSelection } from "@/registry/hooks/use-row-selection"
import type { FilterValue } from "@/registry/lib/api"
import type { ErpDataProvider } from "@/registry/lib/data-provider"
import { useFormat } from "@/registry/lib/format"
import { ACTION_ICONS } from "@/registry/lib/icons"
import type { BulkSelection, Job } from "@/registry/lib/jobs"
import { toBulkSelection } from "@/registry/lib/row-selection"
import { Button } from "@/registry/ui/button"

/**
 * Масове погодження рахунків стрес-сторінки (SPEC §8.1 стани 12–14, ADR-0018): підтвердження з
 * кількістю, фонова задача сервера `POST /invoices/bulk/approve`, прогрес і підсумок у сповіщенні
 * (erp/job-progress), яке живе поза сторінкою.
 */

const RESOURCE = "invoices"
const REASONS = ["invalid_status", "approval_limit", "locked"] as const
const isReason = (code: string): code is (typeof REASONS)[number] =>
  (REASONS as readonly string[]).includes(code)

// Прогрес задачі потрібен лише після запуску: окремим чанком, прогрів — при відкритті підтвердження
// (ADR-0009).
const loadJobProgress = () => import("@/registry/erp/job-progress")

const useApproveT = () =>
  useTranslation("demo", { keyPrefix: "dataPage.approve" }).t

/**
 * Запуск задачі погодження й сповіщення з прогресом — для панелі вибраного й картки рахунку.
 * Повертає, чи задачу прийнято: тоді повторне «Погодити» її не дублює.
 */
export function useStartApproval() {
  const t = useApproveT()
  const format = useFormat()
  const errorMessage = useApiErrorMessage()
  const dataProvider = useDataProvider<ErpDataProvider>()

  const start = async (target: BulkSelection) => {
    // Спершу чанк: якщо він не завантажився, задачу не запущено й видно чому.
    const { showJobProgress } = await loadJobProgress()
    const { jobId } = await dataProvider.startBulk(RESOURCE, "approve", target)
    return { showJobProgress, jobId }
  }

  /** `onSettled` — задача завершилась (дію, вимкнену на час задачі, можна ввімкнути). */
  return async (
    target: BulkSelection,
    { onSettled }: { onSettled?: () => void } = {},
  ): Promise<boolean> => {
    const started = await start(target).catch((error: unknown) => {
      toast.error(t("startFailed", { message: errorMessage(error) }))
      return null
    })
    if (!started) return false
    const { showJobProgress, jobId } = started
    showJobProgress({
      jobId,
      title: t("progress"),
      summary: (job: Job) =>
        job.failed
          ? t("partial", {
              done: format.number(job.succeeded),
              total: format.number(job.total),
              failed: format.number(job.failed),
            })
          : t("done", { value: format.number(job.succeeded) }),
      failureLabel: (code) =>
        isReason(code) ? t(`reasons.${code}`) : undefined,
      onSettled,
    })
    return true
  }
}

/** Прогрів чанка прогресу при відкритті підтвердження; збій покаже запуск задачі. */
export function preloadJobProgress() {
  loadJobProgress().catch(() => undefined)
}

/**
 * Кнопка «Погодити» для панелі вибраного й діалог підтвердження. Діалог — на сторінці, а не в
 * панелі: після запуску вибір знімається, панель зникає, а діалог має закритись і повернути фокус
 * на таблицю.
 */
export function useApproveAction(
  selection: RowSelection,
  /** Фільтр списку: для вибору «усі за фільтром». */
  filter: Record<string, FilterValue>,
) {
  const t = useApproveT()
  const format = useFormat()
  const startApproval = useStartApproval()
  const { canAccess } = useCanAccess({ resource: RESOURCE, action: "approve" })
  const [open, setOpen] = useState(false)
  // Кількість лишається в заголовку, поки діалог зникає після запуску.
  const [count, setCount] = useState(0)
  const table = useRef<Element | null>(null)

  const approve = async () => {
    const started = await startApproval(
      toBulkSelection(selection.state, filter),
    )
    if (!started) return
    setOpen(false)
    selection.clear()
  }

  const Icon = ACTION_ICONS.approve
  const button = (selected: number) =>
    canAccess === true ? (
      <Button
        size="sm"
        onClick={(event) => {
          preloadJobProgress()
          table.current = event.currentTarget.closest(
            '[data-slot="data-table"]',
          )
          setCount(selected)
          setOpen(true)
        }}
      >
        <Icon aria-hidden />
        {t("button")}
      </Button>
    ) : (
      <DeniedAction variant="default" size="sm" reason={t("hint")}>
        <Icon aria-hidden />
        {t("button")}
      </DeniedAction>
    )

  const value = format.number(count)
  const dialog = (
    <ConfirmDialog
      open={open}
      title={t("title", { count, value })}
      description={t("description")}
      confirmLabel={t("confirm", { count, value })}
      onClose={() => {
        setOpen(false)
      }}
      onConfirm={approve}
      returnFocus={() => tableTabStop(table.current)}
    />
  )
  return { button, dialog }
}
