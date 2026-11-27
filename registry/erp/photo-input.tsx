import * as React from "react"
import { ImagePlusIcon } from "lucide-react"

import { useFileSizeText } from "@/registry/erp/file-drop"
import { PhotoCrop } from "@/registry/erp/photo-crop"
import { PhotoOrder, PhotoStrip } from "@/registry/erp/photo-strip"
import {
  PHOTO_TYPES,
  type PhotoAddResult,
  type PhotoChoiceState,
  type PhotoRejection,
} from "@/registry/hooks/use-photo-choice"
import { useDropZone, usePagePaste } from "@/registry/hooks/use-photo-drop"
import { announce } from "@/registry/lib/announce"
import { useErpUiT } from "@/registry/lib/i18n"
import { ukPhotos } from "@/registry/lib/i18n-uk-photos"
import {
  movePhoto,
  selectedPhoto,
  type ChosenPhoto,
} from "@/registry/lib/photo-choice"
import {
  fullRect,
  outputSize,
  PHOTO_MAX_SIDE_PX,
} from "@/registry/lib/photo-frame"
import { cn } from "@/registry/lib/utils"
import { Button } from "@/registry/ui/button"
import { FieldError } from "@/registry/ui/field"

/**
 * Поле кількох фото (частина UI11, ADR-0101): вибір кількох файлів, перетягування на поле, вставка
 * скриншота будь-де на сторінці, обрізання кожного фото рамкою (`erp/photo-crop`), смуга мініатюр
 * (`erp/photo-strip`). Стан і файли — `usePhotoChoice` (hooks/use-photo-choice); готовий JPEG —
 * `encodeChosenPhoto` (lib/photo-choice).
 *
 * - Вставка: зображення з буфера, коли поле видно (не прихована вкладка, не за модальним вікном) і
 *   сторінка на екрані. Текст, вставлений у поле вводу, поле фото не перехоплює.
 * - Файл, кинутий повз поле, браузер не відкриває замість сторінки, і коли поле недоступне.
 * - Розмір готового фото задає `encodeChosenPhoto(photo, { maxSidePx })`; `maxSidePx` поля лише
 *   підписує його («На виході…»), тож передайте обом те саме число.
 * - Додане фото озвучується; причини відмови — під полем (`role="alert"`).
 * - Порядок фото (ADR-0103): мініатюри перетягують, а «Раніше» й «Пізніше» під показаним фото пересувають його
 *   без перетягування; перше фото — головне. Нове місце озвучується.
 */
export interface PhotoInputProps {
  readonly photos: PhotoChoiceState
  readonly label: string
  readonly hint?: string
  readonly disabled?: boolean
  /** Довша сторона готового фото для підказки «На виході…» (типово 1024): те саме, що в `encodeChosenPhoto`. */
  readonly maxSidePx?: number
  readonly className?: string
}

/** Тексти відмов: перша причина кожного файла, «забагато» — один раз. */
function useRejectionText(max: number, maxBytes: number) {
  const t = useErpUiT(ukPhotos)
  const sizeOf = useFileSizeText()
  return (rejected: readonly PhotoRejection[]) => {
    const lines = rejected
      .filter((item) => item.reason !== "tooMany")
      .map((item) =>
        t(`photos.input.errors.${item.reason}`, {
          name: item.name,
          size: sizeOf(maxBytes),
        }),
      )
    if (rejected.some((item) => item.reason === "tooMany"))
      lines.push(t("photos.input.errors.tooMany", { count: max }))
    return lines.length ? lines.join(" ") : null
  }
}

interface PhotoHintsProps {
  readonly id: string
  readonly hint: string | undefined
  readonly photo: ChosenPhoto | null
  readonly maxSidePx: number
  readonly max: number
  readonly maxBytes: number
}

/** Підказки поля: свій текст, як обрізати, розмір готового фото, межі. */
function PhotoHints({
  id,
  hint,
  photo,
  maxSidePx,
  max,
  maxBytes,
}: PhotoHintsProps) {
  const t = useErpUiT(ukPhotos)
  const sizeOf = useFileSizeText()
  const output = photo
    ? outputSize(photo.crop ?? fullRect(photo), maxSidePx)
    : null
  return (
    <div id={id} className="space-y-1 text-sm text-muted-foreground">
      {hint ? <p>{hint}</p> : null}
      {photo ? <p>{t("photos.input.cropHint")}</p> : null}
      {output ? (
        <p data-testid="photo-output">
          {t("photos.input.output", {
            width: output.width,
            height: output.height,
          })}
        </p>
      ) : null}
      <p>{t("photos.input.limit", { count: max, size: sizeOf(maxBytes) })}</p>
    </div>
  )
}

