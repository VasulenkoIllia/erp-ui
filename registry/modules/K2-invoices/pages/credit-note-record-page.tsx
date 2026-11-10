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
  useCreditNoteHeader,
  useCreditNotePaletteActions,
} from "../components/credit-note-header"
import {
  DocumentStatusBar,
  useDocumentCompare,
} from "../components/document-status-bar"
import { useDocumentTitle } from "../components/invoice-display"
import { InvoiceFlow } from "../components/invoice-flow"
import { InvoiceLines } from "../components/invoice-lines"
import { InvoiceParties } from "../components/invoice-parties"
import { useDocumentStatuses } from "../components/invoice-statuses"
import {
  CREDIT_NOTES,
  type CreditNote,
  type CreditNoteDetail,
} from "../contract"
import { CREDIT_NOTE_KIND } from "../credit-note-kind"
import type { CreditNoteActionId, CreditNoteSectionId } from "../extension"
import { useInvoicesModule } from "../module-context"
import { useInvoicesT } from "../use-invoices-t"

type CardRecord = CreditNote & Partial<CreditNoteDetail>

/**
 * Картка кредит-ноти на шаблоні Object Page (SPEC §7; ADR-0057, ADR-0069, ADR-0072): шапка з номером,
 * статусом і рахунком-підставою, етапи, смуга закритого періоду над панеллю дій графа, рядки лише для
 * читання з підсумками сервера, сторони, потік документів (рахунок «на підставі»), «Історія» з журналу
 * аудиту чи стрічка зі слота `aside`. Після «Виправити» й «Сторнувати» — картка нової кредит-ноти.
 */
export function CreditNotePage() {
  const { id = "" } = useParams()
  // Без сесії ra-core перенаправить на вхід і повернеться сюди після входу.
  const { isPending } = useAuthenticated()
  // Інша кредит-нота — інша картка: фокус і блокування не переходять від попередньої.
  return isPending ? (
    <PageSkeleton rows={4} />
  ) : (
    <CreditNoteCard key={id} id={id} />
  )
}

function CreditNoteCard({ id }: { id: string }) {
  const t = useInvoicesT()
  const format = useFormat()
  const titleOf = useDocumentTitle(CREDIT_NOTE_KIND)
  const { extension, paths } = useInvoicesModule()
  const noteExtension = extension.creditNotes
  const card = useCardRecord<CardRecord>(CREDIT_NOTES, id)
  const note = card.record
  const heading = usePageHeading(
    note ? titleOf(note) : t("creditNote.title"),
    !card.isPending || card.pageError !== undefined,
  )
  const statuses = useDocumentStatuses(CREDIT_NOTE_KIND)
  const compare = useDocumentCompare<CreditNote>(CREDIT_NOTE_KIND, statuses, {
    key: "date",
    label: t("creditNote.fields.date"),
    show: (seen) => format.date(seen.date, "date"),
  })
  const slots = useRecordSlots<
    CreditNote,
    CreditNoteSectionId,
    CreditNoteActionId
  >({
    record: note,
    resource: CREDIT_NOTES,
    sections: noteExtension?.sections,
    actions: noteExtension?.actions,
    aside: noteExtension?.aside,
  })
  const lock = useEditLock({
    resource: CREDIT_NOTES,
    id,
    enabled: noteExtension?.editLock !== false,
  })
  const header = useCreditNoteHeader(note, statuses, slots.actions, lock)
  useHistoryRefresh(note?.version)
  const sections: (ObjectPageSectionItem & { id: CreditNoteSectionId })[] = note
    ? [
        {
          id: "lines",
          title: t("creditNote.sections.lines"),
          content: (
            <InvoiceLines
              kind={CREDIT_NOTE_KIND}
              invoice={note}
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
          title: t("creditNote.sections.parties"),
          content: <InvoiceParties kind={CREDIT_NOTE_KIND} invoice={note} />,
        },
        {
          id: "flow",
          title: t("creditNote.sections.flow"),
          content: <InvoiceFlow resource={CREDIT_NOTES} id={id} />,
        },
      ]
    : []
  const paletteActions = useCreditNotePaletteActions(note, lock)
  usePaletteActions(
    note ? { title: titleOf(note), actions: paletteActions } : null,
  )
  return (
    <ObjectPage
      title={t("creditNote.title")}
      headingRef={heading}
      back={<BackToList to={paths.creditNotes} label={t("creditNote.back")} />}
      isPending={card.isPending}
      error={card.pageError}
      onRetry={card.retry}
      header={header}
      notice={<EditLockNotice holder={lock.holder} />}
      statusBar={
        note ? (
          <DocumentStatusBar
            kind={CREDIT_NOTE_KIND}
            document={note}
            statuses={statuses}
            compare={compare}
          />
        ) : undefined
      }
      sections={applyKeyedChanges(sections, slots.sections)}
      // Бекенд без журналу змін — картка без «Історії» (`history: false` у розширенні).
      aside={
        slots.aside ??
        (noteExtension?.history === false
          ? undefined
          : {
              label: t("creditNote.history"),
              content: (
                <RecordHistory
                  target={{
                    type: CREDIT_NOTES,
                    id,
                    name: note ? titleOf(note) : undefined,
                  }}
                />
              ),
            })
      }
    />
  )
}
