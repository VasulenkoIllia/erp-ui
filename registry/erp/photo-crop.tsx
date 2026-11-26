import * as React from "react"

import { useErpUiT } from "@/registry/lib/i18n"
import { ukPhotos } from "@/registry/lib/i18n-uk-photos"
import type { ChosenPhoto } from "@/registry/lib/photo-choice"
import {
  frameBetween,
  keyboardFrame,
  keyStep,
  MIN_FRAME_SIDE_PX,
  moveFrame,
  resizeFrame,
  type PhotoPoint,
  type PhotoRect,
} from "@/registry/lib/photo-frame"
import { isShortcutKey, SHORTCUTS } from "@/registry/lib/shortcuts"
import { cn } from "@/registry/lib/utils"

/**
 * Обрізання одного фото рамкою (частина UI11, ADR-0101), у самому полі `erp/photo-input`.
 *
 * - Мишею чи пальцем: протягнути рамку в будь-якому напрямку.
 * - Без перетягування (WCAG 2.5.7): торкнутися одного кута, потім другого; Escape скасовує перший.
 * - Рамку веде один вказівник: другий палець на фото рамку не чіпає. Дотик по фото не прокручує
 *   сторінку (`touch-action: none`): фото не вище за 60 % екрана, сторінку прокручують поза ним.
 * - З клавіатури: стрілки зсувають рамку (першим натисканням з'являється рамка на 80 % фото), Shift зі
 *   стрілками змінює її розмір, Delete чи Backspace повертає все фото. Розмір і місце рамки чутно.
 * - Рамка — у пікселях фото, тож не залежить від розміру, у якому фото показано.
 */
export interface PhotoCropProps {
  readonly photo: ChosenPhoto
  readonly onCrop: (crop: PhotoRect | null) => void
  readonly disabled?: boolean
  readonly className?: string
}

interface Drag {
  /** Вказівник, що почав рамку: інші пальці її не змінюють. */
  pointerId: number
  from: PhotoPoint
  to: PhotoPoint
  /** Пікселів фото на MIN_FRAME_SIDE_PX екрана, як фото показано зараз. */
  minSidePx: number
}

const percent = (value: number, total: number) =>
  `${String((value / total) * 100)}%`

/** Пікселів фото на мінімальну сторону рамки на екрані. */
function minSideOf(element: HTMLElement, photoWidth: number): number {
  const width = element.getBoundingClientRect().width
  return width > 0 ? Math.ceil((MIN_FRAME_SIDE_PX * photoWidth) / width) : 1
}

/** Рамка після клавіші; `undefined` — клавіша не для рамки. */
function frameForKey(
  event: React.KeyboardEvent,
  photo: ChosenPhoto,
  minSidePx: number,
): PhotoRect | null | undefined {
  if (event.altKey || event.ctrlKey || event.metaKey) return undefined
  if (isShortcutKey(SHORTCUTS.photoFrameWhole, event.key)) return null
  if (!isShortcutKey(SHORTCUTS.photoFrameMove, event.key)) return undefined
  if (!photo.crop) return keyboardFrame(photo)
  const step = keyStep(photo)
  const [dx, dy] = {
    ArrowLeft: [-step, 0],
    ArrowRight: [step, 0],
    ArrowUp: [0, -step],
    ArrowDown: [0, step],
  }[event.key] ?? [0, 0]
  return event.shiftKey
    ? resizeFrame(photo.crop, dx, dy, photo, minSidePx)
    : moveFrame(photo.crop, dx, dy, photo)
}

/** Що чути про рамку: розмір і місце в пікселях фото. */
function useFrameText(photo: ChosenPhoto) {
  const t = useErpUiT(ukPhotos)
  const { crop } = photo
  return crop
    ? t("photos.crop.frame", {
        width: crop.width,
        height: crop.height,
        x: crop.x,
        y: crop.y,
        photoWidth: photo.width,
        photoHeight: photo.height,
      })
    : t("photos.crop.whole", { width: photo.width, height: photo.height })
}

