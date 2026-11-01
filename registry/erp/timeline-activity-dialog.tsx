import * as React from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"

import {
  ConflictDialog,
  type ConflictField,
} from "@/registry/erp/conflict-dialog"
import { useDateIssueText, DateInput } from "@/registry/erp/date-input"
import { FormField, keepFieldFocus } from "@/registry/erp/form"
import { FormSelect } from "@/registry/erp/form-select"
import { RecordPicker } from "@/registry/erp/record-picker"
import { useApiErrorMessage } from "@/registry/hooks/use-api-error-message"
import { useMe } from "@/registry/hooks/use-me"
import {
  useTimelineRequestId,
  type TimelineActions,
} from "@/registry/hooks/use-timeline"
import { isApiError } from "@/registry/lib/api"
import { addDays, todayIn } from "@/registry/lib/dates"
import { useFormat } from "@/registry/lib/format"
import { useErpUiT } from "@/registry/lib/i18n"
import {
  TIMELINE_ACTIVITY_TYPES,
  timelineActivitySchema,
  type TimelineActivity,
  type TimelineActivityInput,
} from "@/registry/lib/timeline"
import { useUserTimeZone } from "@/registry/lib/user-timezone"
import { Alert, AlertDescription } from "@/registry/ui/alert"
import { Button } from "@/registry/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/registry/ui/dialog"
import { Input } from "@/registry/ui/input"
import { Spinner } from "@/registry/ui/spinner"

/** Нова дія чи зміна наявної (PF05, ADR-0053). Чужа версія дає порівняння значень (SPEC §8.2). */
interface TeamMember {
  id: string
  name?: string
}

const memberName = (member: TeamMember) => member.name ?? member.id

function useActivitySchema() {
  const t = useErpUiT()
  const dateIssue = useDateIssueText()
  return React.useMemo(() => {
    const required = t("timeline.activities.required")
    return z.object({
      type: z.string().min(1, required),
      title: z.string().trim().min(1, required),
      dueDate: z.string().superRefine((value, context) => {
        const issue = value ? dateIssue(value) : required
        if (issue) context.addIssue({ code: "custom", message: issue })
      }),
      assigneeId: z.string().min(1, required),
    })
  }, [t, dateIssue])
}

/** Що розійшлося; у сценарії моку змінилась лише версія, тоді показуємо все, що є у формі. */
function useConflictFields(
  mine: TimelineActivityInput,
  mineAssignee: string,
  theirs: TimelineActivity | null,
): ConflictField[] {
  const t = useErpUiT()
  const format = useFormat()
  if (!theirs) return []
  const dateOf = (value: string) => format.date(value, "date")
  const fields = [
    {
      key: "title",
      label: t("timeline.activities.name"),
      mine: mine.title,
      theirs: theirs.title,
    },
    {
      key: "dueDate",
      label: t("timeline.activities.dueDate"),
      mine: dateOf(mine.dueDate),
      theirs: dateOf(theirs.dueDate),
    },
    {
      key: "assignee",
      label: t("timeline.activities.assignee"),
      mine: mineAssignee,
      theirs: theirs.assignee.name,
    },
  ]
  const different = fields.filter((field) => field.mine !== field.theirs)
  return different.length ? different : fields
}

