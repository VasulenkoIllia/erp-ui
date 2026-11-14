import type { RaRecord } from "ra-core"
import { useEffect, useMemo } from "react"
import { useForm, type UseFormReturn } from "react-hook-form"
import type { z } from "zod"

import type { DocumentLineItem } from "@/registry/erp/document-line-fields"

import { DocumentLinesEditor } from "@/registry/erp/document-lines-editor"
import type { DocumentLinesValues } from "@/registry/erp/document-lines-schema"
import { PageState, SectionSkeleton } from "@/registry/erp/page-state"
import { useLineDictionaries } from "@/registry/hooks/use-line-dictionaries"
import { errorStateKind } from "@/registry/lib/api"
import type { ExtensionField } from "@/registry/lib/extension-fields"
import { extensionFormLines } from "@/registry/lib/extension-form"
import type {
  SavedDocumentBodyLine,
  SavedDocumentTotals,
} from "@/registry/lib/document-lines"

/**
 * Рядки документа на картці й у формі (UI05, ADR-0059, ADR-0086). Спільне для документних модулів (B3, K2).
 *
 * - Картка: розбір рядків і підсумків з відповіді картки (`useDocumentDetail`) і показ лише для читання
 *   (`DocumentSavedLines`) — суми сервера (`savedTotals` і `totals` рядків), від 12 рядків — пошук і «До
 *   підсумків», як у формі.
 * - Форма: редактор рядків із довідниками одиниць і податків компанії (`DocumentFormLines`); поки
 *   довідники йдуть — скелетон, бо новий рядок лишився б без типових одиниці й податку.
 *
 *   const detail = useDocumentDetail(card.record, invoiceDetailSchema, "K2-invoices")
 *   <DocumentSavedLines detail={detail} document={invoice} state={…} invalidTitle={t("invoice.linesInvalid")} />
 *   <DocumentFormLines form={state.form} currency={currency} item={lineItem} readOnly={readOnly}
 *     mayEdit={mayEdit} savedTotals={readOnly ? invoice?.totals : undefined} />
 *
 * Поля розширення рядка (`lineFields`, ADR-0086) — в обох: схему відповіді картки модуль будує з ними
 * (`savedDocumentBodyLineSchemaWith`), форму — `useDocumentLineFields`.
 */

const NO_OPTIONS: readonly never[] = []

/** Рядки й підсумки документа з відповіді картки. */
export interface SavedDocumentDetail {
  readonly lines: SavedDocumentBodyLine[]
  readonly totals: SavedDocumentTotals
}

/**
 * Рядки й підсумки з відповіді картки за схемою модуля: у рядку списку їх немає (`undefined` — ще не
 * прийшли), зіпсовані — помилка даних (`success: false`, у консоль з назвою модуля `owner`), а шапку
 * однаково видно.
 */
export function useDocumentDetail<S extends z.ZodType>(
  record: unknown,
  schema: S,
  owner: string,
) {
  const parsed = useMemo(
    () =>
      typeof record === "object" && record !== null && "lines" in record
        ? schema.safeParse(record)
        : undefined,
    [record, schema],
  )
  const error = parsed?.error
  useEffect(() => {
    if (error) console.error(`${owner}: document lines response`, error)
  }, [error, owner])
  return parsed
}

/** Стан запиту картки для рядків. */
export interface DocumentLinesState {
  readonly isPending: boolean
  /** Збій запиту картки, коли шапка вже є з кешу списку. */
  readonly failure: unknown
  readonly onRetry: () => void
}

/** Шапка документа, що потрібна рядкам: валюта й знижка документа. */
export interface SavedLinesDocument {
  readonly currency: string
  readonly discountPercent: number
  readonly discountAmount: number
}

/**
 * Рядки збереженого документа лише для читання: поки картки немає — скелетон, немає відповіді — помилка
 * запиту, рядки не за контрактом — помилка даних з `invalidTitle` модуля.
 */
export function DocumentSavedLines({
  detail,
  document,
  state,
  invalidTitle,
  lineFields,
}: {
  /** Результат `useDocumentDetail`. */
  detail: z.ZodSafeParseResult<SavedDocumentDetail> | undefined
  document: SavedLinesDocument
  state: DocumentLinesState
  /** «Рядки рахунку не за контрактом»: заголовок помилки даних словами модуля. */
  invalidTitle: string
  /** Поля розширення рядка; стабільні між рендерами. */
  lineFields?: readonly ExtensionField[] | undefined
}) {
  if (!detail?.success) {
    if (!detail && state.isPending) return <SectionSkeleton rows={4} />
    // Немає відповіді картки — помилка запиту; є, але рядки не за контрактом — помилка даних.
    return !detail ? (
      <PageState
        kind={state.failure ? errorStateKind(state.failure) : "error"}
        headingLevel={3}
        onRetry={state.onRetry}
      />
    ) : (
      <PageState
        kind="error"
        headingLevel={3}
        title={invalidTitle}
        onRetry={state.onRetry}
      />
    )
  }
  return (
    <SavedLines
      document={document}
      detail={detail.data}
      lineFields={lineFields}
    />
  )
}

function SavedLines({
  document,
  detail,
  lineFields = NO_OPTIONS,
}: {
  document: SavedLinesDocument
  detail: SavedDocumentDetail
  lineFields: readonly ExtensionField[] | undefined
}) {
  // Форма лише тримає значення для редактора рядків: збережений документ не редагується тут.
  const form = useForm<DocumentLinesValues>({
    values: {
      lines: extensionFormLines(lineFields, detail.lines),
      discountPercent: document.discountPercent,
      discountAmount: document.discountAmount,
    },
  })
  return (
    <DocumentLinesEditor
      form={form}
      currency={document.currency}
      units={NO_OPTIONS}
      taxes={NO_OPTIONS}
      readOnly
      savedTotals={detail.totals}
      lineFields={lineFields}
    />
  )
}

/**
 * Рядки у формі документа: редактор із довідниками одиниць і податків (лише коли зміна дозволена,
 * `mayEdit`), вибір товару чи послуги з ресурсу проекту (`item`), підсумки сервера в режимі читання
 * (`savedTotals`).
 */
export function DocumentFormLines<TValues extends DocumentLinesValues>({
  form,
  currency,
  item,
  readOnly,
  mayEdit,
  savedTotals,
  lineFields,
}: {
  form: UseFormReturn<TValues>
  currency: string
  item: DocumentLineItem<RaRecord> | undefined
  readOnly: boolean
  /** Довідники вантажаться, лише коли документ можна змінити. */
  mayEdit: boolean
  savedTotals: SavedDocumentTotals | undefined
  /** Поля розширення рядка (`useDocumentLineFields(...).fields`). */
  lineFields?: readonly ExtensionField[] | undefined
}) {
  const dictionaries = useLineDictionaries(mayEdit)
  // Рядок, доданий до довідників, лишився б без типових одиниці й податку.
  if (dictionaries.isLoading) return <SectionSkeleton rows={4} />
  return (
    <DocumentLinesEditor
      form={form}
      currency={currency}
      units={dictionaries.units}
      taxes={dictionaries.taxes}
      item={item}
      newLine={dictionaries.newLine}
      readOnly={readOnly}
      savedTotals={savedTotals}
      lineFields={lineFields}
    />
  )
}