export function PhotoCrop({
  photo,
  onCrop,
  disabled = false,
  className,
}: PhotoCropProps) {
  const t = useErpUiT(ukPhotos)
  const [drag, setDrag] = React.useState<Drag | null>(null)
  const [corner, setCorner] = React.useState<PhotoPoint | null>(null)
  // Текст живого регіону — лише після дії з клавіатури чи кута, не на кожному кадрі перетягування.
  const [spoken, setSpoken] = React.useState("")
  const hintId = React.useId()
  const frameText = useFrameText(photo)

  const pointOf = (event: React.PointerEvent<HTMLDivElement>): PhotoPoint => {
    const box = event.currentTarget.getBoundingClientRect()
    return {
      x: ((event.clientX - box.left) / box.width) * photo.width,
      y: ((event.clientY - box.top) / box.height) * photo.height,
    }
  }

  const finishClick = (point: PhotoPoint, minSidePx: number) => {
    if (!corner) {
      setCorner(point)
      setSpoken(t("photos.crop.corner"))
      return
    }
    setCorner(null)
    setSpoken("")
    const frame = frameBetween(corner, point, photo, minSidePx)
    if (frame) onCrop(frame)
  }

  const shown = drag
    ? frameBetween(drag.from, drag.to, photo, drag.minSidePx)
    : photo.crop

  return (
    <div
      className={cn("relative mx-auto w-fit max-w-full", className)}
      data-slot="photo-crop"
    >
      <img
        src={photo.url}
        alt=""
        draggable={false}
        className="block max-h-[min(60dvh,28rem)] max-w-full rounded-md bg-muted select-none" // erp-ui: allow-raw-value — фото не вище за екран: під ним видно мініатюри й кнопки
      />
      {/* role="application": стрілки й Shift зі стрілками керують рамкою, як у редакторах зображень
          (так само erp/avatar-editor). Мишу й дотик дублюють клавіатура й два кути. */}
      {/* eslint-disable-next-line jsx-a11y-x/no-noninteractive-element-interactions -- див. коментар вище */}
      <div
        role="application"
        aria-roledescription={t("photos.crop.role")}
        aria-label={t("photos.crop.area", { name: photo.name })}
        aria-describedby={hintId}
        aria-disabled={disabled || undefined}
        tabIndex={disabled ? -1 : 0}
        data-testid="photo-crop-area"
        className={cn(
          "absolute inset-0 touch-none overflow-hidden rounded-md outline-none select-none focus-visible:ring-2 focus-visible:ring-ring",
          disabled ? "cursor-not-allowed" : "cursor-crosshair",
        )}
        onPointerDown={(event) => {
          if (disabled || drag || event.button !== 0) return
          event.currentTarget.setPointerCapture(event.pointerId)
          const point = pointOf(event)
          setDrag({
            pointerId: event.pointerId,
            from: point,
            to: point,
            minSidePx: minSideOf(event.currentTarget, photo.width),
          })
        }}
        onPointerMove={(event) => {
          if (drag?.pointerId === event.pointerId)
            setDrag({ ...drag, to: pointOf(event) })
        }}
        onPointerUp={(event) => {
          if (drag?.pointerId !== event.pointerId) return
          const point = pointOf(event)
          const frame = frameBetween(drag.from, point, photo, drag.minSidePx)
          setDrag(null)
          if (frame) {
            setCorner(null)
            setSpoken("")
            onCrop(frame)
          } else finishClick(point, drag.minSidePx)
        }}
        onPointerCancel={(event) => {
          if (drag?.pointerId === event.pointerId) setDrag(null)
        }}
        onKeyDown={(event) => {
          if (disabled) return
          if (corner && isShortcutKey(SHORTCUTS.photoCornerCancel, event.key)) {
            // Escape лише скасовує кут: діалог навколо поля не закривається.
            event.preventDefault()
            setCorner(null)
            setSpoken("")
            return
          }
          const minSidePx = minSideOf(event.currentTarget, photo.width)
          const frame = frameForKey(event, photo, minSidePx)
          if (frame === undefined) return
          event.preventDefault()
          setCorner(null)
          onCrop(frame)
          setSpoken("")
        }}
      >
        {shown ? (
          <div
            aria-hidden
            data-slot="photo-crop-frame"
            className="pointer-events-none absolute rounded-sm border-2 border-primary ring-9999 ring-background/60"
            style={{
              left: percent(shown.x, photo.width),
              top: percent(shown.y, photo.height),
              width: percent(shown.width, photo.width),
              height: percent(shown.height, photo.height),
            }}
          />
        ) : null}
        {corner && !drag ? (
          <div
            aria-hidden
            data-slot="photo-crop-corner"
            className="pointer-events-none absolute size-3 -translate-1/2 rounded-full border-2 border-background bg-primary"
            style={{
              left: percent(corner.x, photo.width),
              top: percent(corner.y, photo.height),
            }}
          />
        ) : null}
      </div>
      <p id={hintId} className="sr-only">
        {frameText}. {t("photos.crop.keys")}
      </p>
      <p className="sr-only" aria-live="polite" data-testid="photo-crop-status">
        {spoken || (drag ? "" : frameText)}
      </p>
    </div>
  )
}
