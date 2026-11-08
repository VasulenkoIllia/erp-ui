import { useAuthenticated, useCanAccess } from "ra-core"
import { useEffect, useEffectEvent, useState } from "react"
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

import { useSalesAccess } from "../components/sales-access"
import { useSalesTitle } from "../components/sales-display"
import { SalesForm } from "../components/sales-form"
import { useSalesDetail } from "../components/sales-lines"
import type { SalesDocument, SalesDocumentDetail } from "../contract"
import { useSalesModule } from "../module-context"
import { ORDER_KIND, QUOTE_KIND, type SalesDocumentKind } from "../sales-kinds"
import { useSalesT } from "../use-sales-t"

/** Компанія без базової валюти (профіль ще не налаштовано): гривня, як у модулі A1. */
const FALLBACK_CURRENCY = "UAH"

/** Форма пропозиції (ADR-0065). */
export function QuoteFormPage() {
  return <SalesFormPage kind={QUOTE_KIND} />
}

/** Форма замовлення (ADR-0067). */
export function OrderFormPage() {
  return <SalesFormPage kind={ORDER_KIND} />
}

/**
 * Сторінка форми документа продажу (SPEC §7, ADR-0047): створення (`…/new`) і зміна чернетки
 * (`…/:id/edit`). Зміна бере блокування «Редагує …» (ADR-0051) на час сторінки; проведений документ,
 * запис без права чи взятий іншою людиною — та сама форма лише для читання з причиною.
 */
function SalesFormPage<D extends SalesDocument, Due extends string>({
  kind,
}: {
  kind: SalesDocumentKind<D, Due>
}) {
  const { id } = useParams()
  // Без сесії ra-core перенаправить на вхід і повернеться сюди після входу.
  const { isPending } = useAuthenticated()
  if (isPending) return <PageSkeleton rows={6} />
  return id ? (
    <EditDocument key={id} kind={kind} id={id} />
  ) : (
    <NewDocument kind={kind} />
  )
}

function NewDocument<D extends SalesDocument, Due extends string>({
  kind,
}: {
  kind: SalesDocumentKind<D, Due>
}) {
  const t = useSalesT()
  const { paths } = useSalesModule()
  const { list, record, form } = kind.keys
  const heading = usePageHeading(t(`${form}.createTitle`))
  const company = useCompanyProfile()
  const access = useCanAccess({ resource: kind.resource, action: "create" })
  const body =
    company.isPending || access.isPending ? (
      <PageSkeleton rows={6} />
    ) : !access.canAccess ? (
      <PageState kind="forbidden" description={t(`${list}.createDenied`)} />
    ) : company.error ? (
      <PageState
        kind={errorStateKind(company.error)}
        onRetry={() => void company.refetch()}
      />
    ) : (
      <SalesForm
        kind={kind}
        currency={company.data.baseCurrency ?? FALLBACK_CURRENCY}
        readOnly={false}
        mayEdit
      />
    )
  return (
    <div className="space-y-6">
      <BackToList to={kind.pathsOf(paths).list} label={t(`${record}.back`)} />
      <ListReportHeader title={t(`${form}.createTitle`)} headingRef={heading} />
      {body}
    </div>
  )
}

function EditDocument<D extends SalesDocument, Due extends string>({
  kind,
  id,
}: {
  kind: SalesDocumentKind<D, Due>
  id: string
}) {
  const t = useSalesT()
  const titleOf = useSalesTitle(kind)
  const { extension, paths } = useSalesModule()
  const { record: keys, form } = kind.keys
  const card = useCardRecord<D & Partial<SalesDocumentDetail>>(
    kind.resource,
    id,
  )
  const document = card.record
  const detail = useSalesDetail(document)
  const title = document
    ? t(`${form}.editTitle`, { title: titleOf(document) })
    : t(`${keys}.title`)
  const heading = usePageHeading(
    title,
    !card.isPending || card.pageError !== undefined,
  )
  const access = useSalesAccess(kind, "update", document)
  const lock = useEditLock({
    resource: kind.resource,
    id,
    enabled: kind.extensionOf(extension)?.editLock !== false,
  })
  const mayEdit = Boolean(document) && !access.isPending && access.canAccess
  // Поки перше взяття не відповіло, форма лише для читання: введене до відмови пропало б.
  const [isLockSettled, setLockSettled] = useState(false)
  // Блокування — на час сторінки: відпускає його сам хук, коли сторінку покинули. Інша людина
  // відпустила запис — береться знову, інакше форма стала б доступною без блокування.
  const acquire = useEffectEvent(() => lock.acquire())
  const isFree = lock.holder === null
  useEffect(() => {
    if (!mayEdit || !isFree) return
    // Збій блокування не заважає редагувати (`useEditLock`): дані береже версія запису.
    const settle = () => {
      setLockSettled(true)
    }
    void acquire().then(settle, settle)
  }, [mayEdit, isFree])
  const reason = access.isPending
    ? undefined
    : access.canAccess
      ? lock.reason
      : (access.recordReason ?? t(`${keys}.editDenied`))
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
    ) : !document || access.isPending || (!detail && card.isFetching) ? (
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
        title={t(`${keys}.linesInvalid`)}
        onRetry={card.retry}
      />
    ) : (
      <SalesForm
        kind={kind}
        document={{ ...document, ...detail.data }}
        currency={document.currency}
        readOnly={
          reason !== undefined ||
          lock.isAcquiring ||
          (mayEdit && !isLockSettled)
        }
        readOnlyReason={reason}
        mayEdit={mayEdit}
      />
    )
  return (
    <div className="space-y-6">
      <BackToList
        to={kind.pathsOf(paths).record(id)}
        label={t(`${form}.back`)}
      />
      <ListReportHeader title={title} headingRef={heading} />
      <EditLockNotice holder={lock.holder} />
      {body}
    </div>
  )
}
