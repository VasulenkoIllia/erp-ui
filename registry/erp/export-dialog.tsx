import * as React from "react"
import type { RaRecord } from "ra-core"

import { FormSelect } from "@/registry/erp/form-select"
import {
  useExportRun,
  type ExportProgress,
} from "@/registry/hooks/use-export-run"
import type { FilterValue, SortField } from "@/registry/lib/api"
import { EXPORT_MAX_ROWS, type ExportColumn } from "@/registry/lib/exports"
import { useFormat } from "@/registry/lib/format"
import { useErpUiT } from "@/registry/lib/i18n"
import type { SpreadsheetFormat } from "@/registry/lib/spreadsheet"
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
  const [scope, setScope] = React.useState<ExportScope>("selected")
  const [fileFormat, setFileFormat] = React.useState<SpreadsheetFormat>("xlsx")
  const [chosen, setChosen] = React.useState<ReadonlySet<string>>(
    () =>
      new Set(columns.filter((item) => !item.optional).map((item) => item.id)),
  )
  const [noColumns, setNoColumns] = React.useState(false)
  const { progress, isBusy, message, start, cancel } = useExportRun<T>({
    resource,
    filter,
    sort,
    title,
    fileName,
    maxRows,
    onDone: () => {
      onOpenChange(false)
    },
  })
  const columnsLabelId = React.useId()
  const scopeId = React.useId()
  const formatId = React.useId()
  const hasSelection = selectedIds.length > 0

  const submit = () => {
    const selected = columns.filter((column) => chosen.has(column.id))
    if (!selected.length) {
      setNoColumns(true)
      return
    }
    void start({
      columns: selected,
      ids: hasSelection && scope === "selected" ? selectedIds : null,
      format: fileFormat,
    })
  }

  const close = () => {
    cancel()
    setNoColumns(false)
    onOpenChange(false)
  }

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
            if (!isBusy) submit()
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
            <ExportProgressBar title={title} progress={progress} />
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

function ExportProgressBar({
  title,
  progress,
}: {
  title: string
  progress: ExportProgress | null
}) {
  const t = useErpUiT()
  const format = useFormat()
  const text = progress
    ? t("exportDialog.progress", {
        done: format.number(progress.done),
        total: format.number(progress.total),
      })
    : t("exportDialog.preparing")
  return (
    <div className="grid gap-1">
      <Progress
        aria-label={t("exportDialog.title", { target: title })}
        value={progress?.total ? (progress.done / progress.total) * 100 : null}
        getAriaValueText={() => text}
      />
      <span className="text-sm text-muted-foreground tabular-nums">{text}</span>
    </div>
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
        <FieldLabel
          htmlFor={`${labelId}-all`}
          className="flex-1 items-center pointer-coarse:min-h-touch"
        >
          {t("exportDialog.allColumns")}
        </FieldLabel>
      </Field>
      <div className="grid max-h-56 gap-2 overflow-y-auto pl-1 pointer-coarse:gap-0">
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
            <FieldLabel
              htmlFor={`${labelId}-${column.id}`}
              className="flex-1 items-center pointer-coarse:min-h-touch"
            >
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
