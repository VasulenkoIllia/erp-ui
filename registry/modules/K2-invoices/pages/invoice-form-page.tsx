import { useAuthenticated, useCanAccess } from "ra-core"
import { useEffect, useEffectEvent, useState, type ReactNode } from "react"
import { useParams, useSearchParams } from "react-router"

import { EditLockNotice } from "@/components/erp/edit-lock-notice"
import { PageSkeleton, PageState } from "@/components/erp/page-state"
import { BackToList } from "@/components/erp/record-link"
import { ListReportHeader } from "@/components/templates/list-report"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useCardRecord } from "@/hooks/use-card-record"
import { useCompanyProfile } from "@/hooks/use-company-profile"
import { useEditLock } from "@/hooks/use-edit-lock"
import { usePageHeading } from "@/hooks/use-page-heading"
import { errorStateKind, isApiError } from "@/lib/api"

import { useInvoiceAccess } from "../components/invoice-access"
import { useInvoiceTitle } from "../components/invoice-display"
import { InvoiceForm } from "../components/invoice-form"
import { useInvoiceDetail } from "../components/invoice-lines"
import {
  INVOICES,
  type Invoice,
  type InvoiceCard,
  type InvoiceDetail,
} from "../contract"
import { COPY_PARAM, invoiceDocumentPaths } from "../invoice-kind"
import { useInvoicesModule } from "../module-context"
import { useInvoicesT } from "../use-invoices-t"

/**
 * Сторінка форми рахунку (SPEC §7, ADR-0047, ADR-0070): створення (`…/new`), копія рахунку
 * (`…/new?copy=<id>`: заповнена форма, рахунок — лише після «Зберегти») і зміна чернетки (`…/:id/edit`).
 * Зміна бере блокування «Редагує …» (ADR-0051) на час сторінки; виставлений рахунок, запис без права, у
 * закритому періоді чи взятий іншою людиною — та сама форма лише для читання з причиною.
 */
export function InvoiceFormPage() {
  const { id } = useParams()
  // Без сесії ra-core перенаправить на вхід і повернеться сюди після входу.
  const { isPending } = useAuthenticated()
  if (isPending) return <PageSkeleton rows={6} />
  return id ? <EditInvoice key={id} id={id} /> : <NewInvoice />
}

/**
 * Рахунок із рядками для форми (зміна чи копія): `fallback` — стан запиту картки (помилка, скелетон,
 * рядки не за контрактом), інакше `ready` — рахунок із рядками.
 */
function useFormSource(id: string) {
  const t = useInvoicesT()
  const card = useCardRecord<Invoice & Partial<InvoiceDetail>>(INVOICES, id)
  const invoice = card.record
  const detail = useInvoiceDetail(invoice)
  const pageError = card.pageError
  const fallback: ReactNode =
    pageError !== undefined ? (
      <PageState
        kind={
          isApiError(pageError) && pageError.status === 404
            ? "not-found"
            : errorStateKind(pageError)
        }
        onRetry={card.retry}
      />
    ) : !invoice || (!detail && card.isFetching) ? (
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
        title={t("invoice.linesInvalid")}
        onRetry={card.retry}
      />
    ) : null
  const ready: InvoiceCard | undefined =
    invoice && detail?.success ? { ...invoice, ...detail.data } : undefined
  return { card, invoice, ready, fallback }
}

function NewInvoice() {
  const t = useInvoicesT()
  const { paths } = useInvoicesModule()
  const [params] = useSearchParams()
  const copyId = params.get(COPY_PARAM)
  const heading = usePageHeading(t("invoiceForm.createTitle"))
  const company = useCompanyProfile()
  const access = useCanAccess({ resource: INVOICES, action: "create" })
  const body =
    company.isPending || access.isPending ? (
      <PageSkeleton rows={6} />
    ) : !access.canAccess ? (
      <PageState kind="forbidden" description={t("invoices.createDenied")} />
    ) : company.error ? (
      <PageState
        kind={errorStateKind(company.error)}
        onRetry={() => void company.refetch()}
      />
    ) : copyId ? (
      // Інший рахунок у тій самій адресі — нова форма: значення копії беруться раз.
      <CopiedInvoice key={copyId} id={copyId} />
    ) : (
      <InvoiceForm company={company.data} readOnly={false} mayEdit />
    )
  return (
    <div className="space-y-6">
      <BackToList
        to={invoiceDocumentPaths(paths).list}
        label={t("invoice.back")}
      />
      <ListReportHeader
        title={t("invoiceForm.createTitle")}
        headingRef={heading}
      />
      {body}
    </div>
  )
}

/**
 * Копія рахунку: нова форма з його клієнтом, сторонами, рядками, знижкою й полями розширення, дата —
 * сьогодні; рахунок з'являється лише після «Зберегти». Валюта — рахунку-джерела: ціни рядків у ній.
 */
function CopiedInvoice({ id }: { id: string }) {
  const t = useInvoicesT()
  const titleOf = useInvoiceTitle()
  const source = useFormSource(id)
  if (source.fallback !== null || !source.ready) return source.fallback
  return (
    <div className="grid gap-6">
      <Alert>
        <AlertDescription>
          {t("invoiceForm.copyOf", { title: titleOf(source.ready) })}
        </AlertDescription>
      </Alert>
      <InvoiceForm source={source.ready} readOnly={false} mayEdit />
    </div>
  )
}

function EditInvoice({ id }: { id: string }) {
  const t = useInvoicesT()
  const titleOf = useInvoiceTitle()
  const { extension, paths } = useInvoicesModule()
  const { card, invoice, ready, fallback } = useFormSource(id)
  const title = invoice
    ? t("invoiceForm.editTitle", { title: titleOf(invoice) })
    : t("invoice.title")
  const heading = usePageHeading(
    title,
    !card.isPending || card.pageError !== undefined,
  )
  const access = useInvoiceAccess("update", invoice)
  const lock = useEditLock({
    resource: INVOICES,
    id,
    enabled: extension.invoices?.editLock !== false,
  })
  const mayEdit = Boolean(invoice) && !access.isPending && access.canAccess
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
      : (access.recordReason ?? t("invoice.editDenied"))
  const body =
    fallback ??
    (!ready || access.isPending ? (
      <PageSkeleton rows={6} />
    ) : (
      <InvoiceForm
        invoice={ready}
        readOnly={
          reason !== undefined ||
          lock.isAcquiring ||
          (mayEdit && !isLockSettled)
        }
        readOnlyReason={reason}
        mayEdit={mayEdit}
      />
    ))
  return (
    <div className="space-y-6">
      <BackToList
        to={invoiceDocumentPaths(paths).record(id)}
        label={t("invoiceForm.back")}
      />
      <ListReportHeader title={title} headingRef={heading} />
      <EditLockNotice holder={lock.holder} />
      {body}
    </div>
  )
}
