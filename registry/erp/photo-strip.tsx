import * as React from "react"
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine"
import {
  draggable,
  dropTargetForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter"
import { ArrowLeftIcon, ArrowRightIcon, XIcon } from "lucide-react"

import { useErpUiT } from "@/registry/lib/i18n"
import { ukPhotos } from "@/registry/lib/i18n-uk-photos"
import { dropIndex, type ChosenPhoto } from "@/registry/lib/photo-choice"
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
 * - Порядок (`onMove`, ADR-0103): мініатюру перетягують мишею чи довгим натиском на інше місце, риска
 *   показує, куди вона стане; перше фото позначене «головне». Без перетягування — «Раніше» й «Пізніше»
 *   поля (`erp/photo-input`, WCAG 2.5.7).
 */
export interface PhotoStripProps {
  readonly photos: readonly ChosenPhoto[]
  readonly selectedUrl: string | null
  readonly onSelect: (url: string) => void
  readonly onRemove: (photo: ChosenPhoto) => void
  /** Фото на місце `index`; без нього порядок не змінюється. */
  readonly onMove?: (url: string, index: number) => void
  readonly disabled?: boolean
  readonly className?: string
}

export function PhotoStrip({
  photos,
  selectedUrl,
  onSelect,
  onRemove,
  onMove,
  disabled = false,
  className,
}: PhotoStripProps) {
  const t = useErpUiT(ukPhotos)
  const strip = React.useId()
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
          <StripItem
            key={photo.url}
            drag={
              onMove && !disabled && count > 1
                ? { strip, url: photo.url, index, onMove }
                : undefined
            }
          >
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
              {index === 0 && count > 1 ? " " : null}
              {index === 0 && count > 1 ? (
                <Badge variant="outline" className="self-start">
                  {t("photos.strip.main")}
                </Badge>
              ) : null}
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
          </StripItem>
        )
      })}
    </ul>
  )
}

/**
 * «Раніше» й «Пізніше» для показаного фото (ADR-0103): порядок без перетягування (WCAG 2.5.7). На краю
 * кнопка вимкнена, але фокус на ній лишається.
 */
export function PhotoOrder({
  photo,
  index,
  count,
  disabled = false,
  onMove,
}: {
  readonly photo: ChosenPhoto
  readonly index: number
  readonly count: number
  readonly disabled?: boolean
  readonly onMove: (url: string, index: number) => void
}) {
  const t = useErpUiT(ukPhotos)
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || index === 0}
        focusableWhenDisabled={!disabled}
        aria-label={t("photos.input.earlierLabel", { name: photo.name })}
        onClick={() => {
          onMove(photo.url, index - 1)
        }}
      >
        <ArrowLeftIcon aria-hidden />
        {t("photos.input.earlier")}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || index >= count - 1}
        focusableWhenDisabled={!disabled}
        aria-label={t("photos.input.laterLabel", { name: photo.name })}
        onClick={() => {
          onMove(photo.url, index + 1)
        }}
      >
        <ArrowRightIcon aria-hidden />
        {t("photos.input.later")}
      </Button>
    </div>
  )
}

/** Ключ даних мініатюри: смуга бере лише свої фото, а не файли чи картки. */
const PHOTO_KEY = "erp-ui:photo"

interface PhotoDrag {
  strip: string
  url: string
  index: number
}

function photoDragOf(
  data: Record<string | symbol, unknown>,
  strip: string,
): PhotoDrag | undefined {
  const photo = data[PHOTO_KEY]
  if (!photo || typeof photo !== "object") return undefined
  const drag = photo as PhotoDrag
  return drag.strip === strip ? drag : undefined
}

/** Мініатюра, яку перетягують на інше місце; риска з боку, куди вона стане (`data-drop-edge`). */
function StripItem({
  drag,
  children,
}: {
  drag:
    (PhotoDrag & { onMove: (url: string, index: number) => void }) | undefined
  children: React.ReactNode
}) {
  const ref = React.useRef<HTMLLIElement>(null)
  const onMove = React.useRef(drag?.onMove)
  React.useLayoutEffect(() => {
    onMove.current = drag?.onMove
  })
  const { strip, url, index } = drag ?? {}
  React.useEffect(() => {
    const element = ref.current
    if (!element || strip === undefined || url === undefined) return
    const self = { strip, url, index: index ?? 0 }
    const edgeOf = (x: number) => {
      const rect = element.getBoundingClientRect()
      return x < rect.left + rect.width / 2 ? "before" : "after"
    }
    const clear = () => {
      element.removeAttribute("data-drop-edge")
    }
    return combine(
      draggable({
        element,
        getInitialData: () => ({ [PHOTO_KEY]: self }),
        onDragStart: () => {
          element.setAttribute("data-dragging", "")
        },
        onDrop: () => {
          element.removeAttribute("data-dragging")
        },
      }),
      dropTargetForElements({
        element,
        canDrop: ({ source }) => {
          const photo = photoDragOf(source.data, strip)
          return photo !== undefined && photo.url !== url
        },
        onDrag: ({ location }) => {
          element.setAttribute(
            "data-drop-edge",
            edgeOf(location.current.input.clientX),
          )
        },
        onDragLeave: clear,
        onDrop: ({ source, location }) => {
          clear()
          const photo = photoDragOf(source.data, strip)
          if (!photo) return
          const edge = edgeOf(location.current.input.clientX)
          onMove.current?.(photo.url, dropIndex(photo.index, self.index, edge))
        },
      }),
      () => {
        clear()
        element.removeAttribute("data-dragging")
      },
    )
  }, [strip, url, index])
  return (
    <li
      ref={ref}
      className={cn(
        "relative flex w-24 flex-col gap-2 data-dragging:opacity-40",
        // Риска місця — у проміжку між мініатюрами, з того боку, куди стане фото.
        "data-[drop-edge=before]:before:absolute data-[drop-edge=before]:before:inset-y-0 data-[drop-edge=before]:before:-start-2 data-[drop-edge=before]:before:w-0.5 data-[drop-edge=before]:before:rounded-full data-[drop-edge=before]:before:bg-primary",
        "data-[drop-edge=after]:after:absolute data-[drop-edge=after]:after:inset-y-0 data-[drop-edge=after]:after:-end-2 data-[drop-edge=after]:after:w-0.5 data-[drop-edge=after]:after:rounded-full data-[drop-edge=after]:after:bg-primary",
        drag && "cursor-grab [-webkit-touch-callout:none]",
      )}
    >
      {children}
    </li>
  )
}
