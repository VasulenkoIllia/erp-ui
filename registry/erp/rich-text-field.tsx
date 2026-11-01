import * as React from "react"

import { ErrorBoundary } from "@/registry/erp/error-boundary"
import { useLoadingAnnouncement } from "@/registry/erp/page-state"
import type {
  RichTextEditorProps,
  RichTextHandle,
} from "@/registry/erp/rich-text-editor"
import {
  richTextBodyClass,
  richTextFrameClass,
} from "@/registry/erp/rich-text-styles"
import { RichTextView } from "@/registry/erp/rich-text-view"
import { useErpUiT } from "@/registry/lib/i18n"
import { lazyWithPreload } from "@/registry/lib/lazy"
import { cn } from "@/registry/lib/utils"
import { Button } from "@/registry/ui/button"
import { Spinner } from "@/registry/ui/spinner"

/**
 * Поле оформленого тексту зі згадками (UI12, ADR-0052). Tiptap вантажиться окремим чанком, лише коли
 * поле можна змінювати: у `readOnly` і `disabled` редактора немає зовсім, текст показує
 * `erp/rich-text-view`. Перед показом композера за кнопкою — `preloadRichTextEditor()`.
 *
 * - У формі: `aria-labelledby={labelId}` із `render` поля `FormField`, бо `<label for>` не називає
 *   редаговану область; `ref={field.ref}` веде фокус до поля з помилкою.
 * - Обов'язкове поле: `richTextSchema.refine((doc) => !isRichTextEmpty(doc))` з `lib/rich-text`.
 * - Текст, що лишився у формі, видно й під час завантаження чанка, і після його збою.
 */
const SPINNER_DELAY_MS = 1_000

const LazyRichTextEditor = lazyWithPreload<RichTextEditorProps>(() =>
  import("./rich-text-editor").then((module) => module.RichTextEditor),
)

export const preloadRichTextEditor = LazyRichTextEditor.preload

export interface RichTextFieldProps extends Omit<
  RichTextEditorProps,
  "editorRef"
> {
  /** Немає прав на зміну: лишається у фокусі й читається скрінрідером (SPEC §8.3). */
  readOnly?: boolean
  disabled?: boolean
  ref?: React.Ref<RichTextHandle>
}

/** Рядок на місці кнопок: поле не стрибає, коли приходить редактор. */
function ToolbarSlot({ children }: { children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 border-b border-input p-1">
      <div className="h-control" />
      {children}
    </div>
  )
}

function RichTextLoading({
  value,
  className,
}: Pick<RichTextFieldProps, "value" | "className">) {
  const t = useErpUiT()
  useLoadingAnnouncement(t("richText.loading"))
  const [isSlow, setIsSlow] = React.useState(false)
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setIsSlow(true)
    }, SPINNER_DELAY_MS)
    return () => {
      clearTimeout(timer)
    }
  }, [])
  return (
    <div
      aria-busy
      data-slot="rich-text-loading"
      className={cn(richTextFrameClass, className)}
    >
      <ToolbarSlot>
        {isSlow ? <Spinner aria-hidden className="size-4" /> : null}
      </ToolbarSlot>
      <div className={richTextBodyClass}>
        <RichTextView value={value} empty={null} />
      </div>
    </div>
  )
}

function RichTextFailed({
  value,
  retry,
  className,
}: Pick<RichTextFieldProps, "value" | "className"> & { retry: () => void }) {
  const t = useErpUiT()
  return (
    <div
      data-slot="rich-text-failed"
      className={cn(richTextFrameClass, className)}
    >
      <div
        role="alert"
        className="flex flex-wrap items-center justify-between gap-2 border-b border-input p-2 text-sm"
      >
        <span>{t("richText.failed")}</span>
        <Button type="button" size="sm" variant="outline" onClick={retry}>
          {t("pageState.error.retry")}
        </Button>
      </div>
      <div className={richTextBodyClass}>
        <RichTextView value={value} empty={null} />
      </div>
    </div>
  )
}

/** Без редактора: `textbox` лишається тією самою роллю, що й у полі, яке можна змінювати. */
function RichTextStatic({
  id,
  value,
  disabled,
  className,
  "aria-label": label,
  "aria-labelledby": labelledBy,
  "aria-describedby": describedBy,
}: RichTextFieldProps) {
  return (
    <div
      id={id}
      role="textbox"
      aria-multiline
      aria-readonly={disabled ? undefined : true}
      aria-disabled={disabled ? true : undefined}
      aria-label={label}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      tabIndex={disabled ? undefined : 0}
      data-slot="rich-text-field"
      className={cn(
        richTextFrameClass,
        richTextBodyClass,
        "bg-muted focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring dark:bg-muted",
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
    >
      <RichTextView
        value={value}
        empty={null}
        className="text-base md:text-sm"
      />
    </div>
  )
}

export function RichTextField({
  readOnly,
  disabled,
  ref,
  ...props
}: RichTextFieldProps) {
  if (readOnly || disabled)
    return <RichTextStatic {...props} disabled={disabled} />
  const { value, className } = props
  return (
    <ErrorBoundary
      fallback={(retry) => (
        <RichTextFailed value={value} retry={retry} className={className} />
      )}
    >
      <React.Suspense
        fallback={<RichTextLoading value={value} className={className} />}
      >
        <LazyRichTextEditor {...props} editorRef={ref} />
      </React.Suspense>
    </ErrorBoundary>
  )
}
