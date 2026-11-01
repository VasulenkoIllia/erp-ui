import * as React from "react"
import {
  CalendarIcon,
  CheckIcon,
  EllipsisIcon,
  MailIcon,
  PhoneIcon,
  PlusIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react"
import { toast } from "sonner"

import { ConfirmDialog } from "@/registry/erp/confirm-dialog"
import { SectionSkeleton } from "@/registry/erp/page-state"
import { TimelineActivityDialog } from "@/registry/erp/timeline-activity-dialog"
import { useApiErrorMessage } from "@/registry/hooks/use-api-error-message"
import {
  useTimelineActivities,
  type TimelineActions,
} from "@/registry/hooks/use-timeline"
import { announce } from "@/registry/lib/announce"
import { isApiError } from "@/registry/lib/api"
import { todayIn } from "@/registry/lib/dates"
import { useFormat } from "@/registry/lib/format"
import { useErpUiT } from "@/registry/lib/i18n"
import type { TimelineActivity, TimelineTarget } from "@/registry/lib/timeline"
import { useUserTimeZone } from "@/registry/lib/user-timezone"
import { cn } from "@/registry/lib/utils"
import { Badge } from "@/registry/ui/badge"
import { Button } from "@/registry/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/registry/ui/dropdown-menu"
import { Spinner } from "@/registry/ui/spinner"

/**
 * Заплановані дії запису (PF05, ADR-0053): що зробити, до якого дня й хто. Найближчий термін першим,
 * прострочене видно словом, а не лише кольором. Закрита дія зникає зі списку й лишає запис у стрічці;
 * окремий збій цього блоку не ховає решту стрічки (SPEC §8.1, п. 8).
 */
const TYPE_ICONS: Record<string, LucideIcon> = {
  call: PhoneIcon,
  meeting: UsersIcon,
  email: MailIcon,
  task: CheckIcon,
}

const isKnownType = (
  type: string,
): type is "call" | "meeting" | "email" | "task" =>
  Object.hasOwn(TYPE_ICONS, type)

function ActivityRow({
  activity,
  today,
  busy,
  readOnly,
  onDone,
  onEdit,
  onCancel,
}: {
  activity: TimelineActivity
  today: string
  busy: boolean
  readOnly: boolean
  onDone: () => void
  onEdit: () => void
  onCancel: () => void
}) {
  const t = useErpUiT()
  const format = useFormat()
  const isOverdue = activity.dueDate < today
  const Icon = TYPE_ICONS[activity.type] ?? CalendarIcon
  const typeLabel = isKnownType(activity.type)
    ? t(`timeline.activities.types.${activity.type}`)
    : activity.type
  return (
    <li
      data-slot="timeline-activity"
      data-overdue={isOverdue ? true : undefined}
      className="flex flex-wrap items-start gap-x-3 gap-y-2 p-3 @md:flex-nowrap"
    >
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-md",
          isOverdue
            ? "bg-destructive-soft text-destructive-foreground"
            : "bg-muted text-muted-foreground",
        )}
      >
        <Icon aria-hidden className="size-4" />
      </span>
      <div className="min-w-0 flex-1 basis-40 space-y-0.5">
        <p className="text-sm font-medium break-words">
          <bdi>{activity.title}</bdi>
        </p>
        <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          <span>{typeLabel}</span>
          <span title={format.date(activity.dueDate, "date")}>
            {format.relative(activity.dueDate)}
          </span>
          <bdi>{activity.assignee.name}</bdi>
          {isOverdue ? (
            <Badge variant="destructive">
              {t("timeline.activities.overdue")}
            </Badge>
          ) : null}
        </p>
      </div>
      {readOnly ? null : (
        <div className="flex shrink-0 items-center gap-1 ps-11 @md:ps-0">
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            focusableWhenDisabled
            aria-label={t("timeline.activities.doneFor", {
              title: activity.title,
            })}
            onClick={onDone}
          >
            {busy ? <Spinner aria-hidden /> : <CheckIcon aria-hidden />}
            {t("timeline.activities.done")}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("timeline.activities.actionsFor", {
                    title: activity.title,
                  })}
                />
              }
            >
              <EllipsisIcon aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={onEdit}>
                {t("timeline.activities.edit")}
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={onCancel}>
                {t("timeline.activities.cancel")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </li>
  )
}

