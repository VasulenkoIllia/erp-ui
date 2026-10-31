import * as React from "react"
import { toast } from "sonner"

import { useErpUiT } from "@/registry/lib/i18n"
import {
  errorReportRows,
  templateRows,
  type CheckedRow,
  type ImportTarget,
} from "@/registry/lib/import-rows"
import type { ImportRowError } from "@/registry/lib/imports"
import {
  isSpreadsheetLoadFailure,
  saveFile,
  spreadsheetFileName,
  writeSpreadsheet,
  type SpreadsheetRow,
  type SpreadsheetSheet,
} from "@/registry/lib/spreadsheet"

/**
 * Тексти помилок рядків і файли майстра імпорту (PF07, ADR-0049): шаблон із колонками й файл помилок,
 * який людина править і завантажує знову. Бібліотека вантажиться лише після натискання.
 */
const ROW_ERROR_CODES = [
  "required",
  "invalid",
  "duplicate",
  "forbidden",
  "ambiguous_number",
  "no_answer",
] as const
type RowErrorCode = (typeof ROW_ERROR_CODES)[number]

const isRowErrorCode = (code: string): code is RowErrorCode =>
  (ROW_ERROR_CODES as readonly string[]).includes(code)

/** Текст помилки рядка: код модуля, код кіта, інакше сам код. */
export function useImportErrorText(target: ImportTarget) {
  const t = useErpUiT()
  return React.useCallback(
    ({ code, field: key }: ImportRowError) => {
      const message =
        target.errorLabel?.(code) ??
        (isRowErrorCode(code)
          ? t(`importWizard.errors.${code}`)
          : t("importWizard.errors.unknown", { code }))
      const field = target.fields.find((item) => item.key === key)
      return field
        ? t("importWizard.errors.withField", { field: field.label, message })
        : message
    },
    [t, target],
  )
}

export function useImportDownloads({
  target,
  sheet,
  headerRow,
  checked,
  errorText,
}: {
  target: ImportTarget
  sheet: SpreadsheetSheet | undefined
  /** Рядок заголовків, який вибрала людина; немає — перший заповнений. */
  headerRow: number | undefined
  checked: readonly CheckedRow[]
  errorText: (error: ImportRowError) => string
}) {
  const t = useErpUiT()
  const save = (
    rows: readonly SpreadsheetRow[],
    name: string,
    failure: string,
  ) => {
    writeSpreadsheet({ format: "xlsx", rows, sheetName: name })
      .then((blob) => {
        saveFile(blob, spreadsheetFileName(name, "xlsx"))
      })
      .catch((cause: unknown) => {
        toast.error(
          isSpreadsheetLoadFailure(cause)
            ? t("importWizard.fileErrors.load_failed")
            : failure,
        )
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
          checked,
          errorText,
          t("importWizard.check.errorColumn"),
          headerRow,
        ),
        t("importWizard.check.downloadName"),
        t("importWizard.check.downloadFailed"),
      )
    },
  }
}
