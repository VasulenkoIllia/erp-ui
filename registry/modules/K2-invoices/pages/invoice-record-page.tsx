import { useAuthenticated, type RaRecord } from "ra-core"
import { useNavigate, useParams } from "react-router"

import type { ConflictField } from "@/components/erp/conflict-dialog"
import { DocumentActionBar } from "@/components/erp/document-action-bar"
import { EditLockNotice } from "@/components/erp/edit-lock-notice"
import { PageSkeleton } from "@/components/erp/page-state"
import { PeriodLockBanner } from "@/components/erp/period-lock-banner"
import { RecordStatusBar } from "@/components/erp/record-header"
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
import type { ResolvedStatuses } from "@/lib/statuses"

import { useInvoiceLockedReason } from "../components/invoice-access"
import { useInvoiceTitle } from "../components/invoice-display"
import { InvoiceFlow } from "../components/invoice-flow"
import {
  useInvoiceHeader,
  useInvoicePaletteActions,
} from "../components/invoice-header"
import { InvoiceLines } from "../components/invoice-lines"
import { InvoiceParties } from "../components/invoice-parties"
import {
  useInvoiceStatuses,
  useInvoiceTransitions,
} from "../components/invoice-statuses"
import { INVOICES, type Invoice, type InvoiceDetail } from "../contract"
import type { InvoiceActionId, InvoiceSectionId } from "../extension"
import { INVOICE_MAIN_PATH, invoiceDocumentPaths } from "../invoice-kind"
import { useInvoicesModule } from "../module-context"
import { useInvoicesT } from "../use-invoices-t"

type CardRecord = Invoice & Partial<InvoiceDetail>

/**
 * Картка рахунку на шаблоні Object Page (SPEC §7; ADR-0057, ADR-0062, ADR-0069, ADR-0070): шапка з номером
 * і статусом, етапи, смуга закритого періоду над панеллю дій графа, рядки лише для читання з підсумками
 * сервера, сторони, потік документів (ADR-0061), «Історія» з журналу аудиту чи стрічка зі слота `aside` —
 * праворуч на широкому, вкладкою на вузькому. Після «Виправити» й «Сторнувати» — картка нового рахунку.
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

/** «Було → стало» дії в конфлікті: статус, «Сплатити до» й сума мовою інтерфейсу. */
function useCompare(statuses: ResolvedStatuses) {
  const t = useInvoicesT()
  const format = useFormat()
  const compared = [
    {
      key: "status",
      label: t("invoice.fields.status"),
      show: (invoice: Invoice) =>
        statuses.byId.get(invoice.status)?.label ?? invoice.status,
    },
    {
      key: "dueDate",
      label: t("invoice.fields.dueDate"),
      show: (invoice: Invoice) => format.date(invoice.dueDate, "date"),
    },
    {
      key: "total",
      label: t("invoice.fields.total"),
      show: (invoice: Invoice) =>
        format.money({ amount: invoice.total, currency: invoice.currency }),
    },
  ]
  return (seen: Invoice, current: Invoice): ConflictField[] =>
    compared
      .filter(({ show }) => show(seen) !== show(current))
      .map(({ key, label, show }) => ({
        key,
        label,
        mine: show(seen),
        theirs: show(current),
      }))
}

/**
 * Етапи основного шляху, смуга закритого періоду (PF13: що робити далі — сторно) і панель дій графа під
 * шапкою картки; причини заборон станом — словами модуля.
 */
function InvoiceStatusBar({
  invoice,
  statuses,
}: {
  invoice: CardRecord
  statuses: ResolvedStatuses
}) {
  const t = useInvoicesT()
  const navigate = useNavigate()
  const { paths } = useInvoicesModule()
  const transitions = useInvoiceTransitions()
  const compare = useCompare(statuses)
  const lockedReason = useInvoiceLockedReason()
  return (
    <div className="grid gap-3">
      <RecordStatusBar
        label={t("invoice.steps")}
        steps={INVOICE_MAIN_PATH.map((status) => ({
          id: status,
          label: statuses.byId.get(status)?.label ?? status,
        }))}
        current={invoice.status}
      />
      <PeriodLockBanner
        date={invoice.date}
        hint={t("invoice.periodLockHint")}
      />
      <DocumentActionBar
        resource={INVOICES}
        record={invoice}
        transitions={transitions}
        compare={compare}
        lockedReason={lockedReason}
        // Виправлена копія чи сторно — нова картка: фокус на її заголовок ставить перехід.
        onCreated={(created: RaRecord) => {
          void navigate(invoiceDocumentPaths(paths).record(String(created.id)))
        }}
      />
    </div>
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
  const statuses = useInvoiceStatuses()
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
          content: <InvoiceParties invoice={invoice} />,
        },
        {
          id: "flow",
          title: t("invoice.sections.flow"),
          content: <InvoiceFlow id={id} />,
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
          <InvoiceStatusBar invoice={invoice} statuses={statuses} />
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
