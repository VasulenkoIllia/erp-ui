import * as React from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { LockIcon, SendIcon } from "lucide-react"
import { useForm } from "react-hook-form"
import { z } from "zod"

import {
  FormField,
  keepFieldFocus,
  UnsavedChangesGuard,
} from "@/registry/erp/form"
import { RichTextField } from "@/registry/erp/rich-text-field"
import type { RichTextHandle } from "@/registry/erp/rich-text-editor"
import { TimelineFileButton } from "@/registry/erp/timeline-file-button"
import { useApiErrorMessage } from "@/registry/hooks/use-api-error-message"
import {
  useTimelineRequestId,
  type TimelineActions,
} from "@/registry/hooks/use-timeline"
import { isApiError } from "@/registry/lib/api"
import { announce } from "@/registry/lib/announce"
import { useErpUiT } from "@/registry/lib/i18n"
import {
  EMPTY_RICH_TEXT,
  isRichTextEmpty,
  richTextSchema,
  type MentionSearch,
  type RichTextDoc,
} from "@/registry/lib/rich-text"
import type { TimelinePostKind } from "@/registry/lib/timeline"
import { cn } from "@/registry/lib/utils"
import { Alert, AlertDescription } from "@/registry/ui/alert"
import { Button } from "@/registry/ui/button"
import { Spinner } from "@/registry/ui/spinner"
import { Tabs, TabsList, TabsTrigger } from "@/registry/ui/tabs"

/**
 * Поле нової нотатки чи повідомлення (PF05, ADR-0053). За замовчуванням — нотатка, і після надсилання
 * вид повертається до неї: повідомлення йде клієнту, тож випадково написати його не можна. Вид
 * видно кольором, значком, підказкою й назвою кнопки. Текст лишається, поки сервер не прийняв запис.
 */
export interface TimelineComposerProps {
  actions: TimelineActions
  messages: boolean
  files: boolean
  mentions?: MentionSearch | false
  maxFileBytes: number
  editorRef: React.Ref<RichTextHandle>
}

function KindHint({ kind }: { kind: TimelinePostKind }) {
  const t = useErpUiT()
  const Icon = kind === "message" ? SendIcon : LockIcon
  return (
    <span
      className={cn(
        "flex items-center gap-2 rounded-md px-2 py-1 text-sm",
        kind === "message"
          ? "bg-info-soft text-info-foreground"
          : "bg-muted text-muted-foreground",
      )}
    >
      <Icon aria-hidden className="size-4 shrink-0" />
      {t(`timeline.composer.${kind}Hint`)}
    </span>
  )
}

export function TimelineComposer({
  actions,
  messages,
  files,
  mentions,
  maxFileBytes,
  editorRef,
}: TimelineComposerProps) {
  const t = useErpUiT()
  const errorText = useApiErrorMessage()
  const [kind, setKind] = React.useState<TimelinePostKind>("note")
  const [error, setError] = React.useState<string | null>(null)
  const requestIds = useTimelineRequestId()
  const handle = React.useRef<RichTextHandle>(null)
  React.useImperativeHandle(editorRef, () => ({
    focus: () => {
      handle.current?.focus()
    },
  }))
  const schema = React.useMemo(
    () =>
      z.object({
        body: richTextSchema.refine(
          (doc) => !isRichTextEmpty(doc),
          t("timeline.composer.required"),
        ),
      }),
    [t],
  )
  const form = useForm<
    z.input<typeof schema>,
    unknown,
    z.output<typeof schema>
  >({
    mode: "onSubmit",
    resolver: zodResolver(schema),
    defaultValues: { body: { ...EMPTY_RICH_TEXT } },
  })
  const { isDirty, isSubmitting } = form.formState

  const submit = async (body: RichTextDoc) => {
    setError(null)
    try {
      const requestId = requestIds.next(JSON.stringify([kind, body]))
      await actions.post({ requestId, kind, body })
      requestIds.clear()
      form.reset({ body: { ...EMPTY_RICH_TEXT } })
      setKind("note")
      announce(
        t(
          kind === "note"
            ? "timeline.composer.noteAdded"
            : "timeline.composer.messageSent",
        ),
      )
      handle.current?.focus()
    } catch (failure) {
      if (isApiError(failure) && failure.fieldErrors?.body)
        form.setError("body", {
          type: "server",
          message: t("timeline.composer.required"),
        })
      else setError(errorText(failure))
    }
  }

  return (
    <form
      noValidate
      data-slot="timeline-composer"
      data-kind={kind}
      className="space-y-2 rounded-lg border p-3"
      onSubmit={(event) => {
        void form.handleSubmit(({ body }) => submit(body))(event)
      }}
    >
      <UnsavedChangesGuard when={isDirty} />
      {messages ? (
        <Tabs
          value={kind}
          onValueChange={(value) => {
            setKind(value as TimelinePostKind)
          }}
        >
          <TabsList aria-label={t("timeline.composer.kindLabel")}>
            <TabsTrigger value="note">
              {t("timeline.composer.note")}
            </TabsTrigger>
            <TabsTrigger value="message">
              {t("timeline.composer.message")}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      ) : null}
      {error ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <FormField
        control={form.control}
        name="body"
        label={t(`timeline.composer.${kind}Label`)}
        description={<KindHint kind={kind} />}
        render={({ field, control, labelId }) => (
          <RichTextField
            {...control}
            aria-labelledby={labelId}
            mentions={mentions}
            value={field.value}
            onChange={field.onChange}
            onBlur={field.onBlur}
            ref={(editor) => {
              field.ref(editor)
              handle.current = editor
            }}
          />
        )}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="submit"
          onMouseDown={keepFieldFocus}
          disabled={isSubmitting}
          focusableWhenDisabled
        >
          {isSubmitting ? <Spinner aria-hidden /> : null}
          {t(
            kind === "message"
              ? "timeline.composer.send"
              : "timeline.composer.addNote",
          )}
        </Button>
        {files ? (
          <TimelineFileButton actions={actions} maxBytes={maxFileBytes} />
        ) : null}
      </div>
    </form>
  )
}
