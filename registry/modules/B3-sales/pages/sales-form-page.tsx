import { useAuthenticated, useCanAccess } from "ra-core"
import { useParams, useSearchParams } from "react-router"

import { PageSkeleton, PageState } from "@/components/erp/page-state"
import {
  DocumentFormPage,
  useDocumentFormSource,
} from "@/components/templates/document-form-page"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useCompanyProfile } from "@/hooks/use-company-profile"
import { useEditSession } from "@/hooks/use-edit-session"
import { usePageHeading } from "@/hooks/use-page-heading"
import { COPY_PARAM } from "@/lib/document-kind"
import { errorStateKind } from "@/lib/api"

import { useSalesAccess } from "../components/sales-access"
import { useSalesTitle } from "../components/sales-display"
import { SalesForm } from "../components/sales-form"
import { salesDetailSchema, type SalesDocument } from "../contract"
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
 * Сторінка форми документа продажу (SPEC §7, ADR-0047): створення (`…/new`), копія документа
 * (`…/new?copy=<id>`, ADR-0067: заповнена форма, документ — лише після «Зберегти») і зміна чернетки
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

/** Документ із рядками для форми (зміна чи копія) за схемою рядків модуля. */
function useFormSource<D extends SalesDocument, Due extends string>(
  kind: SalesDocumentKind<D, Due>,
  id: string,
) {
  const t = useSalesT()
  return useDocumentFormSource<D, typeof salesDetailSchema>({
    resource: kind.resource,
    id,
    schema: salesDetailSchema,
    owner: "B3-sales",
    invalidTitle: t(`${kind.keys.record}.linesInvalid`),
  })
}

function NewDocument<D extends SalesDocument, Due extends string>({
  kind,
}: {
  kind: SalesDocumentKind<D, Due>
}) {
  const t = useSalesT()
  const { paths } = useSalesModule()
  const [params] = useSearchParams()
  const copyId = params.get(COPY_PARAM)
  const { list, record, form } = kind.keys
  const heading = usePageHeading(t(`${form}.createTitle`))
  const company = useCompanyProfile()
  const access = useCanAccess({ resource: kind.resource, action: "create" })
  const currency = company.data?.baseCurrency ?? FALLBACK_CURRENCY
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
    ) : copyId ? (
      // Інший документ у тій самій адресі — нова форма: значення копії беруться раз.
      <CopiedDocument key={copyId} kind={kind} id={copyId} />
    ) : (
      <SalesForm kind={kind} currency={currency} readOnly={false} mayEdit />
    )
  return (
    <DocumentFormPage
      back={kind.pathsOf(paths).list}
      backLabel={t(`${record}.back`)}
      title={t(`${form}.createTitle`)}
      headingRef={heading}
    >
      {body}
    </DocumentFormPage>
  )
}

/**
 * Копія документа (ADR-0067): нова форма з його клієнтом, рядками, знижкою й полями розширення, дата —
 * сьогодні; документ з'являється лише після «Зберегти». Валюта — документа-джерела: ціни рядків у ній.
 */
function CopiedDocument<D extends SalesDocument, Due extends string>({
  kind,
  id,
}: {
  kind: SalesDocumentKind<D, Due>
  id: string
}) {
  const t = useSalesT()
  const titleOf = useSalesTitle(kind)
  const source = useFormSource(kind, id)
  if (source.fallback !== null || !source.ready) return source.fallback
  return (
    <div className="grid gap-6">
      <Alert>
        <AlertDescription>
          {t(`${kind.keys.form}.copyOf`, { title: titleOf(source.ready) })}
        </AlertDescription>
      </Alert>
      <SalesForm
        kind={kind}
        source={source.ready}
        currency={source.ready.currency}
        readOnly={false}
        mayEdit
      />
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
  const { card, document, ready, fallback } = useFormSource(kind, id)
  const title = document
    ? t(`${form}.editTitle`, { title: titleOf(document) })
    : t(`${keys}.title`)
  const heading = usePageHeading(
    title,
    !card.isPending || card.pageError !== undefined,
  )
  const session = useEditSession({
    resource: kind.resource,
    id,
    access: useSalesAccess(kind, "update", document),
    hasRecord: Boolean(document),
    deniedReason: t(`${keys}.editDenied`),
    enabled: kind.extensionOf(extension)?.editLock !== false,
  })
  const body =
    fallback ??
    (!ready || session.isPending ? (
      <PageSkeleton rows={6} />
    ) : (
      <SalesForm
        kind={kind}
        document={ready}
        currency={ready.currency}
        readOnly={session.readOnly}
        readOnlyReason={session.reason}
        mayEdit={session.mayEdit}
      />
    ))
  return (
    <DocumentFormPage
      back={kind.pathsOf(paths).record(id)}
      backLabel={t(`${form}.back`)}
      title={title}
      headingRef={heading}
      holder={session.holder}
    >
      {body}
    </DocumentFormPage>
  )
}
