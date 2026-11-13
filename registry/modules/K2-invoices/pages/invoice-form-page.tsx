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
import { errorStateKind } from "@/lib/api"
import { COPY_PARAM } from "@/lib/document-kind"

import { useDocumentAccess } from "../components/invoice-access"
import { useInvoiceTitle } from "../components/invoice-display"
import { InvoiceForm } from "../components/invoice-form"
import { INVOICES, invoiceDetailSchema, type Invoice } from "../contract"
import { INVOICE_KIND, invoiceDocumentPaths } from "../invoice-kind"
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

/** Рахунок із рядками для форми (зміна чи копія). */
function useFormSource(id: string) {
  const t = useInvoicesT()
  return useDocumentFormSource<Invoice, typeof invoiceDetailSchema>({
    resource: INVOICES,
    id,
    schema: invoiceDetailSchema,
    owner: "K2-invoices",
    invalidTitle: t("invoice.linesInvalid"),
  })
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
    <DocumentFormPage
      back={invoiceDocumentPaths(paths).list}
      backLabel={t("invoice.back")}
      title={t("invoiceForm.createTitle")}
      headingRef={heading}
    >
      {body}
    </DocumentFormPage>
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
  const { card, document: invoice, ready, fallback } = useFormSource(id)
  const title = invoice
    ? t("invoiceForm.editTitle", { title: titleOf(invoice) })
    : t("invoice.title")
  const heading = usePageHeading(
    title,
    !card.isPending || card.pageError !== undefined,
  )
  const access = useDocumentAccess(INVOICE_KIND, "update", invoice)
  const session = useEditSession({
    resource: INVOICES,
    id,
    access,
    hasRecord: Boolean(invoice),
    deniedReason: t("invoice.editDenied"),
    enabled: extension.invoices?.editLock !== false,
  })
  const body =
    fallback ??
    (!ready || session.isPending ? (
      <PageSkeleton rows={6} />
    ) : (
      <InvoiceForm
        invoice={ready}
        readOnly={session.readOnly}
        readOnlyReason={session.reason}
        mayEdit={session.mayEdit}
      />
    ))
  return (
    <DocumentFormPage
      back={invoiceDocumentPaths(paths).record(id)}
      backLabel={t("invoiceForm.back")}
      title={title}
      headingRef={heading}
      holder={session.holder}
    >
      {body}
    </DocumentFormPage>
  )
}