export function TimelineActivityDialog({
  activity,
  actions,
  onClose,
}: {
  /** `null` — нова дія. */
  activity: TimelineActivity | null
  actions: TimelineActions
  onClose: () => void
}) {
  const t = useErpUiT()
  const errorText = useApiErrorMessage()
  const timeZone = useUserTimeZone()
  const { data: me } = useMe()
  const schema = useActivitySchema()
  const requestIds = useTimelineRequestId()
  const [error, setError] = React.useState<string | null>(null)
  const [conflict, setConflict] = React.useState<TimelineActivity | null>(null)
  const [assigneeName, setAssigneeName] = React.useState(
    activity?.assignee.name ?? me?.name ?? "",
  )
  // Версія на момент відкриття: стрічка може оновитись за подією, поки людина заповнює форму.
  const [baseVersion, setBaseVersion] = React.useState(activity?.version ?? 1)
  const form = useForm<z.input<typeof schema>, unknown, TimelineActivityInput>({
    mode: "onTouched",
    resolver: zodResolver(schema),
    defaultValues: {
      type: activity?.type ?? "task",
      title: activity?.title ?? "",
      dueDate: activity?.dueDate ?? addDays(todayIn(timeZone), 1),
      assigneeId: activity?.assignee.id ?? me?.id ?? "",
    },
  })
  const typeItems: { value: string; label: string }[] =
    TIMELINE_ACTIVITY_TYPES.map((value) => ({
      value,
      label: t(`timeline.activities.types.${value}`),
    }))
  // Вид проекту, якого кіт не знає: лишається у списку, форма його не губить.
  if (activity && !typeItems.some((item) => item.value === activity.type))
    typeItems.push({ value: activity.type, label: activity.type })

  const save = async (values: TimelineActivityInput, version: number) => {
    setError(null)
    setConflict(null)
    try {
      if (activity)
        await actions.updateActivity(activity.id, { ...values, version })
      else
        await actions.addActivity({
          ...values,
          requestId: requestIds.next(JSON.stringify(values)),
        })
      onClose()
    } catch (failure) {
      const current =
        isApiError(failure) && failure.status === 409
          ? timelineActivitySchema.safeParse(failure.current)
          : null
      if (current?.success) {
        setBaseVersion(current.data.version)
        setConflict(current.data)
      } else setError(errorText(failure))
    }
  }
  const values = form.getValues()
  const conflictFields = useConflictFields(values, assigneeName, conflict)
  const { isSubmitting } = form.formState

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent>
        <form
          noValidate
          className="space-y-4"
          onSubmit={(event) => {
            void form.handleSubmit((input) => save(input, baseVersion))(event)
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {t(
                activity
                  ? "timeline.activities.editTitle"
                  : "timeline.activities.newTitle",
              )}
            </DialogTitle>
            <DialogDescription>
              {t("timeline.activities.formDescription")}
            </DialogDescription>
          </DialogHeader>
          {error ? (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <FormField
            control={form.control}
            name="title"
            label={t("timeline.activities.name")}
            render={({ field, control }) => (
              <Input {...field} {...control} autoComplete="off" />
            )}
          />
          <FormField
            control={form.control}
            name="type"
            label={t("timeline.activities.type")}
            render={({ field, control }) => (
              <FormSelect
                {...control}
                items={typeItems}
                value={field.value}
                onValueChange={field.onChange}
                onBlur={field.onBlur}
                ref={field.ref}
              />
            )}
          />
          <FormField
            control={form.control}
            name="dueDate"
            label={t("timeline.activities.dueDate")}
            render={({ field: { onChange, ...field }, control }) => (
              <DateInput {...field} {...control} onValueChange={onChange} />
            )}
          />
          <FormField
            control={form.control}
            name="assigneeId"
            label={t("timeline.activities.assignee")}
            render={({ field, control }) => (
              <RecordPicker<TeamMember>
                {...control}
                resource="users"
                label={t("timeline.activities.assignee")}
                optionLabel={memberName}
                missingLabel={assigneeName}
                value={field.value}
                onValueChange={(id, record) => {
                  field.onChange(id ?? "")
                  if (record) setAssigneeName(memberName(record))
                }}
                onBlur={field.onBlur}
                ref={field.ref}
              />
            )}
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onMouseDown={keepFieldFocus}
              onClick={onClose}
            >
              {t("timeline.cancel")}
            </Button>
            <Button
              type="submit"
              onMouseDown={keepFieldFocus}
              disabled={isSubmitting}
              focusableWhenDisabled
            >
              {isSubmitting ? <Spinner aria-hidden /> : null}
              {t("timeline.activities.save")}
            </Button>
          </DialogFooter>
        </form>
        <ConflictDialog
          open={conflict !== null}
          onOpenChange={(open) => {
            if (!open) setConflict(null)
          }}
          fields={conflictFields}
          onOverwrite={() => {
            if (conflict) void save(form.getValues(), conflict.version)
          }}
          onReload={onClose}
        />
      </DialogContent>
    </Dialog>
  )
}
