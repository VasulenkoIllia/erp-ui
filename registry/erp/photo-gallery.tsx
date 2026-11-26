import * as React from "react"
import { ImageOffIcon } from "lucide-react"

import { useErpUiT } from "@/registry/lib/i18n"
import { ukPhotos } from "@/registry/lib/i18n-uk-photos"
import { cn } from "@/registry/lib/utils"

/**
 * Перегляд фото товару (частина UI11, ADR-0101): головне фото з мініатюрами й перемиканням, велике — у
 * новій вкладці, запасні джерела, стан «без фото», позначка в куті (місце в результатах).
 *
 * - Джерела фото — по черзі: перше, що завантажилось (своя зменшена копія, потім посилання постачальника).
 *   Жодне не завантажилось — «Фото не завантажилось», картка не лишається з порожньою рамкою.
 * - Фото без жодної адреси не показується; товар без фото — «Без фото».
 * - `loading="lazy"`, `referrerPolicy="no-referrer"`: чужий сервер фото не бачить, з якої сторінки запит.
 * - Велике фото відкривається лише за адресою http(s): адреси приходять від постачальників.
 * - Мініатюра — кнопка з `aria-pressed` і зоною натиску ≥ --touch-min.
 */
export interface GalleryPhoto {
  /** Адреси одного фото в порядку спроб; порожні й повтори пропускаються. */
  readonly sources: readonly (string | null | undefined)[]
  /** Велике фото: посилання відкриває його в новій вкладці. */
  readonly href?: string | null
  readonly key?: string
}

export interface PhotoGalleryProps {
  readonly photos: readonly GalleryPhoto[]
  /** Назва товару: опис головного фото й назва мініатюр. */
  readonly name: string
  /** Позначка в лівому верхньому куті: місце в результатах, «Новинка». */
  readonly badge?: React.ReactNode
  readonly className?: string
}

export interface FallbackImageProps extends Omit<
  React.ComponentProps<"img">,
  "src" | "onError"
> {
  readonly sources: readonly (string | null | undefined)[]
  /** Що показати, коли жодне джерело не завантажилось. */
  readonly fallback?: React.ReactNode
}

/** Адреси без порожніх і повторів: та сама адреса двічі не затримує «Фото не завантажилось». */
const sourcesOf = (sources: FallbackImageProps["sources"]) => [
  ...new Set(sources.filter((source): source is string => Boolean(source))),
]

const hasSource = (photo: GalleryPhoto) => sourcesOf(photo.sources).length > 0

/** Посилання лише http(s), відносне — від адреси сторінки; інша схема — без посилання. */
function webHref(href: string | null | undefined): string | null {
  if (!href) return null
  try {
    const { protocol } = new URL(href, document.baseURI)
    return protocol === "https:" || protocol === "http:" ? href : null
  } catch {
    return null
  }
}

/** Зображення з запасними джерелами: наступне — щойно попереднє не завантажилось. */
export function FallbackImage({
  sources,
  fallback = null,
  alt = "",
  ...props
}: FallbackImageProps) {
  const list = sourcesOf(sources)
  const key = list.join("\n")
  // Спроба прив'язана до набору джерел: нові джерела починають спочатку.
  const [attempt, setAttempt] = React.useState({ key, index: 0 })
  const index = attempt.key === key ? attempt.index : 0
  const src = list[index]
  if (!src) return fallback
  return (
    <img
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      draggable={false}
      {...props}
      key={src}
      src={src}
      alt={alt}
      onError={() => {
        setAttempt({ key, index: index + 1 })
      }}
    />
  )
}

function PhotoPlaceholder({ text }: { text: string }) {
  return (
    <span className="flex flex-col items-center gap-1 p-2 text-center text-sm text-muted-foreground">
      <ImageOffIcon aria-hidden className="size-6" />
      {text}
    </span>
  )
}

export function PhotoGallery({
  photos: allPhotos,
  name,
  badge,
  className,
}: PhotoGalleryProps) {
  const t = useErpUiT(ukPhotos)
  const photos = allPhotos.filter(hasSource)
  const [chosen, setChosen] = React.useState(0)
  const index = Math.min(chosen, Math.max(0, photos.length - 1))
  const photo = photos[index]
  const href = webHref(photo?.href)
  const image = photo ? (
    <FallbackImage
      sources={photo.sources}
      alt={name}
      className="size-full object-contain"
      fallback={<PhotoPlaceholder text={t("photos.gallery.failed")} />}
    />
  ) : (
    <PhotoPlaceholder text={t("photos.gallery.noPhoto")} />
  )

  return (
    <div className={cn("space-y-2", className)} data-slot="photo-gallery">
      <div
        className="relative flex aspect-square items-center justify-center overflow-hidden rounded-md bg-muted"
        data-slot="photo-gallery-frame"
      >
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            referrerPolicy="no-referrer"
            aria-label={t("photos.gallery.open", { name })}
            className="flex size-full items-center justify-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          >
            {image}
          </a>
        ) : (
          image
        )}
        {badge ? (
          <span
            className="absolute top-1 left-1"
            data-slot="photo-gallery-badge"
          >
            {badge}
          </span>
        ) : null}
      </div>
      {photos.length > 1 ? (
        <div
          role="group"
          aria-label={t("photos.gallery.thumbs", { name })}
          className="flex flex-wrap gap-1.5"
        >
          {photos.map((each, position) => (
            <button
              key={each.key ?? `${String(position)}:${each.sources.join(" ")}`}
              type="button"
              aria-label={t("photos.gallery.show", {
                index: position + 1,
                count: photos.length,
              })}
              aria-pressed={position === index}
              className={cn(
                "flex size-11 items-center justify-center overflow-hidden rounded-md border bg-muted p-0.5 outline-none focus-visible:ring-2 focus-visible:ring-ring",
                position === index
                  ? "border-primary ring-1 ring-primary"
                  : "border-border",
              )}
              onClick={() => {
                setChosen(position)
              }}
            >
              <FallbackImage
                sources={each.sources}
                className="size-full object-contain"
                fallback={
                  <ImageOffIcon
                    aria-hidden
                    className="size-4 text-muted-foreground"
                  />
                }
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