export function PhotoInput({
  photos,
  label,
  hint,
  disabled = false,
  maxSidePx = PHOTO_MAX_SIDE_PX,
  className,
}: PhotoInputProps) {
  const t = useErpUiT(ukPhotos)
  const zone = React.useRef<HTMLDivElement>(null)
  const input = React.useRef<HTMLInputElement>(null)
  const choose = React.useRef<HTMLButtonElement>(null)
  const labelId = React.useId()
  const hintId = React.useId()
  const errorId = React.useId()
  const [error, setError] = React.useState<string | null>(null)
  const rejectionText = useRejectionText(photos.max, photos.maxBytes)
  const { value, max, add } = photos
  const count = value.photos.length
  const selected = selectedPhoto(value)
  const selectedIndex = selected ? value.photos.indexOf(selected) : -1
  const isFull = count >= max
  const move = (url: string, index: number) => {
    // Місце те саме (кинули на сусідній край, «Раніше» на першому) — нічого не озвучуємо.
    const next = movePhoto(value, url, index)
    const place = next.photos.findIndex((each) => each.url === url)
    const photo = next.photos[place]
    if (next === value || !photo) return
    photos.move(url, index)
    announce(
      place === 0
        ? t("photos.input.movedMain", { name: photo.name })
        : t("photos.input.moved", {
            name: photo.name,
            index: place + 1,
            count,
          }),
    )
  }

  const report = ({ added, rejected }: PhotoAddResult) => {
    setError(rejectionText(rejected))
    const [first] = added
    if (added.length === 1 && first)
      announce(t("photos.input.added", { name: first.name }))
    else if (added.length > 1)
      announce(t("photos.input.addedSeveral", { count: added.length }))
  }

  const addFiles = (files: readonly File[]) => {
    if (!files.length) return
    setError(null)
    void add(files).then(report)
  }

  usePagePaste(zone, addFiles, !disabled)
  const { dragging, handlers } = useDropZone(disabled, addFiles)

  // Фокус на «Вибрати фото» — після рендеру: при повному полі кнопка ще недоступна.
  const refocus = React.useRef(false)
  const focusChoose = React.useCallback(() => {
    refocus.current = true
  }, [])
  React.useEffect(() => {
    if (!refocus.current) return
    refocus.current = false
    choose.current?.focus()
  })

  const remove = (photo: ChosenPhoto) => {
    setError(null)
    // Без останнього фото смуга зникає разом зі своїм ефектом фокуса.
    if (count === 1) focusChoose()
    photos.remove(photo.url)
    announce(t("photos.input.removed", { name: photo.name }))
  }

  return (
    <div
      className={cn("@container space-y-2", className)}
      data-slot="photo-input"
    >
      <div
        ref={zone}
        role="group"
        aria-labelledby={labelId}
        aria-describedby={error ? `${hintId} ${errorId}` : hintId}
        data-dragging={dragging || undefined}
        data-invalid={error ? true : undefined}
        className={cn(
          "flex flex-col gap-3 rounded-lg border border-dashed p-4 transition-colors",
          "data-dragging:border-primary data-dragging:bg-accent data-invalid:border-destructive",
          disabled && "bg-muted/50",
        )}
        {...handlers}
      >
        <p id={labelId} className="font-medium">
          {label}
        </p>
        {selected ? (
          <PhotoCrop
            key={selected.url}
            photo={selected}
            disabled={disabled}
            onCrop={(crop) => {
              photos.setCrop(selected.url, crop)
            }}
          />
        ) : (
          <div className="flex flex-col items-center gap-2 py-4 text-center text-muted-foreground">
            <ImagePlusIcon aria-hidden className="size-8" />
            {disabled ? null : (
              <p className="hidden text-sm @md:block">
                {t("photos.input.dropHint")}
              </p>
            )}
          </div>
        )}
        {selected && count > 1 ? (
          <PhotoOrder
            photo={selected}
            index={selectedIndex}
            count={count}
            disabled={disabled}
            onMove={move}
          />
        ) : null}
        {count ? (
          <PhotoStrip
            photos={value.photos}
            selectedUrl={selected?.url ?? null}
            disabled={disabled}
            onSelect={photos.select}
            onRemove={remove}
            onMove={move}
          />
        ) : null}
        <PhotoHints
          id={hintId}
          hint={hint}
          photo={selected}
          maxSidePx={maxSidePx}
          max={max}
          maxBytes={photos.maxBytes}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            ref={choose}
            type="button"
            variant="outline"
            disabled={disabled || isFull}
            // Останнє фото, додане з клавіатури, вимикає кнопку: фокус лишається на ній, а не губиться.
            focusableWhenDisabled={!disabled}
            onClick={() => input.current?.click()}
          >
            {count ? t("photos.input.add") : t("photos.input.choose")}
          </Button>
          {selected?.crop ? (
            <Button
              type="button"
              variant="ghost"
              disabled={disabled}
              onClick={() => {
                photos.setCrop(selected.url, null)
              }}
            >
              {t("photos.input.wholePhoto")}
            </Button>
          ) : null}
          {count ? (
            <Button
              type="button"
              variant="ghost"
              disabled={disabled}
              onClick={() => {
                setError(null)
                photos.clear()
                announce(t("photos.input.cleared"))
                focusChoose()
              }}
            >
              {count > 1
                ? t("photos.input.removeAll")
                : t("photos.input.remove")}
            </Button>
          ) : null}
          {/* Живий регіон завжди в DOM, порожній — без місця в рядку кнопок. */}
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {photos.loading
              ? t("photos.input.loading", { count: photos.loading })
              : null}
          </p>
        </div>
        <input
          ref={input}
          type="file"
          accept={PHOTO_TYPES.join(",")}
          multiple
          disabled={disabled}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          data-testid="photo-input-file"
          onChange={(event) => {
            const files = [...(event.target.files ?? [])]
            // Той самий файл ще раз: без скидання подія не прийде.
            event.target.value = ""
            addFiles(files)
          }}
        />
      </div>
      {error ? (
        <FieldError id={errorId} role="alert">
          {error}
        </FieldError>
      ) : null}
    </div>
  )
}
