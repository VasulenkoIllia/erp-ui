import * as React from "react"
import {
  CalendarCheckIcon,
  CircleDotIcon,
  EllipsisIcon,
  LockIcon,
  MailIcon,
  PaperclipIcon,
  PencilLineIcon,
  SendIcon,
  type LucideIcon,
} from "lucide-react"

import { AuditChanges } from "@/registry/erp/audit-changes"
import { useFileSizeText } from "@/registry/erp/file-drop"
import {
  RichTextView,
  type RichTextViewProps,
} from "@/registry/erp/rich-text-view"
import { TimelineNoteEditor } from "@/registry/erp/timeline-note-editor"
import { useRecordDenialReason } from "@/registry/hooks/use-record-access"
import type { TimelineActions } from "@/registry/hooks/use-timeline"
import { useFormat } from "@/registry/lib/format"
import { useErpUiT } from "@/registry/lib/i18n"
import { safeLinkHref, type MentionSearch } from "@/registry/lib/rich-text"
import { type TimelineEntry, type TimelineFile } from "@/registry/lib/timeline"
import { cn } from "@/registry/lib/utils"
import { Badge } from "@/registry/ui/badge"
import { Button } from "@/registry/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/registry/ui/dropdown-menu"

/**
 * Один запис стрічки (PF05, ADR-0053). Нотатка й повідомлення мають різний вигляд, і різницю видно не
 * лише кольором: підпис, значок і рамка. Нотатка — пунктирна рамка й замок, бо її бачить лише команда;
 * повідомлення — суцільна рамка, воно пішло назовні. Решта записів — рядок без рамки.
 */
export type TimelineDeletable = Extract<
  TimelineEntry,
  { kind: "note" | "file" }
>

export interface TimelineEntryItemProps {
  entry: TimelineEntry
  actions: TimelineActions
  readOnly: boolean
  mentions?: MentionSearch | false
  renderMention?: RichTextViewProps["renderMention"]
  onDelete: (entry: TimelineDeletable) => void
}

const MUTED_CHIP = "bg-muted text-muted-foreground"
const MESSAGE_FRAME = "rounded-lg border bg-card p-3"

const LOOKS: Record<
  string,
  { icon: LucideIcon; chip: string; frame?: string }
> = {
  note: {
    icon: LockIcon,
    chip: "bg-warning-soft text-warning-foreground",
    frame: "rounded-lg border border-dashed bg-muted/50 p-3",
  },
  outgoing: {
    icon: SendIcon,
    chip: "bg-info-soft text-info-foreground",
    frame: MESSAGE_FRAME,
  },
  incoming: {
    icon: MailIcon,
    chip: "bg-success-soft text-success-foreground",
    frame: MESSAGE_FRAME,
  },
  change: { icon: PencilLineIcon, chip: MUTED_CHIP },
  file: { icon: PaperclipIcon, chip: MUTED_CHIP },
  activity: { icon: CalendarCheckIcon, chip: MUTED_CHIP },
  other: { icon: CircleDotIcon, chip: MUTED_CHIP },
}

const lookKey = (entry: TimelineEntry) =>
  entry.kind === "message" ? entry.direction : entry.kind

const STATUS_BADGES = {
  queued: "outline",
  sent: "secondary",
  failed: "destructive",
} as const

function EntryKind({ entry }: { entry: TimelineEntry }) {
  const t = useErpUiT()
  return (
    <span className="text-xs text-muted-foreground">
      {t(`timeline.kinds.${lookKey(entry)}`)}
    </span>
  )
}

function EntryTime({ at }: { at: string }) {
  const format = useFormat()
  return (
    <time
      dateTime={at}
      title={format.date(at, "dateTime")}
      className="text-xs text-muted-foreground"
    >
      {format.relative(at)}
    </time>
  )
}

