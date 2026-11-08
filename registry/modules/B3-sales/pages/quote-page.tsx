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

import { useQuoteTitle } from "../components/quote-display"
import {
  useQuoteHeader,
  useQuotePaletteActions,
} from "../components/quote-header"
import { QuoteLines } from "../components/quote-lines"
import {
  useQuoteStatuses,
  useQuoteTransitions,
} from "../components/quote-statuses"
import { QUOTES, type Quote, type QuoteDetail } from "../contract"
import type { QuoteSectionId } from "../extension"
import { useSalesModule } from "../module-context"
import { useSalesT } from "../use-sales-t"

type QuoteCardRecord = Quote & Partial<QuoteDetail>

/** Основний шлях пропозиції для смуги етапів; «Відхилено» й «Скасовано» — бейджем. */
const MAIN_PATH = ["draft", "sent", "accepted"] as const
/** Поля порівняння в конфлікті дії (409): що могла змінити інша людина. */
const COMPARED = ["status", "validUntil", "total"] as const

/**
 * Картка пропозиції на шаблоні Object Page (SPEC §7; ADR-0057, ADR-0062): шапка з номером і статусом,
 * етапи, панель дій графа («Надіслати», відповідь клієнта, «Скасувати», «Виправити»), рядки лише для
 * читання з підсумками сервера, «Історія» з журналу аудиту чи стрічка зі слота `aside` (ADR-0054) —
 * праворуч на широкому, вкладкою на вузькому. Нова пропозиція після «Виправити» — її картка.
 */
export function QuotePage() {
  const { id = "" } = useParams()
  // Без сесії ra-core перенаправить на вхід і повернеться сюди після входу.
  const { isPending } = useAuthenticated()
  // Інша пропозиція — інша картка: фокус і блокування не переходять від попередньої.
  return isPending ? <PageSkeleton rows={4} /> : <QuoteCard key={id} id={id} />
}

/** «Було → стало» дії в конфлікті: статус, строк і сума мовою інтерфейсу. */
function useCompare(statuses: ResolvedStatuses) {
  const t = useSalesT()
  const format = useFormat()
  const show = (key: (typeof COMPARED)[number], quote: Quote) =>
    key === "status"
      ? (statuses.byId.get(quote.status)?.label ?? quote.status)
      : key === "total"
        ? format.money({ amount: quote.total, currency: quote.currency })
        : format.date(quote.validUntil, "date")
  return (seen: Quote, current: Quote): ConflictField[] =>
    COMPARED.filter((key) => seen[key] !== current[key]).map((key) => ({
      key,
      label: t(`quote.fields.${key}`),
      mine: show(key, seen),
      theirs: show(key, current),
    }))
}

/** Етапи основного шляху й панель дій графа під шапкою картки. */
function QuoteStatusBar({
  quote,
  statuses,
}: {
  quote: QuoteCardRecord
  statuses: ResolvedStatuses
}) {
  const t = useSalesT()
  const navigate = useNavigate()
  const { paths } = useSalesModule()
  const transitions = useQuoteTransitions()
  const compare = useCompare(statuses)
  return (
    <div className="grid gap-3">
      <RecordStatusBar
        label={t("quote.steps")}
        steps={MAIN_PATH.map((status) => ({
          id: status,
          label: statuses.byId.get(status)?.label ?? status,
        }))}
        current={quote.status}
      />
      <DocumentActionBar
        resource={QUOTES}
        record={quote}
        transitions={transitions}
        compare={compare}
        // Виправлена копія — нова картка: фокус на її заголовок ставить перехід.
        onCreated={(created: RaRecord) => {
          void navigate(paths.quote(String(created.id)))
        }}
      />
    </div>
  )
}

function QuoteCard({ id }: { id: string }) {
  const t = useSalesT()
  const titleOf = useQuoteTitle()
  const { extension, paths } = useSalesModule()
  const card = useCardRecord<QuoteCardRecord>(QUOTES, id)
  const quote = card.record
  const heading = usePageHeading(
    quote ? titleOf(quote) : t("quote.title"),
    !card.isPending || card.pageError !== undefined,
  )
  const statuses = useQuoteStatuses()
  const slots = useRecordSlots({
    record: quote,
    resource: QUOTES,
    sections: extension.quotes?.sections,
    actions: extension.quotes?.actions,
    aside: extension.quotes?.aside,
  })
  const lock = useEditLock({
    resource: QUOTES,
    id,
    enabled: extension.quotes?.editLock !== false,
  })
  const header = useQuoteHeader(quote, statuses, slots.actions, lock)
  useHistoryRefresh(quote?.version)
  const sections: (ObjectPageSectionItem & { id: QuoteSectionId })[] = quote
    ? [
        {
          id: "lines",
          title: t("quote.sections.lines"),
          content: (
            <QuoteLines
              quote={quote}
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
  const paletteActions = useQuotePaletteActions(quote, lock)
  usePaletteActions(
    quote ? { title: titleOf(quote), actions: paletteActions } : null,
  )
  return (
    <ObjectPage
      title={t("quote.title")}
      headingRef={heading}
      back={<BackToList to={paths.quotes} label={t("quote.back")} />}
      isPending={card.isPending}
      error={card.pageError}
      onRetry={card.retry}
      header={header}
      notice={<EditLockNotice holder={lock.holder} />}
      statusBar={
        quote ? <QuoteStatusBar quote={quote} statuses={statuses} /> : undefined
      }
      sections={shownSections}
      // Бекенд без журналу змін — картка без «Історії» (`history: false` у розширенні).
      aside={
        slots.aside ??
        (extension.quotes?.history === false
          ? undefined
          : {
              label: t("quote.history"),
              content: (
                <RecordHistory
                  target={{
                    type: QUOTES,
                    id,
                    name: quote ? titleOf(quote) : undefined,
                  }}
                />
              ),
            })
      }
    />
  )
}
