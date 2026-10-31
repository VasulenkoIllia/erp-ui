import { useMemo } from "react"

import { StatusBadge } from "@/components/erp/status-badge"
import { Button } from "@/components/ui/button"
import type { DataTableColumn } from "@/lib/data-table-core"
import { useFormat } from "@/lib/format"
import type { StatusTone } from "@/lib/statuses"

import type { ImportRun, ImportRunStatus } from "../contract"
import type { ImportRunColumnId } from "../extension"
import { useImportExportT } from "../use-import-export-t"
import { useImportExportTargets } from "../use-targets"

export const RUN_STATUS_TONES = {
  running: "info",
  done: "success",
  partial: "warning",
  failed: "destructive",
} as const satisfies Record<ImportRunStatus, StatusTone>

type RunColumn = DataTableColumn<ImportRun> & { id: ImportRunColumnId }

/** Перші, хто поступається місцем: обидва значення є в подробицях запуску. */
const SPARE_COLUMN_PRIORITY = 10
/** Помилки важливіші за решту лічильників: через них людина й відкриває історію. */
const COUNT_COLUMNS = [
  { id: "created" },
  { id: "updated", priority: SPARE_COLUMN_PRIORITY },
  { id: "skipped", priority: SPARE_COLUMN_PRIORITY },
  { id: "failed", priority: 3 },
] as const

/** Статус запуску мовою інтерфейсу: той самий бейдж у таблиці й подробицях. */
export function useRunStatus() {
  const t = useImportExportT()
  return useMemo(
    () => (status: ImportRunStatus) => ({
      id: status,
      label: t(`history.status.${status}`),
      tone: RUN_STATUS_TONES[status],
    }),
    [t],
  )
}

/** Підпис цілі; ціль могли сховати, а запуск лишився в історії: тоді ресурс як є. */
export function useRunTargetLabel() {
  const targets = useImportExportTargets()
  return useMemo(
    () => (target: string) =>
      targets.find((item) => item.resource === target)?.label ?? target,
    [targets],
  )
}

/** Колонки історії: файл відкриває подробиці, лічильники на телефоні лишаються полями картки. */
export function useRunColumns(onOpen: (run: ImportRun) => void) {
  const t = useImportExportT()
  const format = useFormat()
  const statusOf = useRunStatus()
  const labelOf = useRunTargetLabel()
  return useMemo((): readonly RunColumn[] => {
    const fileName: RunColumn = {
      id: "fileName",
      header: t("history.columns.fileName"),
      cell: (run) => (
        <Button
          variant="link"
          className="h-auto min-h-7 px-0 font-medium whitespace-normal"
          aria-label={t("history.open", {
            name: run.fileName || t("history.noFile"),
          })}
          onClick={() => {
            onOpen(run)
          }}
        >
          {run.fileName || t("history.noFile")}
        </Button>
      ),
      card: "title",
      minWidth: 10,
      grow: 2,
    }
    const counts = COUNT_COLUMNS.map(({ id, ...rest }): RunColumn => ({
      ...rest,
      id,
      header: t(`history.columns.${id}`),
      cell: (run) => (
        <span className="tabular-nums">{format.number(run[id])}</span>
      ),
      align: "end",
      minWidth: 6.5,
      grow: 0,
    }))
    return [
      fileName,
      {
        id: "target",
        header: t("history.columns.target"),
        cell: (run) => labelOf(run.target),
        card: "subtitle",
        minWidth: 8,
      },
      {
        id: "status",
        header: t("history.columns.status"),
        cell: (run) => <StatusBadge status={statusOf(run.status)} />,
        card: "badge",
        minWidth: 8,
        grow: 0,
      },
      {
        id: "startedAt",
        header: t("history.columns.startedAt"),
        cell: (run) => format.date(run.startedAt, "dateTime"),
        sortField: "startedAt",
        firstSortOrder: "DESC",
        minWidth: 9.5,
        grow: 0,
      },
      {
        id: "startedBy",
        header: t("history.columns.startedBy"),
        cell: (run) => run.startedByName,
        minWidth: 8,
      },
      ...counts,
    ]
  }, [t, format, statusOf, labelOf, onOpen])
}
