import { useCanAccess, useDataProvider } from "ra-core"
import { useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { ConfirmDialog } from "@/registry/erp/confirm-dialog"
import { tableTabStop } from "@/registry/erp/data-table-selection"
import { useApiErrorMessage } from "@/registry/hooks/use-api-error-message"
import type { RowSelection } from "@/registry/hooks/use-row-selection"
import type { FilterValue } from "@/registry/lib/api"
import type { ErpDataProvider } from "@/registry/lib/data-provider"
import { useFormat } from "@/registry/lib/format"
import { ACTION_ICONS } from "@/registry/lib/icons"
import type { Job } from "@/registry/lib/jobs"
import { toBulkSelection } from "@/registry/lib/row-selection"
import { Button } from "@/registry/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/registry/ui/tooltip"

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
  const errorMessage = useApiErrorMessage()
  const dataProvider = useDataProvider<ErpDataProvider>()
  const { canAccess } = useCanAccess({ resource: RESOURCE, action: "approve" })
  const [open, setOpen] = useState(false)
  // Кількість лишається в заголовку, поки діалог зникає після запуску.
  const [count, setCount] = useState(0)
  const table = useRef<Element | null>(null)

  const start = async () => {
    // Спершу чанк: якщо він не завантажився, задачу не запущено й видно чому.
    const { showJobProgress } = await loadJobProgress()
    const { jobId } = await dataProvider.startBulk(
      RESOURCE,
      "approve",
      toBulkSelection(selection.state, filter),
    )
    return { showJobProgress, jobId }
  }

  const approve = async () => {
    const started = await start().catch((error: unknown) => {
      toast.error(t("startFailed", { message: errorMessage(error) }))
      return null
    })
    if (!started) return
    // Задачу прийнято: далі лише показ, тож повторне «Погодити» її не дублює.
    const { showJobProgress, jobId } = started
    setOpen(false)
    selection.clear()
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
    })
  }

  const Icon = ACTION_ICONS.approve
  const button = (selected: number) =>
    canAccess === true ? (
      <Button
        size="sm"
        onClick={(event) => {
          // Прогрів; збій покаже запуск задачі.
          loadJobProgress().catch(() => undefined)
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
      // SPEC §8.4: дія без права — неактивна, але у фокусі й пояснює причину.
      <Tooltip>
        <TooltipTrigger
          render={<Button size="sm" disabled focusableWhenDisabled />}
        >
          <Icon aria-hidden />
          {t("button")}
        </TooltipTrigger>
        <TooltipContent>{t("hint")}</TooltipContent>
      </Tooltip>
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