function EntryMenu({
  entry,
  onEdit,
  onDelete,
}: {
  entry: TimelineDeletable
  onEdit?: () => void
  onDelete: () => void
}) {
  const t = useErpUiT()
  const format = useFormat()
  const denial = useRecordDenialReason()
  const editDenied = denial(entry, "update")
  const deleteDenied = denial(entry, "delete")
  const reason = (onEdit ? editDenied : undefined) ?? deleteDenied
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            className="ms-auto"
            aria-label={t("timeline.entryActions", {
              time: format.date(entry.at, "dateTime"),
            })}
          />
        }
      >
        <EllipsisIcon aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {onEdit ? (
          <DropdownMenuItem disabled={Boolean(editDenied)} onClick={onEdit}>
            {t("timeline.edit")}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          variant="destructive"
          disabled={Boolean(deleteDenied)}
          onClick={onDelete}
        >
          {t("timeline.delete")}
        </DropdownMenuItem>
        {reason ? (
          <p className="px-1.5 py-1 text-xs text-muted-foreground">{reason}</p>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function FileLink({ file }: { file: TimelineFile }) {
  const sizeOf = useFileSizeText()
  const href = safeLinkHref(file.url)
  const name = <bdi className="break-all">{file.name}</bdi>
  return (
    <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="min-w-0 underline underline-offset-4"
        >
          {name}
        </a>
      ) : (
        name
      )}
      <span className="text-xs text-muted-foreground">{sizeOf(file.size)}</span>
    </p>
  )
}

function ActivityLine({
  entry,
}: {
  entry: Extract<TimelineEntry, { kind: "activity" }>
}) {
  const t = useErpUiT()
  const { status, title } = entry.activity
  return (
    <p className="text-sm">
      {t(`timeline.activities.${status}`)}: <bdi>{title}</bdi>
    </p>
  )
}

function MessageMeta({
  entry,
}: {
  entry: Extract<TimelineEntry, { kind: "message" }>
}) {
  const t = useErpUiT()
  const { direction, party, status } = entry
  return (
    <>
      {party ? (
        <span className="min-w-0 text-xs text-muted-foreground">
          {t(direction === "outgoing" ? "timeline.to" : "timeline.from", {
            party,
          })}
        </span>
      ) : null}
      {status ? (
        <Badge variant={STATUS_BADGES[status]}>
          {t(`timeline.status.${status}`)}
        </Badge>
      ) : null}
    </>
  )
}

function EntryContent({
  entry,
  renderMention,
}: Pick<TimelineEntryItemProps, "entry" | "renderMention">) {
  switch (entry.kind) {
    case "note":
    case "message":
      return <RichTextView value={entry.body} renderMention={renderMention} />
    case "change":
      return <AuditChanges changes={entry.changes} />
    case "file":
      return <FileLink file={entry.file} />
    case "activity":
      return <ActivityLine entry={entry} />
    case "other":
      return entry.text ? <p className="text-sm">{entry.text}</p> : null
  }
}

export function TimelineEntryItem({
  entry,
  actions,
  readOnly,
  mentions,
  renderMention,
  onDelete,
}: TimelineEntryItemProps) {
  const t = useErpUiT()
  const [isEditing, setIsEditing] = React.useState(false)
  const {
    icon: Icon,
    chip,
    frame,
  } = LOOKS[lookKey(entry)] ?? {
    icon: CircleDotIcon,
    chip: MUTED_CHIP,
  }
  const canChange =
    !readOnly && !isEditing && (entry.kind === "note" || entry.kind === "file")
  return (
    <li
      data-slot="timeline-entry"
      data-kind={entry.kind}
      className="flex items-start gap-3"
    >
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-md",
          chip,
        )}
      >
        <Icon aria-hidden className="size-4" />
      </span>
      <div className={cn("min-w-0 flex-1 space-y-1", frame)}>
        <div className="flex min-h-7 flex-wrap items-center gap-x-2 gap-y-0.5">
          <bdi className="min-w-0 text-sm font-medium break-words">
            {entry.author.name}
          </bdi>
          <EntryKind entry={entry} />
          <EntryTime at={entry.at} />
          {entry.kind === "note" && entry.editedAt ? (
            <span className="text-xs text-muted-foreground">
              {t("timeline.edited")}
            </span>
          ) : null}
          {entry.kind === "message" ? <MessageMeta entry={entry} /> : null}
          {canChange ? (
            <EntryMenu
              entry={entry}
              onEdit={
                entry.kind === "note"
                  ? () => {
                      setIsEditing(true)
                    }
                  : undefined
              }
              onDelete={() => {
                onDelete(entry)
              }}
            />
          ) : null}
        </div>
        {isEditing && entry.kind === "note" ? (
          <TimelineNoteEditor
            note={entry}
            actions={actions}
            mentions={mentions}
            onClose={() => {
              setIsEditing(false)
            }}
          />
        ) : (
          <EntryContent entry={entry} renderMention={renderMention} />
        )}
      </div>
    </li>
  )
}
