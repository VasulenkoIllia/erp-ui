import { useDataProvider } from "ra-core"
import * as React from "react"
import { toast } from "sonner"

import { useWizard, type WizardApi } from "@/registry/hooks/use-wizard"
import type { ErpDataProvider } from "@/registry/lib/data-provider"
import { useFormat } from "@/registry/lib/format"
import { useErpUiT } from "@/registry/lib/i18n"
import {
  applicableRows,
  buildRows,
  countActions,
  errorReportRows,
  headerRowIndex,
  mappingIssues,
  mergeCheck,
  sheetIssue,
  suggestMapping,
  templateRows,
  type CheckedRow,
  type ImportCounts,
  type ImportMapping,
  type ImportTarget,
  type MappingIssues,
  type SheetIssue,
} from "@/registry/lib/import-rows"
import {
  IMPORT_MAX_ROWS,
  newImportRequestId,
  type ImportDuplicateMode,
  type ImportRequest,
  type ImportRow,
  type ImportRowError,
} from "@/registry/lib/imports"
import {
  readSpreadsheet,
  saveFile,
  spreadsheetFileName,
  SpreadsheetError,
  writeSpreadsheet,
  type SpreadsheetErrorCode,
  type SpreadsheetSheet,
} from "@/registry/lib/spreadsheet"

/**
 * Стан майстра імпорту (PF07, ADR-0049): файл → колонки → перевірка → перегляд → звіт. Шаблон
 * `templates/wizard` дає кроки й кнопки, цей хук — дані й дії кроків.
 *
 * - Файл читається одразу після вибору: помилку й аркуші видно на першому кроці. Новий файл скасовує
 *   читання попереднього.
 * - «Далі» на кроці колонок запитує перевірку сервера: збій лишає людину на кроці, зіставлення ціле.
 * - `requestId` новий на кожну перевірку: зміни в колонках дають новий запуск, а повтор після
 *   загубленої відповіді — той самий.
 * - Після запуску назад не можна (`locked`): задача вже йде на сервері.
 */
export type ImportFileError = "required" | SpreadsheetErrorCode | SheetIssue

interface ImportState {
  readonly file: File | null
  readonly isReading: boolean
  readonly readError: SpreadsheetErrorCode | null
  readonly isFileMissing: boolean
  readonly sheets: readonly SpreadsheetSheet[]
  readonly sheetIndex: number
  readonly mapping: ImportMapping
  readonly showMappingIssues: boolean
  readonly onDuplicate: ImportDuplicateMode
  readonly checked: readonly CheckedRow[]
  readonly requestId: string
  readonly jobId: string | null
}

const INITIAL_STATE: ImportState = {
  file: null,
  isReading: false,
  readError: null,
  isFileMissing: false,
  sheets: [],
  sheetIndex: 0,
  mapping: {},
  showMappingIssues: false,
  onDuplicate: "skip",
  checked: [],
  requestId: "",
  jobId: null,
}

export interface ImportWizardOptions {
  readonly target: ImportTarget
  /** Межа рядків за раз: `IMPORT_MAX_ROWS` за замовчуванням. */
  readonly maxRows?: number
  /** Людина натиснула «Готово». */
  readonly onDone: () => void
}

export interface ImportWizardApi {
  readonly wizard: WizardApi
  readonly target: ImportTarget
  readonly maxRows: number
  readonly state: ImportState
  readonly sheet: SpreadsheetSheet | undefined
  readonly fileError: ImportFileError | null
  readonly issues: MappingIssues
  readonly counts: ImportCounts
  /** Незавершений імпорт: питати перед виходом зі сторінки. */
  readonly dirty: boolean
  readonly chooseFile: (file: File | null) => void
  readonly chooseSheet: (index: number) => void
  readonly mapColumn: (column: number, key: string | null) => void
  readonly setOnDuplicate: (mode: ImportDuplicateMode) => void
  readonly downloadTemplate: () => void
  readonly downloadErrors: () => void
  readonly errorText: (error: ImportRowError) => string
}

const mappingOf = (
  sheet: SpreadsheetSheet | undefined,
  target: ImportTarget,
) =>
  sheet
    ? suggestMapping(
        sheet.rows[headerRowIndex(sheet.rows)] ?? [],
        target.fields,
      )
    : {}

/** Текст помилки рядка: код модуля, код кіта, інакше сам код. */
export function useImportErrorText(target: ImportTarget) {
  const t = useErpUiT()
  return React.useCallback(
    (error: ImportRowError) => {
      const message =
        target.errorLabel?.(error.code) ??
        (error.code === "required" ||
        error.code === "invalid" ||
        error.code === "duplicate" ||
        error.code === "ambiguous_number"
          ? t(`importWizard.errors.${error.code}`)
          : t("importWizard.errors.unknown", { code: error.code }))
      const field = target.fields.find((item) => item.key === error.field)
      return field
        ? t("importWizard.errors.withField", { field: field.label, message })
        : message
    },
    [t, target],
  )
}

/** Файл → аркуші з даними, або код помилки. */
async function readSheets(
  file: File,
  maxRows: number,
): Promise<Pick<ImportState, "sheets" | "readError">> {
  try {
    const sheets = await readSpreadsheet(file, { maxRows: maxRows + 1 })
    return {
      sheets: sheets.filter((sheet) => headerRowIndex(sheet.rows) >= 0),
      readError: null,
    }
  } catch (cause) {
    if (cause instanceof SpreadsheetError)
      return { sheets: [], readError: cause.code }
    throw cause
  }
}

