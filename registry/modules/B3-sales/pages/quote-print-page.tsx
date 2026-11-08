import { useAuthenticated } from "ra-core"
import { useParams } from "react-router"

import { PageSkeleton } from "@/components/erp/page-state"
import {
  PrintPreview,
  type PrintPreviewState,
} from "@/components/erp/print-preview"
import { BackToList } from "@/components/erp/record-link"
import { useCardRecord } from "@/hooks/use-card-record"
import { useCompanyProfile } from "@/hooks/use-company-profile"
import { usePageHeading } from "@/hooks/use-page-heading"
import { errorStateKind, isApiError } from "@/lib/api"
import { toLanguage, useLanguage } from "@/lib/i18n"

import { useQuoteTitle } from "../components/quote-display"
import { useQuoteDetail } from "../components/quote-lines"
import { QUOTE_SHEET_TITLES, QuoteSheet } from "../components/quote-sheet"
import { QUOTES, type Quote, type QuoteDetail } from "../contract"
import { useSalesModule } from "../module-context"
import { useSalesT } from "../use-sales-t"

/** Стан аркуша: «не знайдено», помилка чи завантаження пропозиції й компанії. */
function stateOf(
  failure: unknown,
  isLoading: boolean,
): PrintPreviewState | undefined {
  if (isApiError(failure) && failure.status === 404) return "not-found"
  if (failure) return errorStateKind(failure)
  return isLoading ? "loading" : undefined
}

/**
 * Друк пропозиції (PF08, ADR-0062): окрема сторінка картки з одним аркушем A4 мовою документа
 * (`company.language`), «Друкувати» — діалог друку браузера, PDF — «Зберегти як PDF».
 */
export function QuotePrintPage() {
  const { id = "" } = useParams()
  // Без сесії ra-core перенаправить на вхід і повернеться сюди після входу.
  const { isPending } = useAuthenticated()
  return isPending ? <PageSkeleton rows={6} /> : <QuotePrint key={id} id={id} />
}

function QuotePrint({ id }: { id: string }) {
  const t = useSalesT()
  const titleOf = useQuoteTitle()
  const ui = useLanguage()
  const { paths } = useSalesModule()
  const card = useCardRecord<Quote & Partial<QuoteDetail>>(QUOTES, id)
  const company = useCompanyProfile()
  const quote = card.record
  const detail = useQuoteDetail(quote)
  const language = company.data?.language ?? ui.language
  const isReady = Boolean(quote && detail?.success && company.data)
  // Рядки не за контрактом — помилка даних, а не вічне завантаження.
  const invalid = detail?.error
  const state = stateOf(
    card.pageError ?? card.failure ?? invalid ?? company.error,
    !isReady,
  )
  // Вкладка й фокус після переходу — як на картці: «Друк: Пропозиція КП-2026-0001».
  const pageTitle = t("quote.printTitle", {
    title: quote ? titleOf(quote) : t("quote.title"),
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
        title={`${QUOTE_SHEET_TITLES[toLanguage(language)]} ${quote?.number ?? ""}`.trim()}
        language={language}
        state={state}
        onRetry={() => {
          card.retry()
          void company.refetch()
        }}
        actions={<BackToList to={paths.quote(id)} label={t("form.back")} />}
      >
        {quote && detail?.success && company.data ? (
          <QuoteSheet
            quote={quote}
            detail={detail.data}
            company={company.data}
          />
        ) : null}
      </PrintPreview>
    </div>
  )
}
