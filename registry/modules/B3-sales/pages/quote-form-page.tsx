import { useAuthenticated, useCanAccess } from "ra-core"
import { useEffect, useEffectEvent } from "react"
import { useParams } from "react-router"

import { EditLockNotice } from "@/components/erp/edit-lock-notice"
import { PageSkeleton, PageState } from "@/components/erp/page-state"
import { BackToList } from "@/components/erp/record-link"
import { ListReportHeader } from "@/components/templates/list-report"
import { useCardRecord } from "@/hooks/use-card-record"
import { useCompanyProfile } from "@/hooks/use-company-profile"
import { useEditLock } from "@/hooks/use-edit-lock"
import { usePageHeading } from "@/hooks/use-page-heading"
import { errorStateKind, isApiError } from "@/lib/api"

import { useQuoteAccess } from "../components/quote-access"
import { useQuoteTitle } from "../components/quote-display"
import { QuoteForm } from "../components/quote-form"
import { useQuoteDetail } from "../components/quote-lines"
import { QUOTES, type Quote, type QuoteDetail } from "../contract"
import { useSalesModule } from "../module-context"
import { useSalesT } from "../use-sales-t"

/** Компанія без базової валюти (профіль ще не налаштовано): гривня, як у модулі A1. */
const FALLBACK_CURRENCY = "UAH"

/**
 * Сторінка форми пропозиції (SPEC §7, ADR-0047): створення (`/quotes/new`) і зміна чернетки
 * (`/quotes/:id/edit`). Зміна бере блокування «Редагує …» (ADR-0051) на час сторінки; надіслана
 * пропозиція, запис без права чи взятий іншою людиною — та сама форма лише для читання з причиною.
 */
export function QuoteFormPage() {
  const { id } = useParams()
  // Без сесії ra-core перенаправить на вхід і повернеться сюди після входу.
  const { isPending } = useAuthenticated()
  if (isPending) return <PageSkeleton rows={6} />
  return id ? <EditQuote key={id} id={id} /> : <NewQuote />
}

function NewQuote() {
  const t = useSalesT()
  const { paths } = useSalesModule()
  const heading = usePageHeading(t("form.createTitle"))
  const company = useCompanyProfile()
  const access = useCanAccess({ resource: QUOTES, action: "create" })
  const body =
    company.isPending || access.isPending ? (
      <PageSkeleton rows={6} />
    ) : !access.canAccess ? (
      <PageState kind="forbidden" description={t("quotes.createDenied")} />
    ) : company.error ? (
      <PageState
        kind={errorStateKind(company.error)}
        onRetry={() => void company.refetch()}
      />
    ) : (
      <QuoteForm
        currency={company.data.baseCurrency ?? FALLBACK_CURRENCY}
        readOnly={false}
      />
    )
  return (
    <div className="space-y-6">
      <BackToList to={paths.quotes} label={t("quote.back")} />
      <ListReportHeader title={t("form.createTitle")} headingRef={heading} />
      {body}
    </div>
  )
}

function EditQuote({ id }: { id: string }) {
  const t = useSalesT()
  const titleOf = useQuoteTitle()
  const { extension, paths } = useSalesModule()
  const card = useCardRecord<Quote & Partial<QuoteDetail>>(QUOTES, id)
  const quote = card.record
  const detail = useQuoteDetail(quote)
  const title = quote
    ? t("form.editTitle", { title: titleOf(quote) })
    : t("quote.title")
  const heading = usePageHeading(
    title,
    !card.isPending || card.pageError !== undefined,
  )
  const access = useQuoteAccess("update", quote)
  const lock = useEditLock({
    resource: QUOTES,
    id,
    enabled: extension.quotes?.editLock !== false,
  })
  const mayEdit = Boolean(quote) && !access.isPending && access.canAccess
  // Блокування — на час сторінки: відпускає його сам хук, коли сторінку покинули.
  const acquire = useEffectEvent(() => {
    void lock.acquire()
  })
  useEffect(() => {
    if (mayEdit) acquire()
  }, [mayEdit])
  const reason = access.isPending
    ? undefined
    : access.canAccess
      ? lock.reason
      : (access.recordReason ?? t("quote.editDenied"))
  const pageError = card.pageError
  const body =
    pageError !== undefined ? (
      <PageState
        kind={
          isApiError(pageError) && pageError.status === 404
            ? "not-found"
            : errorStateKind(pageError)
        }
        onRetry={card.retry}
      />
    ) : !quote || access.isPending || (!detail && card.isFetching) ? (
      <PageSkeleton rows={6} />
    ) : !detail ? (
      // Відповіді картки з рядками немає: помилка запиту.
      <PageState
        kind={card.failure ? errorStateKind(card.failure) : "error"}
        onRetry={card.retry}
      />
    ) : !detail.success ? (
      // Рядки не за контрактом: форма не відкривається, щоб не зберегти зіпсоване.
      <PageState
        kind="error"
        title={t("quote.linesInvalid")}
        onRetry={card.retry}
      />
    ) : (
      <QuoteForm
        quote={{ ...quote, ...detail.data }}
        currency={quote.currency}
        readOnly={reason !== undefined || lock.isAcquiring}
        readOnlyReason={reason}
      />
    )
  return (
    <div className="space-y-6">
      <BackToList to={paths.quote(id)} label={t("form.back")} />
      <ListReportHeader title={title} headingRef={heading} />
      <EditLockNotice holder={lock.holder} />
      {body}
    </div>
  )
}
