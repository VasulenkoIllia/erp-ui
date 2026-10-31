import * as React from "react"
import type { RaRecord } from "ra-core"
import { useDataProvider } from "ra-core"
import { toast } from "sonner"

import { FormSelect } from "@/registry/erp/form-select"
import { useApiErrorMessage } from "@/registry/hooks/use-api-error-message"
import {
  isApiError,
  type FilterValue,
  type SortField,
} from "@/registry/lib/api"
import type { ErpDataProvider } from "@/registry/lib/data-provider"
import {
  collectRecords,
  EXPORT_MAX_ROWS,
  ExportLimitError,
  exportRows,
  type ExportColumn,
  type ExportSource,
} from "@/registry/lib/exports"
import { useFormat } from "@/registry/lib/format"
import { useErpUiT, useLanguage } from "@/registry/lib/i18n"
import {
  saveFile,
  spreadsheetFileName,
  writeSpreadsheet,
  type SpreadsheetFormat,
} from "@/registry/lib/spreadsheet"
import { Alert, AlertDescription } from "@/registry/ui/alert"
import { Button } from "@/registry/ui/button"
import { Checkbox } from "@/registry/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/registry/ui/dialog"
import {
  Field,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/registry/ui/field"
import { Progress } from "@/registry/ui/progress"
import { Spinner } from "@/registry/ui/spinner"

/**
 * Діалог експорту (PF07, ADR-0049): що експортувати, формат, колонки. Файл збирає браузер зі
 * сторінок списку (`lib/exports`), бібліотека xlsx вантажиться лише після натискання.
 *
 * - Вибір обсягу видно, лише коли є вибрані записи.
 * - «Експортувати» не вимикається (SPEC §8.3): без колонок помилка стоїть біля списку. Під час збору
 *   кнопка зайнята.
 * - Закрити діалог під час збору — скасувати збір. Файл не з'являється.
 * - Роздільник CSV — за мовою інтерфейсу: українська Excel чекає `;`, англійська `,`.
 */
export interface ExportDialogProps<T extends RaRecord> {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly resource: string
  /** Що експортуємо: «Рахунки». */
  readonly title: string
  /** Початок назви файла: `invoices`. */
  readonly fileName: string
  readonly columns: readonly ExportColumn<T>[]
  /** Плоскі фільтри списку: експортується те, що людина бачить. */
  readonly filter?: Record<string, FilterValue>
  readonly sort?: SortField
  /** Вибрані записи: з ними з'являється вибір обсягу. */
  readonly selectedIds?: readonly string[]
  readonly maxRows?: number
}

type ExportScope = "selected" | "all"

interface ExportProgress {
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

export function ExportDialog<T extends RaRecord>({
  open,
  onOpenChange,
  resource,
  title,
  fileName,
  columns,
  filter,
  sort,
  selectedIds = [],
  maxRows = EXPORT_MAX_ROWS,
}: ExportDialogProps<T>) {
  const t = useErpUiT()
  const format = useFormat()
  const { language } = useLanguage()
  const errorMessage = useApiErrorMessage()
  const sourceFor = useExportSource<T>(resource, filter, sort)
  const [scope, setScope] = React.useState<ExportScope>("selected")
  const [fileFormat, setFileFormat] = React.useState<SpreadsheetFormat>("xlsx")
  const [chosen, setChosen] = React.useState<ReadonlySet<string>>(
    () =>
      new Set(columns.filter((item) => !item.optional).map((item) => item.id)),
  )
  const [progress, setProgress] = React.useState<ExportProgress | null>(null)
  const [isBusy, setBusy] = React.useState(false)
  const [message, setMessage] = React.useState<string | null>(null)
  const [noColumns, setNoColumns] = React.useState(false)
  const run = React.useRef<AbortController | null>(null)
  const columnsLabelId = React.useId()
  const scopeId = React.useId()
  const formatId = React.useId()
  const hasSelection = selectedIds.length > 0

  React.useEffect(() => () => run.current?.abort(), [])

  const failureText = (error: unknown) => {
    if (error instanceof ExportLimitError)
      return t("exportDialog.tooMany", {
        total: format.number(error.total),
        max: format.number(maxRows),
      })
    return isApiError(error)
      ? errorMessage(error)
      : t("exportDialog.fileFailed")
  }

  const start = async () => {
    const selected = columns.filter((column) => chosen.has(column.id))
    if (!selected.length) {
      setNoColumns(true)
      return
    }
    run.current?.abort()
    const controller = new AbortController()
    run.current = controller
    setBusy(true)
    setMessage(null)
    setProgress(null)
    try {
      const ids = hasSelection && scope === "selected" ? selectedIds : null
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
        format: fileFormat,
        rows: exportRows(records, selected),
        sheetName: title,
        delimiter: language === "uk" ? ";" : ",",
      })
      if (controller.signal.aborted) return
      saveFile(blob, spreadsheetFileName(fileName, fileFormat))
      toast.success(
        t("exportDialog.done", {
          count: records.length,
          formatted: format.number(records.length),
        }),
      )
      onOpenChange(false)
    } catch (error) {
      if (!controller.signal.aborted) setMessage(failureText(error))
    } finally {
      if (run.current === controller) {
        setBusy(false)
        setProgress(null)
      }
    }
  }

  const close = () => {
    run.current?.abort()
    setBusy(false)
    setProgress(null)
    onOpenChange(false)
  }

  const progressText = progress
    ? t("exportDialog.progress", {
        done: format.number(progress.done),
        total: format.number(progress.total),
      })
    : t("exportDialog.preparing")

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("exportDialog.title", { target: title })}
          </DialogTitle>
          <DialogDescription>{t("exportDialog.description")}</DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="grid gap-4"
          data-testid="export-form"
          onSubmit={(event) => {
            event.preventDefault()
            if (!isBusy) void start()
          }}
        >
          {hasSelection ? (
            <Field>
              <FieldLabel htmlFor={scopeId}>
                {t("exportDialog.scope")}
              </FieldLabel>
              <FormSelect
                id={scopeId}
                items={[
                  {
                    value: "selected" as const,
                    label: t("exportDialog.scopeSelected", {
                      count: selectedIds.length,
                      formatted: format.number(selectedIds.length),
                    }),
                  },
                  {
                    value: "all" as const,
                    label: t("exportDialog.scopeAll"),
                  },
                ]}
                value={scope}
                onValueChange={setScope}
              />
            </Field>
          ) : null}
          <Field>
            <FieldLabel htmlFor={formatId}>
              {t("exportDialog.format")}
            </FieldLabel>
            <FormSelect
              id={formatId}
              items={[
                { value: "xlsx" as const, label: t("exportDialog.xlsx") },
                { value: "csv" as const, label: t("exportDialog.csv") },
              ]}
              value={fileFormat}
              onValueChange={setFileFormat}
            />
          </Field>
          <ExportColumns
            columns={columns}
            chosen={chosen}
            labelId={columnsLabelId}
            isInvalid={noColumns}
            onChange={(next) => {
              setChosen(next)
              setNoColumns(false)
            }}
          />
          {isBusy ? (
            <div className="grid gap-1">
              <Progress
                aria-label={t("exportDialog.title", { target: title })}
                value={
                  progress?.total
                    ? (progress.done / progress.total) * 100
                    : null
                }
                getAriaValueText={() => progressText}
              />
              <span className="text-sm text-muted-foreground tabular-nums">
                {progressText}
              </span>
            </div>
          ) : null}
          {message ? (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              {t("exportDialog.cancel")}
            </Button>
            <Button type="submit" disabled={isBusy} focusableWhenDisabled>
              {isBusy ? <Spinner aria-hidden /> : null}
              {t("exportDialog.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ExportColumns<T>({
  columns,
  chosen,
  labelId,
  isInvalid,
  onChange,
}: {
  columns: readonly ExportColumn<T>[]
  chosen: ReadonlySet<string>
  labelId: string
  isInvalid: boolean
  onChange: (next: ReadonlySet<string>) => void
}) {
  const t = useErpUiT()
  const errorId = React.useId()
  const isAll = chosen.size === columns.length
  return (
    <FieldSet
      aria-labelledby={labelId}
      aria-describedby={isInvalid ? errorId : undefined}
    >
      <FieldLegend id={labelId} variant="label">
        {t("exportDialog.columns")}
      </FieldLegend>
      <Field orientation="horizontal">
        <Checkbox
          id={`${labelId}-all`}
          checked={isAll}
          indeterminate={!isAll && chosen.size > 0}
          onCheckedChange={(checked) => {
            onChange(new Set(checked ? columns.map((column) => column.id) : []))
          }}
        />
        <FieldLabel htmlFor={`${labelId}-all`}>
          {t("exportDialog.allColumns")}
        </FieldLabel>
      </Field>
      <div className="grid max-h-56 gap-2 overflow-y-auto pl-1">
        {columns.map((column) => (
          <Field key={column.id} orientation="horizontal">
            <Checkbox
              id={`${labelId}-${column.id}`}
              checked={chosen.has(column.id)}
              onCheckedChange={(checked) => {
                const next = new Set(chosen)
                if (checked) next.add(column.id)
                else next.delete(column.id)
                onChange(next)
              }}
            />
            <FieldLabel htmlFor={`${labelId}-${column.id}`}>
              {column.label}
            </FieldLabel>
          </Field>
        ))}
      </div>
      {isInvalid ? (
        <FieldError id={errorId}>{t("exportDialog.noColumns")}</FieldError>
      ) : null}
    </FieldSet>
  )
}
