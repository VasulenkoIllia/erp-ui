import { useAuthenticated } from "ra-core"
import { useParams } from "react-router"

import { EditLockNotice } from "@/components/erp/edit-lock-notice"
import { PageSkeleton } from "@/components/erp/page-state"
import { RecordHistory } from "@/components/erp/record-history"
import { BackToList } from "@/components/erp/record-link"
import {
  ObjectPage,
  useRecordSlots,
  type ObjectPageSectionItem,
} from "@/components/templates/object-page"
import { useCardRecord } from "@/hooks/use-card-record"
import { useEditLock } from "@/hooks/use-edit-lock"
import { useHistoryRefresh } from "@/hooks/use-history-refresh"
import { usePageHeading } from "@/hooks/use-page-heading"
import { usePaletteActions } from "@/hooks/use-palette-actions"
import { applyKeyedChanges } from "@/lib/extensions"
import { useFormat } from "@/lib/format"

import {
  DocumentStatusBar,
  useDocumentCompare,
} from "../components/document-status-bar"
import { useInvoiceTitle } from "../components/invoice-display"
import { InvoiceFlow } from "../components/invoice-flow"
import {
  useInvoiceHeader,
  useInvoicePaletteActions,
} from "../components/invoice-header"
import { InvoiceLines } from "../components/invoice-lines"
import { InvoiceParties } from "../components/invoice-parties"
import { useDocumentStatuses } from "../components/invoice-statuses"
import { INVOICES, type Invoice, type InvoiceDetail } from "../contract"
import type { InvoiceActionId, InvoiceSectionId } from "../extension"
import { INVOICE_KIND, invoiceDocumentPaths } from "../invoice-kind"
import { useInvoicesModule } from "../module-context"
import { useInvoicesT } from "../use-invoices-t"

type CardRecord = Invoice & Partial<InvoiceDetail>

/**
 * Картка рахунку на шаблоні Object Page (SPEC §7; ADR-0057, ADR-0062, ADR-0069, ADR-0070): шапка з номером
 * і статусом, етапи, смуга закритого періоду над панеллю дій графа, рядки лише для читання з підсумками
 * сервера, сторони, потік документів (ADR-0061), «Історія» з журналу аудиту чи стрічка зі слота `aside` —
 * праворуч на широкому, вкладкою на вузькому. Після «Виправити» й «Сторнувати» — картка нового рахунку,
 * після «Кредит-нота» — картка кредит-ноти (ADR-0072).
 */
export function InvoicePage() {
  const { id = "" } = useParams()
  // Без сесії ra-core перенаправить на вхід і повернеться сюди після входу.
  const { isPending } = useAuthenticated()
  // Інший рахунок — інша картка: фокус і блокування не переходять від попереднього.
  return isPending ? (
    <PageSkeleton rows={4} />
  ) : (
    <InvoiceCard key={id} id={id} />
  )
}

function InvoiceCard({ id }: { id: string }) {
  const t = useInvoicesT()
  const titleOf = useInvoiceTitle()
  const { extension, paths } = useInvoicesModule()
  const invoiceExtension = extension.invoices
  const card = useCardRecord<CardRecord>(INVOICES, id)
  const invoice = card.record
  const heading = usePageHeading(
    invoice ? titleOf(invoice) : t("invoice.title"),
    !card.isPending || card.pageError !== undefined,
  )
  const statuses = useDocumentStatuses(INVOICE_KIND)
  const format = useFormat()
  const compare = useDocumentCompare<Invoice>(INVOICE_KIND, statuses, {
    key: "dueDate",
    label: t("invoice.fields.dueDate"),
    show: (seen) => format.date(seen.dueDate, "date"),
  })
  const slots = useRecordSlots<Invoice, InvoiceSectionId, InvoiceActionId>({
    record: invoice,
    resource: INVOICES,
    sections: invoiceExtension?.sections,
    actions: invoiceExtension?.actions,
    aside: invoiceExtension?.aside,
  })
  const lock = useEditLock({
    resource: INVOICES,
    id,
    enabled: invoiceExtension?.editLock !== false,
  })
  const header = useInvoiceHeader(invoice, statuses, slots.actions, lock)
  useHistoryRefresh(invoice?.version)
  const sections: (ObjectPageSectionItem & { id: InvoiceSectionId })[] = invoice
    ? [
        {
          id: "lines",
          title: t("invoice.sections.lines"),
          content: (
            <InvoiceLines
              kind={INVOICE_KIND}
              invoice={invoice}
              state={{
                isPending: card.isFetching,
                failure: card.failure,
                onRetry: card.retry,
              }}
            />
          ),
        },
        {
          id: "parties",
          title: t("invoice.sections.parties"),
          content: <InvoiceParties kind={INVOICE_KIND} invoice={invoice} />,
        },
        {
          id: "flow",
          title: t("invoice.sections.flow"),
          content: <InvoiceFlow resource={INVOICES} id={id} />,
        },
      ]
    : []
  const shownSections = applyKeyedChanges(sections, slots.sections)
  const paletteActions = useInvoicePaletteActions(invoice, lock)
  usePaletteActions(
    invoice ? { title: titleOf(invoice), actions: paletteActions } : null,
  )
  return (
    <ObjectPage
      title={t("invoice.title")}
      headingRef={heading}
      back={
        <BackToList
          to={invoiceDocumentPaths(paths).list}
          label={t("invoice.back")}
        />
      }
      isPending={card.isPending}
      error={card.pageError}
      onRetry={card.retry}
      header={header}
      notice={<EditLockNotice holder={lock.holder} />}
      statusBar={
        invoice ? (
          <DocumentStatusBar
            kind={INVOICE_KIND}
            document={invoice}
            statuses={statuses}
            compare={compare}
          />
        ) : undefined
      }
      sections={shownSections}
      // Бекенд без журналу змін — картка без «Історії» (`history: false` у розширенні).
      aside={
        slots.aside ??
        (invoiceExtension?.history === false
          ? undefined
          : {
              label: t("invoice.history"),
              content: (
                <RecordHistory
                  target={{
                    type: INVOICES,
                    id,
                    name: invoice ? titleOf(invoice) : undefined,
                  }}
                />
              ),
            })
      }
    />
  )
}
