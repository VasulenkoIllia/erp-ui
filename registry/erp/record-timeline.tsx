import * as React from "react"

import { FormSelect } from "@/registry/erp/form-select"
import type { RichTextHandle } from "@/registry/erp/rich-text-editor"
import type { RichTextViewProps } from "@/registry/erp/rich-text-view"
import { TimelineActivities } from "@/registry/erp/timeline-activities"
import { TimelineComposer } from "@/registry/erp/timeline-composer"
import { FeedLoadState, TimelineFeed } from "@/registry/erp/timeline-feed"
import { TimelineFollowers } from "@/registry/erp/timeline-followers"
import {
  useFeedRefreshState,
  useTimelineActions,
  useTimelineFeed,
  useTimelineRealtime,
} from "@/registry/hooks/use-timeline"
import { useErpUiT } from "@/registry/lib/i18n"
import type { MentionSearch } from "@/registry/lib/rich-text"
import {
  TIMELINE_FILTERS,
  TIMELINE_MAX_FILE_BYTES,
  type TimelineFilter,
  type TimelineTarget,
} from "@/registry/lib/timeline"
import { cn } from "@/registry/lib/utils"
import { Label } from "@/registry/ui/label"
import { Spinner } from "@/registry/ui/spinner"

/**
 * Стрічка запису (UI01, PF05, ADR-0053): нотатки й повідомлення, зміни полів, файли, підписники й
 * заплановані дії на картці запису.
 *
 *   <RecordTimeline resource="invoices" id={record.id} />
 *   <RecordTimeline resource="contacts" id={id} messages={false} />   // проект без пошти
 *
 * - Писати може кожен, хто бачить запис: досить `<ресурс>:read`, окремого права кіт не перевіряє.
 * - Текст показує `RichTextView`, редактор вантажиться лише з полем нового запису.
 * - Стрічка оновлюється за подіями каналу (ADR-0051), без каналу — опитуванням. Контракт — `lib/timeline`.
 * - Стани колекції SPEC §8.1: скелетон, оновлення з видимими даними, «Показати ще», порожньо, нічого не
 *   знайдено, помилка, частковий збій підписників і дій, немає доступу, офлайн, застарілі дані, лише
 *   читання (`readOnly`). Рядок компонент бере в розмір контейнера: ширина картки, а не вікна.
 * - Чернетка належить запису: картка з іншим `id` починає з порожнього поля.
 */
export interface RecordTimelineProps {
  resource: string
  id: string
  /** Режим перегляду: запис закрито, додавати нічого не можна (SPEC §8.1, п. 17). */
  readOnly?: boolean
  /** `false`: у проекта немає пошти, лишаються нотатки, зникає й фільтр повідомлень. */
  messages?: boolean
  /** `false`: файлів немає, ні кнопки, ні фільтра. */
  files?: boolean
  followers?: boolean
  activities?: boolean
  /** Свій пошук людей чи `false`; за замовчуванням довідник `users` (ADR-0052). */
  mentions?: MentionSearch | false
  /** Згадка як посилання на людину. */
  renderMention?: RichTextViewProps["renderMention"]
  maxFileBytes?: number
  /** Назва області для читача екрана: кілька стрічок на сторінці мають відрізнятись. */
  label?: string
  className?: string
}

function FilterSelect({
  filters,
  value,
  onChange,
  isRefreshing,
}: {
  filters: readonly TimelineFilter[]
  value: TimelineFilter
  onChange: (value: TimelineFilter) => void
  isRefreshing: boolean
}) {
  const t = useErpUiT()
  const id = React.useId()
  const items = filters.map((filter) => ({
    value: filter,
    label: t(`timeline.filters.${filter}`),
  }))
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Label htmlFor={id} className="shrink-0">
        {t("timeline.filterLabel")}
      </Label>
      <div className="w-40 min-w-0">
        <FormSelect
          id={id}
          items={items}
          value={value}
          onValueChange={onChange}
        />
      </div>
      {isRefreshing ? (
        <Spinner aria-label={t("timeline.updating")} className="size-4" />
      ) : null}
    </div>
  )
}

function TimelineBody({
  resource,
  id,
  readOnly = false,
  messages = true,
  files = true,
  followers = true,
  activities = true,
  mentions,
  renderMention,
  maxFileBytes = TIMELINE_MAX_FILE_BYTES,
}: RecordTimelineProps) {
  const t = useErpUiT()
  const target = React.useMemo<TimelineTarget>(
    () => ({ resource, id }),
    [resource, id],
  )
  const [filter, setFilter] = React.useState<TimelineFilter>("all")
  const feed = useTimelineFeed(target, filter)
  const actions = useTimelineActions(target)
  const composer = React.useRef<RichTextHandle>(null)
  useTimelineRealtime(target)
  // Поле лишається і тоді, коли інший фільтр не завантажився: чернетка не має зникнути.
  const [isReady, setIsReady] = React.useState(false)
  if (feed.query.data && !isReady) setIsReady(true)
  const { query } = feed
  const { isRefreshing, isSwitching } = useFeedRefreshState(query)
  if (!isReady) return <FeedLoadState query={query} />
  return (
    <>
      {readOnly ? (
        <p className="text-sm text-muted-foreground">
          {t("timeline.readOnly")}
        </p>
      ) : (
        <TimelineComposer
          actions={actions}
          messages={messages}
          files={files}
          mentions={mentions}
          maxFileBytes={maxFileBytes}
          editorRef={composer}
        />
      )}
      {activities ? (
        <TimelineActivities
          target={target}
          actions={actions}
          readOnly={readOnly}
        />
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <FilterSelect
          filters={TIMELINE_FILTERS.filter(
            (item) =>
              (messages || item !== "message") && (files || item !== "file"),
          )}
          value={filter}
          onChange={setFilter}
          isRefreshing={isRefreshing}
        />
        {followers ? (
          <TimelineFollowers
            target={target}
            actions={actions}
            readOnly={readOnly}
          />
        ) : null}
      </div>
      <TimelineFeed
        feed={feed}
        isSwitching={isSwitching}
        filter={filter}
        actions={actions}
        readOnly={readOnly}
        mentions={mentions}
        renderMention={renderMention}
        onResetFilter={() => {
          setFilter("all")
        }}
        onCompose={() => {
          composer.current?.focus()
        }}
      />
    </>
  )
}

export function RecordTimeline({
  label,
  className,
  ...props
}: RecordTimelineProps) {
  const t = useErpUiT()
  return (
    <section
      data-slot="record-timeline"
      aria-label={label ?? t("timeline.title")}
      className={cn("@container space-y-4", className)}
    >
      {/* Інший запис — нова стрічка: чернетка не переходить з картки на картку. */}
      <TimelineBody key={`${props.resource}/${props.id}`} {...props} />
    </section>
  )
}
