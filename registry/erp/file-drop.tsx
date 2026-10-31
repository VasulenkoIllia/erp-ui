import * as React from "react"
import { FileSpreadsheetIcon, UploadIcon, XIcon } from "lucide-react"

import { useFormat } from "@/registry/lib/format"
import { useErpUiT } from "@/registry/lib/i18n"
import { cn } from "@/registry/lib/utils"
import { Button } from "@/registry/ui/button"
import { FieldError } from "@/registry/ui/field"

/**
 * Вибір файла (частина UI11, ADR-0049): перетягування або кнопка.
 *
 * - Кнопка — справжня кнопка, тож клавіатура й скрінрідер працюють без перетягування. На телефоні
 *   перетягнути нема куди: фразу про це сховано, лишається кнопка.
 * - Тип і розмір перевіряються тут: помилка стоїть біля поля, файл не приймається.
 * - Після «Прибрати» фокус повертається на кнопку вибору: кнопка, з якої прибрали, зникає.
 * - Один файл за раз. Кілька файлів, камера, перегляд PDF — коли попросять J7, K3, M1.
 */
export interface FileDropProps {
  readonly label: string
  readonly hint?: string
  /** Як у `accept` поля файла: розширення й типи через кому. */
  readonly accept?: string
  readonly maxBytes?: number
  readonly file: File | null
  readonly onFileChange: (file: File | null) => void
  /** Помилка ззовні: файл не прочитався. */
  readonly error?: string
  readonly disabled?: boolean
  /** Показати поруч із файлом: «Читаємо файл…». */
  readonly status?: React.ReactNode
  readonly className?: string
}

/** Файл підходить під `accept`: за розширенням або типом, зокрема `image/*`. */
export function matchesAccept(file: File, accept: string): boolean {
  const name = file.name.toLowerCase()
  const type = file.type.toLowerCase()
  return accept
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .some((item) => {
      if (item.startsWith(".")) return name.endsWith(item)
      if (item.endsWith("/*")) return type.startsWith(item.slice(0, -1))
      return type === item
    })
}

const BYTES_IN_KB = 1024
const BYTES_IN_MB = 1024 * 1024

export function FileDrop({
  label,
  hint,
  accept,
  maxBytes,
  file,
  onFileChange,
  error,
  disabled = false,
  status,
  className,
}: FileDropProps) {
  const t = useErpUiT()
  const format = useFormat()
  const input = React.useRef<HTMLInputElement>(null)
  const choose = React.useRef<HTMLButtonElement>(null)
  const refocus = React.useRef(false)
  const labelId = React.useId()
  const errorId = React.useId()
  const [dragging, setDragging] = React.useState(false)
  const [rejected, setRejected] = React.useState<string | null>(null)
  const message = rejected ?? error
  const sizeOf = (bytes: number) =>
    bytes < BYTES_IN_MB
      ? t("fileDrop.sizeKb", {
          value: format.number(Math.ceil(bytes / BYTES_IN_KB)),
        })
      : t("fileDrop.sizeMb", {
          value: format.number(bytes / BYTES_IN_MB, {
            maximumFractionDigits: 1,
          }),
        })

  React.useEffect(() => {
    if (!file && refocus.current) choose.current?.focus()
    refocus.current = false
  }, [file])

  const accepted = (next: File) => {
    if (accept && !matchesAccept(next, accept)) {
      setRejected(t("fileDrop.wrongType"))
      return
    }
    if (maxBytes !== undefined && next.size > maxBytes) {
      setRejected(t("fileDrop.tooLarge", { max: sizeOf(maxBytes) }))
      return
    }
    setRejected(null)
    onFileChange(next)
  }

  return (
    <div className={cn("@container space-y-2", className)}>
      {/* eslint-disable-next-line jsx-a11y-x/no-noninteractive-element-interactions -- перетягування лише мишею, клавіатура має кнопку в групі */}
      <div
        role="group"
        aria-labelledby={labelId}
        aria-describedby={message ? errorId : undefined}
        data-slot="file-drop"
        data-dragging={dragging || undefined}
        data-invalid={message ? true : undefined}
        className={cn(
          "flex flex-col items-center gap-3 rounded-lg border border-dashed p-6 text-center transition-colors",
          "data-dragging:border-primary data-dragging:bg-accent",
          "data-invalid:border-destructive",
          disabled && "opacity-60",
        )}
        onDragOver={(event) => {
          if (disabled) return
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={(event) => {
          const inside =
            event.relatedTarget instanceof Node &&
            event.currentTarget.contains(event.relatedTarget)
          if (!inside) setDragging(false)
        }}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          const dropped = event.dataTransfer.files[0]
          if (!disabled && dropped) accepted(dropped)
        }}
      >
        <input
          ref={input}
          type="file"
          accept={accept}
          disabled={disabled}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          data-testid="file-drop-input"
          onChange={(event) => {
            const chosen = event.target.files?.[0]
            // Той самий файл ще раз: без скидання подія не прийде.
            event.target.value = ""
            if (chosen) accepted(chosen)
          }}
        />
        {file ? (
          <>
            <FileSpreadsheetIcon
              aria-hidden
              className="size-8 text-muted-foreground"
            />
            <p className="min-w-0 font-medium break-all">{file.name}</p>
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {status ?? sizeOf(file.size)}
            </p>
          </>
        ) : (
          <>
            <UploadIcon aria-hidden className="size-8 text-muted-foreground" />
            <p id={labelId} className="font-medium">
              {label}
            </p>
            <p className="hidden text-sm text-muted-foreground @md:block">
              {t("fileDrop.dragHere")}
            </p>
            {hint ? (
              <p className="text-sm text-muted-foreground">{hint}</p>
            ) : null}
          </>
        )}
        <div className="flex flex-wrap justify-center gap-2">
          <Button
            ref={choose}
            type="button"
            variant="outline"
            disabled={disabled}
            onClick={() => input.current?.click()}
          >
            {file ? t("fileDrop.replace") : t("fileDrop.choose")}
          </Button>
          {file ? (
            <Button
              type="button"
              variant="ghost"
              disabled={disabled}
              aria-label={t("fileDrop.removeFile", { name: file.name })}
              onClick={() => {
                refocus.current = true
                setRejected(null)
                onFileChange(null)
              }}
            >
              <XIcon aria-hidden />
              {t("fileDrop.remove")}
            </Button>
          ) : null}
        </div>
      </div>
      {file ? (
        <span id={labelId} className="sr-only">
          {label}
        </span>
      ) : null}
      {message ? (
        <FieldError id={errorId} role="alert">
          {message}
        </FieldError>
      ) : null}
    </div>
  )
}