function useDownloads({
  target,
  sheet,
  state,
  errorText,
}: {
  target: ImportTarget
  sheet: SpreadsheetSheet | undefined
  state: ImportState
  errorText: (error: ImportRowError) => string
}) {
  const t = useErpUiT()
  const save = (
    rows: Parameters<typeof writeSpreadsheet>[0]["rows"],
    name: string,
    failure: string,
  ) => {
    writeSpreadsheet({ format: "xlsx", rows, sheetName: name })
      .then((blob) => {
        saveFile(blob, spreadsheetFileName(name, "xlsx"))
      })
      .catch(() => {
        toast.error(failure)
      })
  }
  return {
    downloadTemplate: () => {
      save(
        templateRows(target.fields),
        `${target.resource}-${t("importWizard.file.templateName")}`,
        t("importWizard.file.templateFailed"),
      )
    },
    downloadErrors: () => {
      save(
        errorReportRows(
          sheet?.rows ?? [],
          state.checked,
          errorText,
          t("importWizard.check.errorColumn"),
        ),
        t("importWizard.check.downloadName"),
        t("importWizard.check.downloadFailed"),
      )
    },
  }
}

export function useImportWizard({
  target,
  maxRows = IMPORT_MAX_ROWS,
  onDone,
}: ImportWizardOptions): ImportWizardApi {
  const t = useErpUiT()
  const format = useFormat()
  const dataProvider = useDataProvider<ErpDataProvider>()
  const [state, setState] = React.useState(INITIAL_STATE)
  const patch = (next: Partial<ImportState>) => {
    setState((current) => ({ ...current, ...next }))
  }
  const reading = React.useRef<Promise<void>>(Promise.resolve())
  const readRun = React.useRef(0)
  const sheet = state.sheets[state.sheetIndex]
  const issues = mappingIssues(state.mapping, target.fields)
  const counts = countActions(state.checked)
  const errorText = useImportErrorText(target)

  const issue = sheet ? sheetIssue(sheet, maxRows) : null
  const fileError: ImportFileError | null =
    state.readError ?? issue ?? (state.isFileMissing ? "required" : null)

  const request = (rows: readonly ImportRow[], requestId: string) =>
    ({
      requestId,
      fileName: state.file?.name,
      matchField: target.matchField,
      onDuplicate: target.matchField ? state.onDuplicate : undefined,
      rows: [...rows],
    }) satisfies ImportRequest

  const checkRows = async () => {
    if (issues.missing.length || issues.repeated.size || !hasMapping(state)) {
      patch({ showMappingIssues: true })
      return false
    }
    const built = buildRows(sheet?.rows ?? [], state.mapping, target.fields)
    const requestId = newImportRequestId()
    const check = built.rows.length
      ? await dataProvider.checkImport(
          target.resource,
          request(built.rows, requestId),
        )
      : { rows: [] }
    patch({ checked: mergeCheck(built, check), requestId })
    return true
  }

  const applyCount = counts.create + counts.update
  const wizard = useWizard({
    steps: [
      {
        id: "file",
        label: t("importWizard.steps.file"),
        description: t("importWizard.descriptions.file"),
        onNext: async () => {
          await reading.current
          if (!state.file) patch({ isFileMissing: true })
          return Boolean(state.file) && !fileError && Boolean(sheet)
        },
      },
      {
        id: "mapping",
        label: t("importWizard.steps.mapping"),
        description: t("importWizard.descriptions.mapping"),
        onNext: checkRows,
      },
      {
        id: "check",
        label: t("importWizard.steps.check"),
        description: t("importWizard.descriptions.check"),
        onNext: () => applyCount > 0,
      },
      {
        id: "preview",
        label: t("importWizard.steps.preview"),
        description: t("importWizard.descriptions.preview"),
        nextLabel: t("importWizard.preview.apply", {
          count: applyCount,
          formatted: format.number(applyCount),
        }),
        onNext: async () => {
          const { jobId } = await dataProvider.startImport(
            target.resource,
            request(applicableRows(state.checked), state.requestId),
          )
          patch({ jobId })
        },
      },
      {
        id: "report",
        label: t("importWizard.steps.report"),
        description: t("importWizard.descriptions.report"),
        locked: true,
      },
    ],
    onFinish: onDone,
  })

  const { downloadTemplate, downloadErrors } = useDownloads({
    target,
    sheet,
    state,
    errorText,
  })

  return {
    wizard,
    target,
    maxRows,
    state,
    sheet,
    fileError,
    issues,
    counts,
    dirty: state.file !== null && state.jobId === null,
    chooseFile: (file) => {
      readRun.current += 1
      const run = readRun.current
      setState({ ...INITIAL_STATE, file, isReading: file !== null })
      if (!file) {
        reading.current = Promise.resolve()
        return
      }
      reading.current = readSheets(file, maxRows).then((result) => {
        if (run !== readRun.current) return
        patch({
          ...result,
          isReading: false,
          mapping: mappingOf(result.sheets[0], target),
        })
      })
    },
    chooseSheet: (index) => {
      patch({
        sheetIndex: index,
        mapping: mappingOf(state.sheets[index], target),
        showMappingIssues: false,
        checked: [],
      })
    },
    mapColumn: (column, key) => {
      setState((current) => {
        const mapping = { ...current.mapping }
        if (key === null) delete mapping[column]
        else mapping[column] = key
        return { ...current, mapping, checked: [] }
      })
    },
    setOnDuplicate: (onDuplicate) => {
      patch({ onDuplicate, checked: [] })
    },
    downloadTemplate,
    downloadErrors,
    errorText,
  }
}

const hasMapping = (state: ImportState) => Object.keys(state.mapping).length > 0
