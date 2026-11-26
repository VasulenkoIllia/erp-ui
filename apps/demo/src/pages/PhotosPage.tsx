import { useEffect, useRef, useState } from "react"

import { useFileSizeText } from "@/registry/erp/file-drop"
import { PhotoGallery } from "@/registry/erp/photo-gallery"
import { PhotoInput } from "@/registry/erp/photo-input"
import { usePhotoChoice } from "@/registry/hooks/use-photo-choice"
import { encodeChosenPhoto } from "@/registry/lib/photo-choice"
import { fullRect, outputSize } from "@/registry/lib/photo-frame"
import { Button } from "@/registry/ui/button"
import { Input } from "@/registry/ui/input"
import { Label } from "@/registry/ui/label"
import { useDemoTranslation } from "@/i18n"
import { ukPhotosPage } from "@/i18n/pages"

import { PageHeader } from "./PageHeader"
import { PhotosGridSection, RankBadge } from "./photos-grid-section"
import { demoProducts } from "./photos-model"
import { Section } from "./Section"

interface SentPhoto {
  url: string
  width: number
  height: number
  bytes: number
}

type Request =
  | { kind: "idle" }
  | { kind: "waiting" }
  | { kind: "sent"; photos: SentPhoto[] }
  | { kind: "failed"; message: string }

/** Що отримав би сервер: JPEG кожного фото в рамці. Адреси прев'ю відкликаються з новим запитом і з виходом. */
function useSentPreviews(request: Request) {
  useEffect(() => {
    if (request.kind !== "sent") return
    return () => {
      for (const photo of request.photos) URL.revokeObjectURL(photo.url)
    }
  }, [request])
}

function RequestResult({ request }: { request: Request }) {
  const { t } = useDemoTranslation([ukPhotosPage], {
    keyPrefix: "photosPage.input",
  })
  const sizeOf = useFileSizeText()
  useSentPreviews(request)
  if (request.kind === "idle") return null
  if (request.kind === "waiting") return <p>{t("waiting")}</p>
  if (request.kind === "failed")
    return (
      <p className="text-destructive">
        {t("failed", { message: request.message })}
      </p>
    )
  if (!request.photos.length) return <p>{t("noPhotos")}</p>
  return (
    <div className="space-y-2">
      <p>{t("sent", { count: request.photos.length })}</p>
      <ul className="flex flex-wrap gap-3">
        {request.photos.map((photo, index) => (
          <li key={photo.url} className="w-32 space-y-1 text-xs">
            <img
              src={photo.url}
              alt={t("resultAlt", { index: index + 1 })}
              className="h-24 w-full rounded-md border object-contain"
            />
            <span data-testid="photo-sent">
              {t("result", {
                index: index + 1,
                width: photo.width,
                height: photo.height,
                size: sizeOf(photo.bytes),
              })}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Поле фото й «Шукати», що дочікується фото, які ще читаються. */
function PhotoInputSection() {
  const { t } = useDemoTranslation([ukPhotosPage], {
    keyPrefix: "photosPage.input",
  })
  const photos = usePhotoChoice()
  const [query, setQuery] = useState("")
  const [request, setRequest] = useState<Request>({ kind: "idle" })
  // Сторінку закрили під час стискання: адрес прев'ю не створюємо, їх нікому відкликати.
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const search = async () => {
    setRequest({ kind: "waiting" })
    try {
      const choice = await photos.settled()
      const encoded = await Promise.all(
        choice.photos.map(async (photo) => ({
          blob: await encodeChosenPhoto(photo),
          ...outputSize(photo.crop ?? fullRect(photo)),
        })),
      )
      if (!mounted.current) return
      // Адреси — лише коли стиснулись усі фото: збій одного не лишає адрес інших.
      const sent = encoded.map(({ blob, ...size }) => ({
        url: URL.createObjectURL(blob),
        bytes: blob.size,
        ...size,
      }))
      setRequest({ kind: "sent", photos: sent })
    } catch (error) {
      setRequest({
        kind: "failed",
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return (
    <Section title={t("title")} description={t("description")}>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault()
          void search()
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="photos-query">{t("query")}</Label>
          <Input
            id="photos-query"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
            }}
          />
        </div>
        <PhotoInput photos={photos} label={t("label")} hint={t("hint")} />
        <Button type="submit" disabled={request.kind === "waiting"}>
          {t("search")}
        </Button>
      </form>
      <div aria-live="polite" data-testid="photo-request">
        <RequestResult request={request} />
      </div>
    </Section>
  )
}

function DisabledInputSection() {
  const { t } = useDemoTranslation([ukPhotosPage], {
    keyPrefix: "photosPage.input",
  })
  const photos = usePhotoChoice()
  return (
    <Section title={t("disabledTitle")} description={t("disabledDescription")}>
      <PhotoInput photos={photos} label={t("disabledLabel")} disabled />
    </Section>
  )
}

const [MUG, , BAG, PEN, CAP] = demoProducts(5)

/** Стани перегляду фото: кілька фото з запасним джерелом, одне, жодне не завантажилось, без фото. */
function GallerySection() {
  const { t } = useDemoTranslation([ukPhotosPage], {
    keyPrefix: "photosPage.gallery",
  })
  const cases = [
    { title: t("several"), product: MUG, rank: 1 },
    { title: t("one"), product: CAP, rank: 2 },
    { title: t("failed"), product: BAG, rank: 3 },
    { title: t("none"), product: PEN, rank: 4 },
  ]
  return (
    <Section title={t("title")} description={t("description")}>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-4">
        {cases.map(({ title, product, rank }) =>
          product ? (
            <li key={product.id} className="space-y-2">
              <p className="text-sm font-medium">{title}</p>
              <PhotoGallery
                photos={product.photos}
                name={product.name}
                badge={<RankBadge rank={rank} />}
              />
            </li>
          ) : null,
        )}
      </ul>
    </Section>
  )
}

/** Фото (частина UI11, ADR-0101): поле кількох фото, перегляд фото товару, сітка карток. */
export function PhotosPage() {
  const { t } = useDemoTranslation([ukPhotosPage], { keyPrefix: "photosPage" })
  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} lead={t("lead")} />
      <PhotoInputSection />
      <DisabledInputSection />
      <GallerySection />
      <PhotosGridSection />
    </div>
  )
}
