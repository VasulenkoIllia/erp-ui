import * as React from "react"
import { renderAsync, type Options } from "docx-preview"

import { cn } from "@/registry/lib/utils"

/**
 * Перегляд файла .docx (UI44, ADR-0087): `docx-preview` (Apache-2.0) малює сам файл, тож перегляд
 * збігається з тим, що людина завантажить. Лише лінивим чанком генератора.
 *
 * - Ізоляція: документ малюється в iframe з `sandbox` без скриптів і з CSP без мережі (лише вбудовані
 *   зображення й шрифти). Стилі документа не торкаються застосунку, а вміст файла — його даних:
 *   вбудований HTML (`altChunk`) не малюється, посилання без адреси, зовнішнього нічого не вантажиться.
 * - Аркуш стискається під ширину (на телефоні A4 не влазить), а не прокручується вбік.
 * - Новий файл, поки малюється попередній, — у черзі: на аркуші завжди один файл, останній.
 * - Тло навколо аркуша — тло застосунку: колірна схема iframe та сама, що в сторінки (інакше браузер
 *   заливає iframe білим у темній темі).
 */
export interface DocxPreviewProps {
  /** Файл для перегляду; `null` — порожньо. */
  readonly file: Blob | null
  /** Назва iframe для скрінрідера: «Перегляд документа «…»». */
  readonly title: string
  readonly onStateChange?: (state: DocxPreviewState) => void
  readonly className?: string
}

export type DocxPreviewState = "idle" | "rendering" | "ready" | "failed"

/** Відступ навколо аркуша в CSS-пікселях iframe. */
const SHEET_GAP_PX = 16

const SHELL = `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'">
<style>html,body{margin:0;background:transparent}body .docx-wrapper{background:transparent;padding:${SHEET_GAP_PX}px;padding-bottom:0}body .docx-wrapper>section.docx{margin-bottom:${SHEET_GAP_PX}px}</style>
</head><body><div data-styles></div><div data-body></div></body></html>`

const RENDER_OPTIONS: Partial<Options> = {
  // Вбудований HTML малювався б у iframe з srcdoc — це вже не документ, а сторінка з файла.
  renderAltChunks: false,
  // Зображення data:, а не blob:, — нічого не треба звільняти після кожного оновлення.
  useBase64URL: true,
  renderComments: false,
  renderChanges: false,
  breakPages: true,
}

function containersOf(frame: HTMLIFrameElement | null) {
  const document = frame?.contentDocument
  const body = document?.querySelector<HTMLElement>("[data-body]")
  const styles = document?.querySelector<HTMLElement>("[data-styles]")
  return document && body && styles ? { document, body, styles } : null
}

/** Аркуш на ширину iframe: стиснути, якщо не влазить. */
function fitSheet(frame: HTMLIFrameElement) {
  const parts = containersOf(frame)
  const sheet = parts?.body.querySelector<HTMLElement>("section.docx")
  if (!parts || !sheet) return
  const available = frame.clientWidth - SHEET_GAP_PX * 2
  const zoom = Math.min(1, available / Math.max(sheet.offsetWidth, 1))
  parts.document.body.style.zoom = String(zoom)
}

function syncColorScheme(frame: HTMLIFrameElement) {
  const root = frame.contentDocument?.documentElement
  if (root) root.style.colorScheme = getComputedStyle(frame).colorScheme
}

/** Посилання з файла не ведуть нікуди: перегляд — не браузер документа. */
function stripLinks(body: HTMLElement) {
  for (const link of body.querySelectorAll("a[href]"))
    link.removeAttribute("href")
}

function useRenderQueue(
  frame: React.RefObject<HTMLIFrameElement | null>,
  report: React.RefObject<((state: DocxPreviewState) => void) | undefined>,
) {
  const pending = React.useRef<Blob | null>(null)
  const isBusy = React.useRef(false)
  const isMounted = React.useRef(true)
  React.useEffect(() => {
    isMounted.current = true
    return () => {
      isMounted.current = false
    }
  }, [])
  return React.useCallback(
    async (file: Blob) => {
      pending.current = file
      if (isBusy.current) return
      isBusy.current = true
      try {
        while (pending.current && isMounted.current) {
          const next = pending.current
          pending.current = null
          const parts = containersOf(frame.current)
          if (!parts || !frame.current) break
          report.current?.("rendering")
          try {
            await renderAsync(next, parts.body, parts.styles, RENDER_OPTIONS)
            stripLinks(parts.body)
            fitSheet(frame.current)
            if (!pending.current) report.current?.("ready")
          } catch {
            parts.body.replaceChildren()
            if (!pending.current) report.current?.("failed")
          }
        }
      } finally {
        isBusy.current = false
      }
    },
    [frame, report],
  )
}

export function DocxPreview({
  file,
  title,
  onStateChange,
  className,
}: DocxPreviewProps) {
  const frame = React.useRef<HTMLIFrameElement>(null)
  const [isLoaded, setLoaded] = React.useState(false)
  // Свіжий обробник без перемальовування файла, коли батько дає нову функцію.
  const report = React.useRef(onStateChange)
  React.useEffect(() => {
    report.current = onStateChange
  })
  const render = useRenderQueue(frame, report)

  React.useEffect(() => {
    const element = frame.current
    if (!isLoaded || !element) return
    syncColorScheme(element)
    const resize = new ResizeObserver(() => {
      fitSheet(element)
    })
    resize.observe(element)
    const theme = new MutationObserver(() => {
      syncColorScheme(element)
    })
    theme.observe(document.documentElement, { attributes: true })
    return () => {
      resize.disconnect()
      theme.disconnect()
    }
  }, [isLoaded])

  React.useEffect(() => {
    if (!isLoaded) return
    if (file) void render(file)
    else {
      containersOf(frame.current)?.body.replaceChildren()
      report.current?.("idle")
    }
  }, [file, isLoaded, render])

  return (
    <iframe
      ref={frame}
      data-slot="docx-preview"
      title={title}
      sandbox="allow-same-origin"
      srcDoc={SHELL}
      onLoad={() => {
        setLoaded(true)
      }}
      className={cn("block size-full border-0 bg-transparent", className)}
    />
  )
}
