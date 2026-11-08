import { useAuthenticated, type RaRecord } from "ra-core"
import { useNavigate, useParams } from "react-router"

import type { ConflictField } from "@/components/erp/conflict-dialog"
import { DocumentActionBar } from "@/components/erp/document-action-bar"
import { EditLockNotice } from "@/components/erp/edit-lock-notice"
import { PageSkeleton } from "@/components/erp/page-state"
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

import { useSalesTitle } from "../components/sales-display"
import {
  useSalesHeader,
  useSalesPaletteActions,
} from "../components/sales-header"
import { SalesLines } from "../components/sales-lines"
import {
  useSalesStatuses,
  useSalesTransitions,
} from "../components/sales-statuses"
import type { SalesDocument, SalesDocumentDetail } from "../contract"
import type { SalesDocumentIds } from "../extension"
import { useSalesModule } from "../module-context"
import { ORDER_KIND, QUOTE_KIND, type SalesDocumentKind } from "../sales-kinds"
import { useSalesT } from "../use-sales-t"

type CardRecord<D> = D & Partial<SalesDocumentDetail>

/** Картка пропозиції (ADR-0065). */
export function QuotePage() {
  return <SalesRecordPage kind={QUOTE_KIND} />
}

/** Картка замовлення (ADR-0067). */
export function OrderPage() {
  return <SalesRecordPage kind={ORDER_KIND} />
}

/**
 * Картка документа продажу на шаблоні Object Page (SPEC §7; ADR-0057, ADR-0062): шапка з номером і
 * статусом, етапи, панель дій графа, рядки лише для читання з підсумками сервера, «Історія» з журналу
 * аудиту чи стрічка зі слота `aside` (ADR-0054) — праворуч на широкому, вкладкою на вузькому. Новий
 * документ після «Виправити» — його картка.
 */
function SalesRecordPage<D extends SalesDocument, Due extends string>({
  kind,
}: {
  kind: SalesDocumentKind<D, Due>
}) {
  const { id = "" } = useParams()
  // Без сесії ra-core перенаправить на вхід і повернеться сюди після входу.
  const { isPending } = useAuthenticated()
  // Інший документ — інша картка: фокус і блокування не переходять від попереднього.
  return isPending ? (
    <PageSkeleton rows={4} />
  ) : (
    <SalesCard key={id} kind={kind} id={id} />
  )
}

/** «Було → стало» дії в конфлікті: статус, друга дата й сума мовою інтерфейсу. */
function useCompare<D extends SalesDocument, Due extends string>(
  kind: SalesDocumentKind<D, Due>,
  statuses: ResolvedStatuses,
) {
  const t = useSalesT()
  const format = useFormat()
  const { record } = kind.keys
  const compared = [
    {
      key: "status",
      label: t(`${record}.fields.status`),
      show: (document: D) =>
        statuses.byId.get(document.status)?.label ?? document.status,
    },
    {
      key: kind.due.field,
      label: t(kind.due.label),
      show: (document: D) => format.date(kind.dueOf(document), "date"),
    },
    {
      key: "total",
      label: t(`${record}.fields.total`),
      show: (document: D) =>
        format.money({ amount: document.total, currency: document.currency }),
    },
  ]
  return (seen: D, current: D): ConflictField[] =>
    compared
      .filter(({ show }) => show(seen) !== show(current))
      .map(({ key, label, show }) => ({
        key,
        label,
        mine: show(seen),
        theirs: show(current),
      }))
}

/** Етапи основного шляху й панель дій графа під шапкою картки. */
function SalesStatusBar<D extends SalesDocument, Due extends string>({
  kind,
  document,
  statuses,
}: {
  kind: SalesDocumentKind<D, Due>
  document: CardRecord<D>
  statuses: ResolvedStatuses
}) {
  const t = useSalesT()
  const navigate = useNavigate()
  const { paths } = useSalesModule()
  const transitions = useSalesTransitions(kind)
  const compare = useCompare(kind, statuses)
  return (
    <div className="grid gap-3">
      <RecordStatusBar
        label={t(`${kind.keys.record}.steps`)}
        steps={kind.mainPath.map((status) => ({
          id: status,
          label: statuses.byId.get(status)?.label ?? status,
        }))}
        current={document.status}
      />
      <DocumentActionBar
        resource={kind.resource}
        record={document}
        transitions={transitions}
        compare={compare}
        // Виправлена копія — нова картка: фокус на її заголовок ставить перехід.
        onCreated={(created: RaRecord) => {
          void navigate(kind.pathsOf(paths).record(String(created.id)))
        }}
      />
    </div>
  )
}

function SalesCard<D extends SalesDocument, Due extends string>({
  kind,
  id,
}: {
  kind: SalesDocumentKind<D, Due>
  id: string
}) {
  const t = useSalesT()
  const titleOf = useSalesTitle(kind)
  const { extension, paths } = useSalesModule()
  const documentExtension = kind.extensionOf(extension)
  const { record: keys } = kind.keys
  const card = useCardRecord<CardRecord<D>>(kind.resource, id)
  const document = card.record
  const heading = usePageHeading(
    document ? titleOf(document) : t(`${keys}.title`),
    !card.isPending || card.pageError !== undefined,
  )
  const statuses = useSalesStatuses(kind)
  const slots = useRecordSlots({
    record: document,
    resource: kind.resource,
    sections: documentExtension?.sections,
    actions: documentExtension?.actions,
    aside: documentExtension?.aside,
  })
  const lock = useEditLock({
    resource: kind.resource,
    id,
    enabled: documentExtension?.editLock !== false,
  })
  const header = useSalesHeader(kind, document, statuses, slots.actions, lock)
  useHistoryRefresh(document?.version)
  const sections: (ObjectPageSectionItem & {
    id: SalesDocumentIds<Due>["section"]
  })[] = document
    ? [
        {
          id: "lines",
          title: t(`${keys}.sections.lines`),
          content: (
            <SalesLines
              kind={kind}
              document={document}
              state={{
                isPending: card.isFetching,
                failure: card.failure,
                onRetry: card.retry,
              }}
            />
          ),
        },
      ]
    : []
  const shownSections = applyKeyedChanges(sections, slots.sections)
  const paletteActions = useSalesPaletteActions(kind, document, lock)
  usePaletteActions(
    document ? { title: titleOf(document), actions: paletteActions } : null,
  )
  return (
    <ObjectPage
      title={t(`${keys}.title`)}
      headingRef={heading}
      back={
        <BackToList to={kind.pathsOf(paths).list} label={t(`${keys}.back`)} />
      }
      isPending={card.isPending}
      error={card.pageError}
      onRetry={card.retry}
      header={header}
      notice={<EditLockNotice holder={lock.holder} />}
      statusBar={
        document ? (
          <SalesStatusBar kind={kind} document={document} statuses={statuses} />
        ) : undefined
      }
      sections={shownSections}
      // Бекенд без журналу змін — картка без «Історії» (`history: false` у розширенні).
      aside={
        slots.aside ??
        (documentExtension?.history === false
          ? undefined
          : {
              label: t(`${keys}.history`),
              content: (
                <RecordHistory
                  target={{
                    type: kind.resource,
                    id,
                    name: document ? titleOf(document) : undefined,
                  }}
                />
              ),
            })
      }
    />
  )
}
