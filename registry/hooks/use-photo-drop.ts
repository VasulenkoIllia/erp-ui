import * as React from "react"

/**
 * Вставка й перетягування фото для `erp/photo-input` (частина UI11, ADR-0101).
 *
 * - Вставка: зображення з буфера бере поле, яке видно (не прихована вкладка, не за модальним вікном), і
 *   лише коли сторінка на екрані. Текст, вставлений у поле вводу, не перехоплюється.
 * - Перетягування: поле підсвічується лише для файлів; файл, кинутий повз поле, браузер не відкриває
 *   замість сторінки.
 */

/** Вставка йде в поле вводу: текст, скопійований з таблиці чи сторінки, часто несе ще й картинку. */
function isTextPaste(event: ClipboardEvent): boolean {
  const target = event.target
  const isField =
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLInputElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  return isField && Boolean(event.clipboardData?.types.includes("text/plain"))
}

/**
 * Поле видно людині: не `display: none` чи `hidden` (прихована вкладка) і не за модальним вікном.
 * Base UI позначає сторінку під відкритим вікном `data-base-ui-inert`, а не `inert`; `aria-hidden` він
 * ставить вибірково, оминаючи живі регіони, тож поле з ними цієї позначки може не мати.
 */
function isShown(element: HTMLElement): boolean {
  if (document.visibilityState !== "visible") return false
  if (element.closest('[inert], [data-base-ui-inert], [aria-hidden="true"]'))
    return false
  return typeof element.checkVisibility === "function"
    ? element.checkVisibility({ visibilityProperty: true })
    : element.getClientRects().length > 0
}

const imagesOf = (files: FileList | null | undefined) =>
  [...(files ?? [])].filter((file) => file.type.startsWith("image/"))

const hasFiles = (event: DragEvent | React.DragEvent) =>
  Boolean(event.dataTransfer?.types.includes("Files"))

/** Вставка зображень будь-де на сторінці. */
export function usePagePaste(
  zone: React.RefObject<HTMLElement | null>,
  onFiles: (files: File[]) => void,
  enabled: boolean,
) {
  const latest = React.useRef(onFiles)
  React.useLayoutEffect(() => {
    latest.current = onFiles
  })
  React.useEffect(() => {
    if (!enabled) return
    const onPaste = (event: ClipboardEvent) => {
      // Інше поле фото вже взяло цю вставку.
      if (event.defaultPrevented || isTextPaste(event)) return
      if (!zone.current || !isShown(zone.current)) return
      const files = imagesOf(event.clipboardData?.files)
      if (!files.length) return
      event.preventDefault()
      latest.current(files)
    }
    window.addEventListener("paste", onPaste)
    return () => {
      window.removeEventListener("paste", onPaste)
    }
  }, [zone, enabled])
}

/**
 * Файл, кинутий повз поле, браузер не відкриває замість сторінки: курсор показує, що кинути не можна.
 * Інша зона перетягування (вже скасувала подію) і рідне поле файла лишаються зі своєю поведінкою.
 */
function useDropGuard() {
  React.useEffect(() => {
    const guard = (event: DragEvent) => {
      if (event.defaultPrevented || !hasFiles(event)) return
      if (
        event.target instanceof HTMLInputElement &&
        event.target.type === "file"
      )
        return
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = "none"
    }
    window.addEventListener("dragover", guard)
    window.addEventListener("drop", guard)
    return () => {
      window.removeEventListener("dragover", guard)
      window.removeEventListener("drop", guard)
    }
  }, [])
}

/** Перетягування файлів на поле: підсвітка лише для файлів, не для тексту чи посилань. */
export function useDropZone(
  disabled: boolean,
  onFiles: (files: File[]) => void,
) {
  const [dragging, setDragging] = React.useState(false)
  useDropGuard()
  const handlers = {
    onDragOver: (event: React.DragEvent<HTMLElement>) => {
      if (disabled || !hasFiles(event)) return
      event.preventDefault()
      setDragging(true)
    },
    onDragLeave: (event: React.DragEvent<HTMLElement>) => {
      const inside =
        event.relatedTarget instanceof Node &&
        event.currentTarget.contains(event.relatedTarget)
      if (!inside) setDragging(false)
    },
    onDrop: (event: React.DragEvent<HTMLElement>) => {
      setDragging(false)
      if (!hasFiles(event)) return
      event.preventDefault()
      if (!disabled) onFiles([...event.dataTransfer.files])
    },
  }
  return { dragging, handlers }
}
