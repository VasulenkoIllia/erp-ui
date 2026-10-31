import { useDataProvider } from "ra-core"
import * as React from "react"

import {
  useImportDownloads,
  useImportErrorText,
} from "@/registry/hooks/use-import-downloads"
import { useWizard, type WizardApi } from "@/registry/hooks/use-wizard"
import type { ErpDataProvider } from "@/registry/lib/data-provider"
import { useFormat } from "@/registry/lib/format"
import { useErpUiT } from "@/registry/lib/i18n"
import {
  applicableRows,
  buildRows,
  countActions,
  headerRowIndex,
  mappingIssues,
  mergeCheck,
  sheetIssue,
  suggestMapping,
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
  SpreadsheetError,
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
 * - Зміна файла, аркуша, колонок чи дії з дублями скидає перевірку й `requestId`: це вже інший імпорт.
 *   Без змін ключ той самий, тож повтор після загубленої відповіді не створює записи двічі.
 * - Кроки перевірки й перегляду без перевірки недоступні (`blocked`): запускати нічого.
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

const NOT_CHECKED = {
  checked: [],
  requestId: "",
} satisfies Partial<ImportState>

type FileRead = Pick<ImportState, "sheets" | "readError">
type SetImportState = React.Dispatch<React.SetStateAction<ImportState>>

const NOTHING_READ: FileRead = { sheets: [], readError: null }

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

/** Файл → аркуші з даними, або код помилки. Причину бачить людина, тож відмови тут не лишається. */
async function readSheets(file: File, maxRows: number): Promise<FileRead> {
  try {
    const sheets = await readSpreadsheet(file, { maxRows: maxRows + 1 })
    return {
      sheets: sheets.filter((sheet) => headerRowIndex(sheet.rows) >= 0),
      readError: null,
    }
  } catch (cause) {
    return {
      sheets: [],
      readError: cause instanceof SpreadsheetError ? cause.code : "unreadable",
    }
  }
}

/** Вибір людини на кроках файла й колонок. `reading` — результат останнього читання файла. */
function useImportChoices({
  target,
  maxRows,
  setState,
}: {
  target: ImportTarget
  maxRows: number
  setState: SetImportState
}) {
  const reading = React.useRef<Promise<FileRead>>(Promise.resolve(NOTHING_READ))
  const readRun = React.useRef(0)
  return {
    reading,
    chooseFile: (file: File | null) => {
      readRun.current += 1
      const run = readRun.current
      setState({ ...INITIAL_STATE, file, isReading: file !== null })
      if (!file) {
        reading.current = Promise.resolve(NOTHING_READ)
        return
      }
      reading.current = readSheets(file, maxRows).then((result) => {
        if (run === readRun.current)
          setState((current) => ({
            ...current,
            ...result,
            isReading: false,
            mapping: mappingOf(result.sheets[0], target),
          }))
        return result
      })
    },
    chooseSheet: (index: number) => {
      setState((current) => ({
        ...current,
        ...NOT_CHECKED,
        sheetIndex: index,
        mapping: mappingOf(current.sheets[index], target),
        showMappingIssues: false,
      }))
    },
    mapColumn: (column: number, key: string | null) => {
      setState((current) => {
        const mapping = { ...current.mapping }
        if (key === null) delete mapping[column]
        else mapping[column] = key
        return { ...current, ...NOT_CHECKED, mapping }
      })
    },
    setOnDuplicate: (onDuplicate: ImportDuplicateMode) => {
      setState((current) => ({ ...current, ...NOT_CHECKED, onDuplicate }))
    },
  }
}

const importRequest = (
  state: ImportState,
  target: ImportTarget,
  rows: readonly ImportRow[],
  requestId: string,
): ImportRequest => ({
  requestId,
  fileName: state.file?.name,
  matchField: target.matchField,
  onDuplicate: target.matchField ? state.onDuplicate : undefined,
  rows: [...rows],
})

interface ImportStepsOptions {
  readonly target: ImportTarget
  readonly maxRows: number
  readonly state: ImportState
  readonly setState: SetImportState
  readonly reading: React.RefObject<Promise<FileRead>>
  readonly issues: MappingIssues
  readonly applyCount: number
}

/** Що робить «Далі» на кроках: чекає файл, перевіряє рядки, запускає імпорт. */
function useImportActions({
  target,
  maxRows,
  state,
  setState,
  reading,
  issues,
  applyCount,
}: ImportStepsOptions) {
  const dataProvider = useDataProvider<ErpDataProvider>()
  const patch = (next: Partial<ImportState>) => {
    setState((current) => ({ ...current, ...next }))
  }

  const fileReady = async () => {
    if (!state.file) {
      patch({ isFileMissing: true })
      return false
    }
    // Читання могло ще тривати: стан цього рендера його результату не знає.
    const { sheets, readError } = await reading.current
    const chosen = sheets[state.sheetIndex]
    return !readError && chosen !== undefined && !sheetIssue(chosen, maxRows)
  }

  const checkRows = async () => {
    const hasMapping = Object.keys(state.mapping).length > 0
    if (issues.missing.length || issues.repeated.size || !hasMapping) {
      patch({ showMappingIssues: true })
      return false
    }
    const rows = state.sheets[state.sheetIndex]?.rows ?? []
    const built = buildRows(rows, state.mapping, target.fields)
    const requestId = state.requestId || newImportRequestId()
    const check = built.rows.length
      ? await dataProvider.checkImport(
          target.resource,
          importRequest(state, target, built.rows, requestId),
        )
      : { rows: [] }
    patch({ checked: mergeCheck(built, check), requestId })
    return true
  }

  const startRun = async () => {
    if (!applyCount) return false
    const { jobId } = await dataProvider.startImport(
      target.resource,
      importRequest(
        state,
        target,
        applicableRows(state.checked),
        state.requestId,
      ),
    )
    patch({ jobId })
    return true
  }

  return { fileReady, checkRows, startRun }
}

function useImportSteps({
  onDone,
  ...options
}: ImportStepsOptions & { onDone: () => void }): WizardApi {
  const t = useErpUiT()
  const format = useFormat()
  const { state, applyCount } = options
  const { fileReady, checkRows, startRun } = useImportActions(options)

  return useWizard({
    steps: [
      {
        id: "file",
        label: t("importWizard.steps.file"),
        description: t("importWizard.descriptions.file"),
        onNext: fileReady,
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
        blocked: state.checked.length === 0,
        onNext: () => applyCount > 0,
      },
      {
        id: "preview",
        label: t("importWizard.steps.preview"),
        description: t("importWizard.descriptions.preview"),
        blocked: applyCount === 0,
        nextLabel: t("importWizard.preview.apply", {
          count: applyCount,
          formatted: format.number(applyCount),
        }),
        onNext: startRun,
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
}

export function useImportWizard({
  target,
  maxRows = IMPORT_MAX_ROWS,
  onDone,
}: ImportWizardOptions): ImportWizardApi {
  const [state, setState] = React.useState(INITIAL_STATE)
  const sheet = state.sheets[state.sheetIndex]
  const issues = mappingIssues(state.mapping, target.fields)
  const counts = countActions(state.checked)
  const errorText = useImportErrorText(target)
  const { reading, ...choices } = useImportChoices({
    target,
    maxRows,
    setState,
  })
  const wizard = useImportSteps({
    target,
    maxRows,
    onDone,
    state,
    setState,
    reading,
    issues,
    applyCount: counts.create + counts.update,
  })
  const downloads = useImportDownloads({
    target,
    sheet,
    checked: state.checked,
    errorText,
  })
  const issue = sheet ? sheetIssue(sheet, maxRows) : null
  return {
    wizard,
    target,
    maxRows,
    state,
    sheet,
    fileError:
      state.readError ?? issue ?? (state.isFileMissing ? "required" : null),
    issues,
    counts,
    dirty: state.file !== null && state.jobId === null,
    ...choices,
    ...downloads,
    errorText,
  }
}
