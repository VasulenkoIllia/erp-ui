import * as React from "react"
import { ImageUpIcon, Trash2Icon } from "lucide-react"

import { useErpUiT } from "@/registry/lib/i18n"
import { isShortcutKey, SHORTCUTS } from "@/registry/lib/shortcuts"
import { Alert, AlertDescription } from "@/registry/ui/alert"
import { Avatar, AvatarFallback, AvatarImage } from "@/registry/ui/avatar"
import { Button } from "@/registry/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/registry/ui/dialog"
import { Slider } from "@/registry/ui/slider"
import { Spinner } from "@/registry/ui/spinner"

/**
 * Фото профілю (ADR-0012): вибір файла, обрізання квадрата (перетягування, масштаб, стрілки й +/− з
 * клавіатури), стиснення в 256×256 WebP на клієнті. Підходить і для логотипа компанії.
 * Сервер отримує вже маленьке зображення — не треба обробляти мегабайтні фото.
 */

const MAX_ZOOM = 3
const KEY_STEP = 10

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("")

interface Crop {
  zoom: number
  /** Зсув лівого верхнього кута зображення відносно рамки, px рамки. */
  x: number
  y: number
}

/** Квадратне зображення з обрізаного фрагмента. */
async function renderCrop(
  image: HTMLImageElement,
  frame: number,
  crop: Crop,
  size: number,
): Promise<Blob> {
  const scale = Math.max(
    frame / image.naturalWidth,
    frame / image.naturalHeight,
  )
  const factor = scale * crop.zoom
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext("2d")
  if (!context) throw new Error("Canvas is not available")
  context.imageSmoothingQuality = "high"
  context.drawImage(
    image,
    -crop.x / factor,
    -crop.y / factor,
    frame / factor,
    frame / factor,
    0,
    0,
    size,
    size,
  )
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/webp", 0.9)
  })
  if (blob) return blob
  // Браузер без WebP — PNG.
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((png) => {
      if (png) resolve(png)
      else reject(new Error("Cannot encode image"))
    }, "image/png")
  })
}

export function AvatarEditor({
  name,
  src,
  onSave,
  onRemove,
  maxBytes = 5 * 1024 * 1024,
  size = 256,
}: {
  /** Ім'я для ініціалів і підпису зображення. */
  name: string
  src?: string
  onSave: (image: Blob) => Promise<void>
  onRemove?: () => Promise<void>
  /** Найбільший файл, який можна вибрати. */
  maxBytes?: number
  /** Сторона готового зображення, px. */
  size?: number
}) {
  const t = useErpUiT()
  const input = React.useRef<HTMLInputElement>(null)
  const [file, setFile] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [removing, setRemoving] = React.useState(false)

  return (
    <div
      className="flex flex-wrap items-center gap-4"
      data-slot="avatar-editor"
    >
      <Avatar className="size-20 text-xl">
        {src ? (
          <AvatarImage src={src} alt={t("profile.photoOf", { name })} />
        ) : null}
        <AvatarFallback>{initials(name)}</AvatarFallback>
      </Avatar>
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              input.current?.click()
            }}
          >
            <ImageUpIcon aria-hidden />
            {src ? t("profile.changePhoto") : t("profile.uploadPhoto")}
          </Button>
          {src && onRemove ? (
            <Button
              type="button"
              variant="ghost"
              disabled={removing}
              onClick={() => {
                setRemoving(true)
                setError(null)
                onRemove()
                  .catch(() => {
                    setError(t("apiErrors.unknown"))
                  })
                  .finally(() => {
                    setRemoving(false)
                  })
              }}
            >
              {removing ? <Spinner aria-hidden /> : <Trash2Icon aria-hidden />}
              {t("profile.removePhoto")}
            </Button>
          ) : null}
        </div>
        <p className="text-sm text-muted-foreground">
          {t("profile.photoHint", {
            size: Math.round(maxBytes / 1024 / 1024),
          })}
        </p>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          data-slot="avatar-file"
          onChange={(event) => {
            const chosen = event.target.files?.[0]
            event.target.value = ""
            if (!chosen) return
            if (!/^image\/(png|jpeg|webp)$/.test(chosen.type)) {
              setError(t("profile.fileType"))
              return
            }
            if (chosen.size > maxBytes) {
              setError(
                t("profile.fileSize", {
                  size: Math.round(maxBytes / 1024 / 1024),
                }),
              )
              return
            }
            setError(null)
            setFile(URL.createObjectURL(chosen))
          }}
        />
      </div>
      {file ? (
        <CropDialog
          src={file}
          size={size}
          onClose={() => {
            URL.revokeObjectURL(file)
            setFile(null)
          }}
          onSave={(blob) =>
            onSave(blob).then(() => {
              URL.revokeObjectURL(file)
              setFile(null)
            })
          }
        />
      ) : null}
    </div>
  )
}

