/**
 * Вибрані фото поля `erp/photo-input` (частина UI11, ADR-0101): до `max` фото, у кожного своя рамка, одне
 * показане для обрізання. Чисті функції без React: стан тримає `hooks/use-photo-choice`.
 */
import {
  encodePhotoFrame,
  fullRect,
  isSameFrame,
  type PhotoEncodeOptions,
  type PhotoRect,
} from "@/registry/lib/photo-frame"

/** Фото, як його вибрали, до обрізання. Адресу `url` відкликає поле, коли фото прибирають. */
export interface ChosenPhoto {
  /** Адреса `blob:` з `URL.createObjectURL`; вона ж ідентифікатор фото в полі. */
  readonly url: string
  readonly name: string
  /** Відбиток вмісту: те саме фото вдруге не додається. */
  readonly fingerprint: string
  readonly image: HTMLImageElement
  readonly width: number
  readonly height: number
  /** Рамка в пікселях фото; `null` — усе фото. */
  readonly crop: PhotoRect | null
}

export interface PhotoChoice {
  readonly photos: readonly ChosenPhoto[]
  /** Фото в області обрізання; немає чи прибране — останнє. */
  readonly selectedUrl: string | null
}

export const NO_PHOTOS: PhotoChoice = { photos: [], selectedUrl: null }

/** Типова межа кількості фото. */
export const DEFAULT_MAX_PHOTOS = 4

export interface AddedPhotos extends PhotoChoice {
  /** Не вмістились чи вже є: їхні адреси відкликає той, хто додавав. */
  readonly rejected: readonly ChosenPhoto[]
  readonly duplicates: readonly ChosenPhoto[]
}

/** Нові фото по черзі, поки є місце; останнє додане стає показаним. Повтори відкидаються. */
export function addPhotos(
  choice: PhotoChoice,
  added: readonly ChosenPhoto[],
  max = DEFAULT_MAX_PHOTOS,
): AddedPhotos {
  const seen = new Set(choice.photos.map((photo) => photo.fingerprint))
  const fresh: ChosenPhoto[] = []
  const duplicates: ChosenPhoto[] = []
  for (const photo of added) {
    if (seen.has(photo.fingerprint)) duplicates.push(photo)
    else {
      seen.add(photo.fingerprint)
      fresh.push(photo)
    }
  }
  const room = Math.max(0, max - choice.photos.length)
  const kept = fresh.slice(0, room)
  const newest = kept.at(-1)
  return {
    photos: newest ? [...choice.photos, ...kept] : choice.photos,
    selectedUrl: newest ? newest.url : choice.selectedUrl,
    rejected: fresh.slice(room),
    duplicates,
  }
}

/**
 * Без одного фото. Якщо його й показували, показане стає те, що стало на його місце, а за останнім —
 * попереднє: область обрізання не стрибає на перше фото.
 */
export function removePhoto(choice: PhotoChoice, url: string): PhotoChoice {
  const index = choice.photos.findIndex((photo) => photo.url === url)
  if (index < 0) return choice
  const photos = choice.photos.filter((photo) => photo.url !== url)
  if (!photos.length) return NO_PHOTOS
  if (choice.selectedUrl !== url)
    return { photos, selectedUrl: choice.selectedUrl }
  return {
    photos,
    selectedUrl: (photos[index] ?? photos[index - 1])?.url ?? null,
  }
}

/**
 * Фото `url` на місце `index` (0 — перше, головне; ADR-0103). Показане фото те саме; те саме місце лишає
 * вибір тим самим об'єктом.
 */
export function movePhoto(
  choice: PhotoChoice,
  url: string,
  index: number,
): PhotoChoice {
  const from = choice.photos.findIndex((photo) => photo.url === url)
  const to = Math.min(Math.max(index, 0), choice.photos.length - 1)
  const photo = choice.photos[from]
  if (!photo || from === to) return choice
  const photos = choice.photos.filter((each) => each.url !== url)
  photos.splice(to, 0, photo)
  return { ...choice, photos }
}

/** Місце фото з `from`, яке кинули перед фото `over` чи після нього: решта зсувається на його місце. */
export function dropIndex(
  from: number,
  over: number,
  edge: "before" | "after",
): number {
  const target = edge === "before" ? over : over + 1
  return target > from ? target - 1 : target
}

/** Нова рамка фото. Та сама рамка лишає вибір тим самим об'єктом: проект бачить, що нічого не змінилось. */
export function withCrop(
  choice: PhotoChoice,
  url: string,
  crop: PhotoRect | null,
): PhotoChoice {
  const photo = choice.photos.find((each) => each.url === url)
  if (!photo || isSameFrame(photo.crop, crop)) return choice
  return {
    ...choice,
    photos: choice.photos.map((each) =>
      each.url === url ? { ...each, crop } : each,
    ),
  }
}

export function selectedPhoto({
  photos,
  selectedUrl,
}: PhotoChoice): ChosenPhoto | null {
  return (
    photos.find((photo) => photo.url === selectedUrl) ?? photos.at(-1) ?? null
  )
}

/** Фото в рамці — JPEG для запиту (довша сторона до 1024 px, прозоре на білому). */
export function encodeChosenPhoto(
  photo: ChosenPhoto,
  options?: PhotoEncodeOptions,
): Promise<Blob> {
  return encodePhotoFrame(photo.image, photo.crop ?? fullRect(photo), options)
}
