import * as React from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import type { z } from "zod"

import { ConflictDialog } from "@/registry/erp/conflict-dialog"
import {
  FormField,
  keepFieldFocus,
  UnsavedChangesGuard,
} from "@/registry/erp/form"
import { RichTextField } from "@/registry/erp/rich-text-field"
import type { RichTextHandle } from "@/registry/erp/rich-text-editor"
import { RichTextView } from "@/registry/erp/rich-text-view"
import { useApiErrorMessage } from "@/registry/hooks/use-api-error-message"
import {
  useTimelineBodySchema,
  type TimelineActions,
} from "@/registry/hooks/use-timeline"
import { isApiError } from "@/registry/lib/api"
import { useErpUiT } from "@/registry/lib/i18n"
import {
  toRichText,
  type MentionSearch,
  type RichTextDoc,
} from "@/registry/lib/rich-text"
import { timelineEntrySchema, type TimelineNote } from "@/registry/lib/timeline"
import { Alert, AlertDescription } from "@/registry/ui/alert"
import { Button } from "@/registry/ui/button"
import { Spinner } from "@/registry/ui/spinner"

/**
 * Зміна нотатки просто в стрічці (ADR-0053). Версія береться на момент відкриття: стрічка може
 * оновитись за подією, і нова версія в запиті перезаписала б чужий текст мовчки. Чужа версія дає
 * порівняння (SPEC §8.2), введений текст не губиться.
 */
const parseNote = (value: unknown): TimelineNote | null => {
  const parsed = timelineEntrySchema.safeParse(value)
  return parsed.success && parsed.data.kind === "note" ? parsed.data : null
}

export function TimelineNoteEditor({
  note,
  actions,
  mentions,
  onClose,
}: {
  note: TimelineNote
  actions: TimelineActions
  mentions?: MentionSearch | false
  onClose: () => void
}) {
  const t = useErpUiT()
  const errorText = useApiErrorMessage()
  const [baseVersion] = React.useState(note.version)
  const [error, setError] = React.useState<string | null>(null)
  const [conflict, setConflict] = React.useState<{
    mine: RichTextDoc
    current: TimelineNote
  } | null>(null)
  const schema = useTimelineBodySchema()
  const form = useForm<
    z.input<typeof schema>,
    unknown,
    z.output<typeof schema>
  >({
    mode: "onTouched",
    resolver: zodResolver(schema),
    defaultValues: { body: { ...toRichText(note.body) } },
  })
  const save = async (body: RichTextDoc, version: number) => {
    setError(null)
    setConflict(null)
    try {
      await actions.updateNote(note.id, { version, body })
      onClose()
    } catch (failure) {
      const current =
        isApiError(failure) && failure.status === 409
          ? parseNote(failure.current)
          : null
      // Відповідь загубилась, а запис дійшов: у `current` той самий текст, порівнювати нічого.
      if (current && JSON.stringify(current.body) === JSON.stringify(body)) {
        void actions.refresh()
        onClose()
      } else if (current) setConflict({ mine: body, current })
      else setError(errorText(failure))
    }
  }
  // Меню, з якого відкрили поле, зникло: фокус іде в поле, щойно редактор завантажився.
  const focused = React.useRef(false)
  const focusOnce = React.useCallback((handle: RichTextHandle | null) => {
    if (!handle || focused.current) return
    focused.current = true
    handle.focus()
  }, [])
  const { isDirty, isSubmitting } = form.formState
  return (
    <form
      noValidate
      className="space-y-2"
      onSubmit={(event) => {
        void form.handleSubmit(({ body }) => save(body, baseVersion))(event)
      }}
    >
      {isDirty ? <UnsavedChangesGuard when /> : null}
      {error ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <FormField
        control={form.control}
        name="body"
        label={t("timeline.noteLabel")}
        render={({ field, control, labelId }) => (
          <RichTextField
            {...control}
            aria-labelledby={labelId}
            mentions={mentions}
            value={field.value}
            onChange={field.onChange}
            onBlur={field.onBlur}
            ref={(handle) => {
              field.ref(handle)
              focusOnce(handle)
            }}
          />
        )}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          onMouseDown={keepFieldFocus}
          disabled={isSubmitting}
          focusableWhenDisabled
        >
          {isSubmitting ? <Spinner aria-hidden /> : null}
          {t("timeline.save")}
        </Button>
        <Button
          type="button"
          variant="outline"
          onMouseDown={keepFieldFocus}
          disabled={isSubmitting}
          focusableWhenDisabled
          onClick={onClose}
        >
          {t("timeline.cancel")}
        </Button>
      </div>
      <ConflictDialog
        open={conflict !== null}
        onOpenChange={(open) => {
          if (!open) setConflict(null)
        }}
        fields={[
          {
            key: "body",
            label: t("timeline.noteLabel"),
            mine: <RichTextView value={conflict?.mine} />,
            theirs: <RichTextView value={conflict?.current.body} />,
          },
        ]}
        onOverwrite={() => {
          if (conflict) void save(conflict.mine, conflict.current.version)
        }}
        onReload={() => {
          void actions.refresh()
          onClose()
        }}
      />
    </form>
  )
}
