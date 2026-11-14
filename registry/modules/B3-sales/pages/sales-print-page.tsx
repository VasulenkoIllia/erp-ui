import { useAuthenticated } from "ra-core"
import { useParams } from "react-router"

import { PageSkeleton } from "@/components/erp/page-state"
import { PrintPreview, printPreviewState } from "@/components/erp/print-preview"
import { BackToList } from "@/components/erp/record-link"
import { useCardRecord } from "@/hooks/use-card-record"
import { useCompanyProfile } from "@/hooks/use-company-profile"
import { usePageHeading } from "@/hooks/use-page-heading"
import { toLanguage, useLanguage } from "@/lib/i18n"
import { usePrintLanguage } from "@/lib/print"

import { useSalesTitle } from "../components/sales-display"
import { useSalesDetail, useSalesLineFields } from "../components/sales-lines"
import { SalesSheet } from "../components/sales-sheet"
import type { SalesDocument, SalesDocumentDetail } from "../contract"
import { useSalesModule } from "../module-context"
import { ORDER_KIND, QUOTE_KIND, type SalesDocumentKind } from "../sales-kinds"
import { useSalesSheetT, useSalesT } from "../use-sales-t"

/** Друк пропозиції (ADR-0065). */
export function QuotePrintPage() {
  return <SalesPrintPage kind={QUOTE_KIND} />
}

/** Друк замовлення (ADR-0067). */
export function OrderPrintPage() {
  return <SalesPrintPage kind={ORDER_KIND} />
}

/**
 * Друк документа продажу (PF08, ADR-0062): окрема сторінка картки з одним аркушем A4 мовою документа
 * (`company.language`), «Друкувати» — діалог друку браузера, PDF — «Зберегти як PDF».
 */
function SalesPrintPage<D extends SalesDocument, Due extends string>({
  kind,
}: {
  kind: SalesDocumentKind<D, Due>
}) {
  const { id = "" } = useParams()
  // Без сесії ra-core перенаправить на вхід і повернеться сюди після входу.
  const { isPending } = useAuthenticated()
  return isPending ? (
    <PageSkeleton rows={6} />
  ) : (
    <SalesPrint key={id} kind={kind} id={id} />
  )
}

function SalesPrint<D extends SalesDocument, Due extends string>({
  kind,
  id,
}: {
  kind: SalesDocumentKind<D, Due>
  id: string
}) {
  const t = useSalesT()
  const titleOf = useSalesTitle(kind)
  const ui = useLanguage()
  const { paths } = useSalesModule()
  const { record, form } = kind.keys
  const card = useCardRecord<D & Partial<SalesDocumentDetail>>(
    kind.resource,
    id,
  )
  const company = useCompanyProfile()
  const document = card.record
  const detail = useSalesDetail(document, useSalesLineFields(kind))
  const language = company.data?.language ?? ui.language
  // Назва й тексти аркуша — рядки модуля мовою аркуша (не довантажились рядки кіта цієї мови — запасна
  // українська, і рядки модуля теж): поки їх немає, аркуш чекає, а не блимає іншою мовою.
  const sheetT = useSalesSheetT(usePrintLanguage(toLanguage(language)).language)
  const isReady = Boolean(
    document && detail?.success && company.data && !sheetT.isLoading,
  )
  // Рядки не за контрактом чи картка без рядків — помилка даних, а не вічне завантаження.
  const invalid =
    detail?.error ??
    (document && !detail && !card.isFetching
      ? new Error("no lines")
      : undefined)
  const state = printPreviewState(
    card.pageError ?? card.failure ?? invalid ?? company.error ?? sheetT.error,
    !isReady,
  )
  // Вкладка й фокус після переходу — як на картці: «Друк: Пропозиція КП-2026-0001».
  const pageTitle = t(`${record}.printTitle`, {
    title: document ? titleOf(document) : t(`${record}.title`),
  })
  const heading = usePageHeading(
    pageTitle,
    !card.isPending || card.pageError !== undefined,
  )
  return (
    <div className="space-y-4">
      <h1 ref={heading} tabIndex={-1} className="sr-only">
        {pageTitle}
      </h1>
      <PrintPreview
        title={`${sheetT.t(`${record}.sheet.title`)} ${document?.number ?? ""}`.trim()}
        language={language}
        state={state}
        onRetry={() => {
          card.retry()
          void company.refetch()
          sheetT.retry()
        }}
        actions={
          <BackToList
            to={kind.pathsOf(paths).record(id)}
            label={t(`${form}.back`)}
          />
        }
      >
        {isReady && document && detail?.success && company.data ? (
          <SalesSheet
            kind={kind}
            document={document}
            detail={detail.data}
            company={company.data}
            sheetT={sheetT.t}
          />
        ) : null}
      </PrintPreview>
    </div>
  )
}
