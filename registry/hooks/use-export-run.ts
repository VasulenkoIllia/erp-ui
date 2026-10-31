import * as React from "react"
import type { RaRecord } from "ra-core"
import { useDataProvider } from "ra-core"
import { toast } from "sonner"

import { useApiErrorMessage } from "@/registry/hooks/use-api-error-message"
import {
  isApiError,
  type FilterValue,
  type SortField,
} from "@/registry/lib/api"
import type { ErpDataProvider } from "@/registry/lib/data-provider"
import {
  collectRecords,
  ExportIncompleteError,
  ExportLimitError,
  exportRows,
  type ExportColumn,
  type ExportSource,
} from "@/registry/lib/exports"
import { useFormat } from "@/registry/lib/format"
import { useErpUiT, useLanguage } from "@/registry/lib/i18n"
import {
  isSpreadsheetLoadFailure,
  saveFile,
  spreadsheetFileName,
  writeSpreadsheet,
  type SpreadsheetFormat,
} from "@/registry/lib/spreadsheet"

/**
 * Збір файла експорту (PF07, ADR-0049): сторінки списку → файл → збереження. Новий запуск і `cancel`
 * обривають попередній, закритий діалог не залишає файла. Розкладка — `erp/export-dialog`.
 */
export interface ExportProgress {
  readonly done: number
  readonly total: number
}

function useExportSource<T extends RaRecord>(
  resource: string,
  filter: Record<string, FilterValue> | undefined,
  sort: SortField | undefined,
): (ids: readonly string[] | null) => ExportSource<T> {
  const dataProvider = useDataProvider<ErpDataProvider>()
  return (ids) => ({
    fetchPage: async (page, perPage, signal) => {
      const { data, total } = await dataProvider.getList<T>(resource, {
        pagination: { page, perPage },
        sort: {
          field: sort?.field ?? "",
          order: sort?.order === "desc" ? "DESC" : "ASC",
        },
        filter: ids ? { id: [...ids] } : (filter ?? {}),
        signal,
      })
      return { data, total: total ?? data.length }
    },
  })
}

function useExportFailureText(maxRows: number) {
  const t = useErpUiT()
  const format = useFormat()
  const errorMessage = useApiErrorMessage()
  return (error: unknown) => {
    if (error instanceof ExportLimitError)
      return t("exportDialog.tooMany", {
        total: format.number(error.total),
        max: format.number(maxRows),
      })
    if (error instanceof ExportIncompleteError)
      return t("exportDialog.incomplete", {
        done: format.number(error.done),
        total: format.number(error.total),
      })
    if (isSpreadsheetLoadFailure(error))
      return t("importWizard.fileErrors.load_failed")
    return isApiError(error)
      ? errorMessage(error)
      : t("exportDialog.fileFailed")
  }
}

interface ExportRunRequest<T> {
  readonly columns: readonly ExportColumn<T>[]
  /** Лише ці записи; `null` — усе за фільтрами. */
  readonly ids: readonly string[] | null
  readonly format: SpreadsheetFormat
}

interface ExportRunOptions {
  readonly resource: string
  readonly filter?: Record<string, FilterValue>
  readonly sort?: SortField
  /** Назва аркуша. */
  readonly title: string
  /** Початок назви файла. */
  readonly fileName: string
  readonly maxRows: number
  /** Файл збережено. */
  readonly onDone: () => void
}

/** Збір файла: один за раз, скасування — через `cancel`. */
export function useExportRun<T extends RaRecord>({
  resource,
  filter,
  sort,
  title,
  fileName,
  maxRows,
  onDone,
}: ExportRunOptions) {
  const t = useErpUiT()
  const format = useFormat()
  const { language } = useLanguage()
  const failureText = useExportFailureText(maxRows)
  const sourceFor = useExportSource<T>(resource, filter, sort)
  const [progress, setProgress] = React.useState<ExportProgress | null>(null)
  const [isBusy, setBusy] = React.useState(false)
  const [message, setMessage] = React.useState<string | null>(null)
  const run = React.useRef<AbortController | null>(null)

  React.useEffect(() => () => run.current?.abort(), [])

  const start = async ({ columns, ids, format: file }: ExportRunRequest<T>) => {
    run.current?.abort()
    const controller = new AbortController()
    run.current = controller
    setBusy(true)
    setMessage(null)
    setProgress(null)
    try {
      const records = await collectRecords(sourceFor(ids), {
        maxRows,
        signal: controller.signal,
        onProgress: (done, total) => {
          setProgress({ done, total })
        },
      })
      if (controller.signal.aborted) return
      if (!records.length) {
        setMessage(t("exportDialog.nothing"))
        return
      }
      const blob = await writeSpreadsheet({
        format: file,
        rows: exportRows(records, columns),
        sheetName: title,
        delimiter: language === "uk" ? ";" : ",",
      })
      if (controller.signal.aborted) return
      saveFile(blob, spreadsheetFileName(fileName, file))
      toast.success(
        t("exportDialog.done", {
          count: records.length,
          formatted: format.number(records.length),
        }),
      )
      onDone()
    } catch (error) {
      if (!controller.signal.aborted) setMessage(failureText(error))
    } finally {
      if (run.current === controller) {
        setBusy(false)
        setProgress(null)
      }
    }
  }

  const cancel = () => {
    run.current?.abort()
    setBusy(false)
    setProgress(null)
    setMessage(null)
  }

  return { progress, isBusy, message, start, cancel }
}