function useActivityClosing(actions: TimelineActions) {
  const t = useErpUiT()
  const errorText = useApiErrorMessage()
  const [closingId, setClosingId] = React.useState<string | null>(null)
  const close = async (
    activity: TimelineActivity,
    status: "done" | "cancelled",
  ) => {
    setClosingId(activity.id)
    try {
      await actions.updateActivity(activity.id, {
        version: activity.version,
        status,
      })
      announce(t("timeline.activities.closed", { title: activity.title }))
    } catch (failure) {
      if (isApiError(failure) && failure.status === 409) {
        toast.error(t("timeline.activities.changed"))
        await actions.refresh()
      } else toast.error(errorText(failure))
    } finally {
      setClosingId(null)
    }
  }
  return { closingId, close }
}

export function TimelineActivities({
  target,
  actions,
  readOnly,
}: {
  target: TimelineTarget
  actions: TimelineActions
  readOnly: boolean
}) {
  const t = useErpUiT()
  const timeZone = useUserTimeZone()
  const query = useTimelineActivities(target)
  const { closingId, close } = useActivityClosing(actions)
  const [editing, setEditing] = React.useState<TimelineActivity | "new" | null>(
    null,
  )
  const [cancelling, setCancelling] = React.useState<TimelineActivity | null>(
    null,
  )
  const headingId = React.useId()
  const addButton = React.useRef<HTMLButtonElement>(null)
  const items = query.data ?? []
  const today = todayIn(timeZone)
  return (
    <section
      aria-labelledby={headingId}
      data-slot="timeline-activities"
      className="space-y-2"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={headingId} className="text-sm font-medium">
          {t("timeline.activities.title")}
        </h3>
        {readOnly ? null : (
          <Button
            ref={addButton}
            size="sm"
            variant="outline"
            onClick={() => {
              setEditing("new")
            }}
          >
            <PlusIcon aria-hidden />
            {t("timeline.activities.add")}
          </Button>
        )}
      </div>
      {query.isPending ? <SectionSkeleton rows={1} /> : null}
      {query.isError && !query.data ? (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-sm">
          <span>{t("timeline.activities.failed")}</span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              void query.refetch()
            }}
          >
            {t("pageState.error.retry")}
          </Button>
        </div>
      ) : null}
      {query.data && !items.length ? (
        <p className="text-sm text-muted-foreground">
          {t("timeline.activities.empty")}
        </p>
      ) : null}
      {items.length ? (
        <ul
          aria-label={t("timeline.activities.listLabel")}
          className="divide-y rounded-lg border"
        >
          {items.map((activity) => (
            <ActivityRow
              key={activity.id}
              activity={activity}
              today={today}
              busy={closingId === activity.id}
              readOnly={readOnly}
              onDone={() => {
                void close(activity, "done")
              }}
              onEdit={() => {
                setEditing(activity)
              }}
              onCancel={() => {
                setCancelling(activity)
              }}
            />
          ))}
        </ul>
      ) : null}
      {editing ? (
        <TimelineActivityDialog
          activity={editing === "new" ? null : editing}
          actions={actions}
          onClose={() => {
            setEditing(null)
          }}
        />
      ) : null}
      <ConfirmDialog
        open={cancelling !== null}
        title={t("timeline.activities.cancelTitle")}
        description={t("timeline.activities.cancelDescription", {
          title: cancelling?.title,
        })}
        confirmLabel={t("timeline.activities.cancel")}
        cancelLabel={t("timeline.activities.keep")}
        destructive
        returnFocus={() => addButton.current}
        onClose={() => {
          setCancelling(null)
        }}
        onConfirm={async () => {
          if (cancelling) await close(cancelling, "cancelled")
          setCancelling(null)
        }}
      />
    </section>
  )
}
