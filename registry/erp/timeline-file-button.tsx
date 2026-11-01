import * as React from "react"
import { PaperclipIcon } from "lucide-react"

import { useFileSizeText } from "@/registry/erp/file-drop"
import { useApiErrorMessage } from "@/registry/hooks/use-api-error-message"
import {
  useTimelineRequestId,
  type TimelineActions,
} from "@/registry/hooks/use-timeline"
import { announce } from "@/registry/lib/announce"
import { useErpUiT } from "@/registry/lib/i18n"
import { Alert, AlertDescription } from "@/registry/ui/alert"
import { Button } from "@/registry/ui/button"
import { Spinner } from "@/registry/ui/spinner"

/**
 * Файл у стрічку запису (PF05, ADR-0053): кнопка, далі запис `file` одразу. Файл завантажується
 * окремо від нотатки, тож лишається в записі, навіть якщо текст людина так і не надіслала. Збій
 * показує повтор із тим самим ключем: якщо відповідь загубилась, другого файла не буде. Смуги прогресу
 * немає: `fetch` не каже, скільки байтів пішло.
 */
type UploadFailure = { text: string; file?: File }

export function TimelineFileButton({
  actions,
  maxBytes,
}: {
  actions: TimelineActions
  maxBytes: number
}) {
  const t = useErpUiT()
  const errorText = useApiErrorMessage()
  const sizeOf = useFileSizeText()
  const input = React.useRef<HTMLInputElement>(null)
  const button = React.useRef<HTMLButtonElement>(null)
  const requestIds = useTimelineRequestId()
  const [uploading, setUploading] = React.useState<string | null>(null)
  const [failure, setFailure] = React.useState<UploadFailure | null>(null)

  const upload = async (file: File) => {
    setFailure(null)
    if (file.size > maxBytes) {
      setFailure({
        text: t("timeline.file.tooLarge", { max: sizeOf(maxBytes) }),
      })
      return
    }
    setUploading(file.name)
    announce(t("timeline.file.uploading", { name: file.name }))
    try {
      await actions.uploadFile(
        file,
        requestIds.next(
          [file.name, file.size, file.lastModified].map(String).join("/"),
        ),
      )
      requestIds.clear()
      announce(t("timeline.file.uploaded", { name: file.name }))
    } catch (error) {
      setFailure({
        file,
        text: t("timeline.file.failed", {
          name: file.name,
          reason: errorText(error),
        }),
      })
    } finally {
      setUploading(null)
    }
  }

  return (
    <>
      <input
        ref={input}
        type="file"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        data-testid="timeline-file-input"
        onChange={(event) => {
          const chosen = event.target.files?.[0]
          // Той самий файл ще раз: без скидання подія не прийде.
          event.target.value = ""
          if (chosen) void upload(chosen)
        }}
      />
      <Button
        ref={button}
        type="button"
        variant="outline"
        disabled={uploading !== null}
        focusableWhenDisabled
        onClick={() => input.current?.click()}
      >
        {uploading === null ? (
          <PaperclipIcon aria-hidden />
        ) : (
          <Spinner aria-hidden />
        )}
        {t("timeline.file.add")}
      </Button>
      {uploading === null ? null : (
        <p className="min-w-0 text-sm text-muted-foreground">
          {t("timeline.file.uploading", { name: uploading })}
        </p>
      )}
      {failure ? (
        <Alert variant="destructive" role="alert" className="basis-full">
          <AlertDescription className="flex flex-wrap items-center gap-2">
            <span className="min-w-0 break-words">{failure.text}</span>
            {failure.file ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  button.current?.focus()
                  if (failure.file) void upload(failure.file)
                }}
              >
                {t("pageState.error.retry")}
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                button.current?.focus()
                setFailure(null)
                requestIds.clear()
              }}
            >
              {t("timeline.file.dismiss")}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
    </>
  )
}
