import * as React from "react"
import { XIcon } from "lucide-react"

import { useErpUiT } from "@/registry/lib/i18n"
import { ukPhotos } from "@/registry/lib/i18n-uk-photos"
import type { ChosenPhoto } from "@/registry/lib/photo-choice"
import { cn } from "@/registry/lib/utils"
import { Badge } from "@/registry/ui/badge"
import { Button } from "@/registry/ui/button"

/**
 * Смуга мініатюр поля `erp/photo-input` (частина UI11, ADR-0101): назва, позначка «обрізано», вибір фото
 * для обрізання й «Прибрати» в кожного.
 *
 * - «Прибрати» — під мініатюрою, з зоною натиску ≥ --touch-min (`touch-target` кнопки), що не заходить
 *   на саму мініатюру: дотик у кут фото вибирає його, а не прибирає.
 * - Подвійний клік прибирає одне фото: на його місце стає наступне, і другий клік його не чіпає.
 * - Після «Прибрати» фокус — на фото, що стало на це місце, за останнім — на попереднє. Останнє фото
 *   смугу знімає: куди перейде фокус, вирішує той, хто її показує (`erp/photo-input` — «Вибрати фото»).
 */
export interface PhotoStripProps {
  readonly photos: readonly ChosenPhoto[]
  readonly selectedUrl: string | null
  readonly onSelect: (url: string) => void
  readonly onRemove: (photo: ChosenPhoto) => void
  readonly disabled?: boolean
  readonly className?: string
}

export function PhotoStrip({
  photos,
  selectedUrl,
  onSelect,
  onRemove,
  disabled = false,
  className,
}: PhotoStripProps) {
  const t = useErpUiT(ukPhotos)
  const buttons = React.useRef(new Map<string, HTMLButtonElement>())
  // Місце прибраного фото: фокус переходить туди, щойно смуга оновиться.
  const focusIndex = React.useRef<number | null>(null)
  const count = photos.length

  React.useEffect(() => {
    const index = focusIndex.current
    if (index === null) return
    focusIndex.current = null
    const next = photos[Math.min(index, photos.length - 1)]
    if (next) buttons.current.get(next.url)?.focus()
  }, [photos])

  return (
    // role="list": Safari без нього не читає список із list-style: none.
    // eslint-disable-next-line jsx-a11y-x/no-redundant-roles -- див. коментар вище
    <ul
      role="list"
      aria-label={t("photos.strip.label")}
      data-slot="photo-strip"
      className={cn("flex flex-wrap gap-3", className)}
    >
      {photos.map((photo, index) => {
        const isSelected = photo.url === selectedUrl
        return (
          // Проміжок gap-2 ширший за виступ зони натиску «Прибрати» (44 px навколо 28 px).
          <li key={photo.url} className="flex w-24 flex-col gap-2">
            <button
              ref={(element) => {
                if (element) buttons.current.set(photo.url, element)
                else buttons.current.delete(photo.url)
              }}
              type="button"
              aria-pressed={isSelected}
              disabled={disabled}
              className={cn(
                "flex w-full flex-col gap-1 rounded-md border p-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
                isSelected
                  ? "border-primary ring-1 ring-primary"
                  : "border-border",
              )}
              onClick={() => {
                onSelect(photo.url)
              }}
            >
              <img
                src={photo.url}
                alt=""
                draggable={false}
                className="h-16 w-full rounded-sm bg-muted object-cover"
              />
              {/* Назва — з видимого тексту (WCAG 2.5.3): місце фото лише для скрінрідера. */}
              <span className="truncate text-xs text-muted-foreground">
                <span className="sr-only">
                  {t("photos.strip.position", { index: index + 1, count })}
                </span>{" "}
                {photo.name}
              </span>
              {/* Пробіл між назвою й позначкою для назви кнопки; у колонці flex його не видно. */}
              {photo.crop ? " " : null}
              {photo.crop ? (
                <Badge variant="secondary" className="self-start">
                  {t("photos.strip.cropped")}
                </Badge>
              ) : null}
            </button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              aria-label={t("photos.strip.remove", {
                index: index + 1,
                name: photo.name,
              })}
              className="self-start"
              onClick={(event) => {
                // Другий клік подвійного (detail 2) — уже по фото, що стало на це місце.
                if (event.detail > 1) return
                focusIndex.current = index
                onRemove(photo)
              }}
            >
              <XIcon aria-hidden />
              {t("photos.strip.removeShort")}
            </Button>
          </li>
        )
      })}
    </ul>
  )
}