function CropDialog({
  src,
  size,
  onClose,
  onSave,
}: {
  src: string
  size: number
  onClose: () => void
  onSave: (image: Blob) => Promise<void>
}) {
  const t = useErpUiT()
  const frameRef = React.useRef<HTMLDivElement>(null)
  const imageRef = React.useRef<HTMLImageElement>(null)
  const drag = React.useRef<{ x: number; y: number } | null>(null)
  const [frame, setFrame] = React.useState(0)
  const [natural, setNatural] = React.useState<{ w: number; h: number } | null>(
    null,
  )
  const [crop, setCrop] = React.useState<Crop>({ zoom: 1, x: 0, y: 0 })
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useLayoutEffect(() => {
    const element = frameRef.current
    if (!element) return
    const measure = () => {
      setFrame(element.getBoundingClientRect().width)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => {
      observer.disconnect()
    }
  }, [])

  const base =
    natural && frame ? Math.max(frame / natural.w, frame / natural.h) : 1
  const width = (natural?.w ?? 0) * base * crop.zoom
  const height = (natural?.h ?? 0) * base * crop.zoom

  /** Зображення завжди закриває рамку: зсув обмежений. */
  const clamp = React.useCallback(
    (next: Crop): Crop => {
      if (!natural || !frame) return next
      const w = natural.w * base * next.zoom
      const h = natural.h * base * next.zoom
      return {
        zoom: next.zoom,
        x: Math.min(0, Math.max(frame - w, next.x)),
        y: Math.min(0, Math.max(frame - h, next.y)),
      }
    },
    [natural, frame, base],
  )

  /** Масштаб навколо центру рамки. */
  const zoomTo = (zoom: number) => {
    setCrop((current) => {
      const center = frame / 2
      const ratio = zoom / current.zoom
      return clamp({
        zoom,
        x: center - (center - current.x) * ratio,
        y: center - (center - current.y) * ratio,
      })
    })
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("profile.cropTitle")}</DialogTitle>
          <DialogDescription>{t("profile.cropHint")}</DialogDescription>
        </DialogHeader>
        {/* role="application": скрінрідер передає стрілки й +/− області (як у редакторах зображень).
            Альтернативи для перетягування з клавіатури немає, тож правила a11y тут вимкнено свідомо. */}
        {/* eslint-disable-next-line jsx-a11y-x/no-noninteractive-element-interactions -- див. коментар вище */}
        <div
          ref={frameRef}
          role="application"
          aria-roledescription={t("profile.cropRole")}
          // eslint-disable-next-line jsx-a11y-x/no-noninteractive-tabindex -- область керується з клавіатури
          tabIndex={0}
          aria-label={t("profile.cropArea")}
          className="relative mx-auto aspect-square w-full max-w-64 cursor-grab touch-none overflow-hidden rounded-lg bg-muted outline-none select-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId)
            drag.current = { x: event.clientX, y: event.clientY }
          }}
          onPointerMove={(event) => {
            const start = drag.current
            if (!start) return
            const dx = event.clientX - start.x
            const dy = event.clientY - start.y
            drag.current = { x: event.clientX, y: event.clientY }
            setCrop((current) =>
              clamp({ ...current, x: current.x + dx, y: current.y + dy }),
            )
          }}
          onPointerUp={() => {
            drag.current = null
          }}
          onKeyDown={(event) => {
            const moves: Record<string, [number, number]> = {
              ArrowLeft: [KEY_STEP, 0],
              ArrowRight: [-KEY_STEP, 0],
              ArrowUp: [0, KEY_STEP],
              ArrowDown: [0, -KEY_STEP],
            }
            const move = moves[event.key]
            if (move) {
              event.preventDefault()
              setCrop((current) =>
                clamp({
                  ...current,
                  x: current.x + move[0],
                  y: current.y + move[1],
                }),
              )
            } else if (isShortcutKey(SHORTCUTS.avatarZoomIn, event.key)) {
              event.preventDefault()
              zoomTo(Math.min(MAX_ZOOM, crop.zoom + 0.1))
            } else if (isShortcutKey(SHORTCUTS.avatarZoomOut, event.key)) {
              event.preventDefault()
              zoomTo(Math.max(1, crop.zoom - 0.1))
            }
          }}
        >
          <img
            ref={imageRef}
            src={src}
            alt=""
            draggable={false}
            className="pointer-events-none absolute top-0 left-0 max-w-none origin-top-left"
            style={{
              width,
              height,
              transform: `translate(${String(crop.x)}px, ${String(crop.y)}px)`,
            }}
            onLoad={(event) => {
              const image = event.currentTarget
              setNatural({ w: image.naturalWidth, h: image.naturalHeight })
            }}
          />
          {/* Коло — як фото виглядатиме в аватарі; поза ним — затемнення. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-full ring-9999 ring-background/70"
          />
        </div>
        <Slider
          value={[crop.zoom]}
          min={1}
          max={MAX_ZOOM}
          step={0.05}
          thumbLabel={t("profile.zoom")}
          getAriaValueText={(_formatted, value) =>
            `${String(Math.round(value * 100))} %`
          }
          onValueChange={(value: number | readonly number[]) => {
            const next = typeof value === "number" ? value : value[0]
            if (typeof next === "number") zoomTo(next)
          }}
        />
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {t("auth.account.cancel")}
          </Button>
          <Button
            type="button"
            disabled={busy || !natural}
            onClick={() => {
              const image = imageRef.current
              if (!image) return
              setBusy(true)
              setError(null)
              renderCrop(image, frame, crop, size)
                .then(onSave)
                .catch(() => {
                  setError(t("apiErrors.unknown"))
                })
                .finally(() => {
                  setBusy(false)
                })
            }}
          >
            {busy ? <Spinner aria-hidden /> : null}
            {t("profile.savePhoto")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
