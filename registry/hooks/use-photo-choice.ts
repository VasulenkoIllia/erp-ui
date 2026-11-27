import * as React from "react"

import {
  addPhotos,
  DEFAULT_MAX_PHOTOS,
  movePhoto,
  NO_PHOTOS,
  removePhoto,
  withCrop,
  type ChosenPhoto,
  type PhotoChoice,
} from "@/registry/lib/photo-choice"
import type { PhotoRect } from "@/registry/lib/photo-frame"

/**
 * Фото поля `erp/photo-input` (частина UI11, ADR-0101): читання файлів, межі, відбитки, адреси `blob:`.
 *
 * - Файл перевіряється тут, бо `accept` діє лише на вікно вибору: перетягнутий чи вставлений теж.
 *   JPEG, PNG і WebP; файл без типу (буває при перетягуванні) пробуємо прочитати. Файл, який браузер не
 *   показує чи показує без розміру (SVG), відхиляється.
 * - Адреса `blob:` відкликається, коли фото прибирають, і коли компонент з хуком зникає; фото, що ще
 *   читаються після «Прибрати всі» чи виходу, відкликаються, щойно прочитаються.
 * - `settled()` дочікується фото, що ще читаються: пошук, запущений під час читання, бере й їх.
 */

/** Типи фото, які приймає поле. */
export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const
/** Фото з телефона — кілька МБ; більший файл частіше помилка, ніж фото. */
export const DEFAULT_MAX_PHOTO_BYTES = 40 * 1024 * 1024

export type PhotoRejectionReason =
  "type" | "size" | "unreadable" | "duplicate" | "tooMany"

export interface PhotoRejection {
  readonly reason: PhotoRejectionReason
  readonly name: string
}

export interface PhotoAddResult {
  readonly added: readonly ChosenPhoto[]
  readonly rejected: readonly PhotoRejection[]
}

export interface PhotoChoiceOptions {
  /** Найбільше фото в полі (типово 4). */
  readonly max?: number
  /** Найбільший файл-джерело, байт (типово 40 МБ). */
  readonly maxBytes?: number
}

export interface PhotoChoiceState {
  readonly value: PhotoChoice
  readonly max: number
  readonly maxBytes: number
  /** Скільки фото ще читається: не більше, ніж було вільних місць. */
  readonly loading: number
  readonly add: (files: readonly File[]) => Promise<PhotoAddResult>
  readonly remove: (url: string) => void
  readonly clear: () => void
  readonly select: (url: string) => void
  readonly setCrop: (url: string, crop: PhotoRect | null) => void
  /** Фото на місце `index` (0 — головне): порядок мініатюр (ADR-0103). */
  readonly move: (url: string, index: number) => void
  /** Вибір, коли всі фото, що читаються зараз, прочитано. */
  readonly settled: () => Promise<PhotoChoice>
}

class PhotoLoadError extends Error {
  override name = "PhotoLoadError"
  readonly reason: PhotoRejectionReason
  constructor(reason: PhotoRejectionReason) {
    super(reason)
    this.reason = reason
  }
}

/** Причина відмови за типом і розміром — до читання файла. */
export function precheckPhoto(
  file: Pick<File, "type" | "size">,
  maxBytes: number,
): PhotoRejectionReason | null {
  if (file.type && !(PHOTO_TYPES as readonly string[]).includes(file.type))
    return "type"
  return file.size > maxBytes ? "size" : null
}

const toHex = (buffer: ArrayBuffer) =>
  Array.from(new Uint8Array(buffer), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")

/**
 * Відбиток вмісту: той самий скриншот, вставлений двічі, має інший час і назву, але ті самі байти. Поза
 * безпечним походженням (http не на localhost) `crypto.subtle` немає — тоді назва, розмір і час.
 */
async function fingerprintOf(file: File): Promise<string> {
  const subtle = globalThis.crypto?.subtle as SubtleCrypto | undefined
  if (!subtle) {
    return `${String(file.size)}:${file.type}:${String(file.lastModified)}:${file.name}`
  }
  return toHex(await subtle.digest("SHA-256", await file.arrayBuffer()))
}

interface Candidate {
  file: File
  fingerprint: string
}

/**
 * Наступні файли черги без повторів, поки їх не стане `room`. Відбиток — по одному файлу: тека з
 * сотнею фото не тримає в пам'яті всі файли разом.
 */
async function nextCandidates(
  queue: File[],
  room: number,
  seen: Set<string>,
  rejected: PhotoRejection[],
): Promise<Candidate[]> {
  const batch: Candidate[] = []
  for (let file = queue.shift(); file; file = queue.shift()) {
    try {
      const fingerprint = await fingerprintOf(file)
      if (seen.has(fingerprint)) {
        rejected.push({ reason: "duplicate", name: file.name })
      } else {
        seen.add(fingerprint)
        batch.push({ file, fingerprint })
      }
    } catch (error) {
      console.error(error)
      rejected.push({ reason: "unreadable", name: file.name })
    }
    if (batch.length >= room) break
  }
  return batch
}

async function decodePhoto({
  file,
  fingerprint,
}: Candidate): Promise<ChosenPhoto> {
  const url = URL.createObjectURL(file)
  const image = new Image()
  image.src = url
  try {
    await image.decode()
  } catch {
    URL.revokeObjectURL(url)
    throw new PhotoLoadError("unreadable")
  }
  if (!image.naturalWidth || !image.naturalHeight) {
    URL.revokeObjectURL(url)
    throw new PhotoLoadError("unreadable")
  }
  return {
    url,
    name: file.name,
    fingerprint,
    image,
    width: image.naturalWidth,
    height: image.naturalHeight,
    crop: null,
  }
}

const revokeAll = (photos: readonly ChosenPhoto[]) => {
  for (const photo of photos) URL.revokeObjectURL(photo.url)
}

/** Причини відмови з результатів читання; не наша помилка — у консоль і «не вдалося прочитати». */
function failuresOf(
  candidates: readonly Candidate[],
  loads: readonly PromiseSettledResult<ChosenPhoto>[],
): PhotoRejection[] {
  return loads.flatMap((load, index) => {
    if (load.status === "fulfilled") return []
    const reason: unknown = load.reason
    if (!(reason instanceof PhotoLoadError)) console.error(reason)
    return [
      {
        reason: reason instanceof PhotoLoadError ? reason.reason : "unreadable",
        name: candidates[index]?.file.name ?? "",
      },
    ]
  })
}

interface ReadContext {
  readonly maxBytes: number
  /** Відбитки вже вибраних фото. */
  readonly known: ReadonlySet<string>
  /** Скільки фото ще вміщається в полі зараз. */
  readonly room: () => number
  /** Читання ще потрібне: після «Прибрати всі» чи виходу — ні. */
  readonly isCurrent: () => boolean
}

interface ReadFiles {
  loaded: ChosenPhoto[]
  rejected: PhotoRejection[]
}

/**
 * Файли по черзі: тип і розмір, відбиток і повтор, потім читання. Одночасно читається не більше фото,
 * ніж вільних місць; файл, який не прочитався, місця не займає — на нього береться наступний. `accept`
 * діє лише на вікно вибору, тож перетягнуті й вставлені файли перевіряються тут.
 */
async function readFiles(
  files: readonly File[],
  { maxBytes, known, room, isCurrent }: ReadContext,
): Promise<ReadFiles> {
  const rejected: PhotoRejection[] = []
  const queue = files.filter((file) => {
    const reason = precheckPhoto(file, maxBytes)
    if (reason) rejected.push({ reason, name: file.name })
    return !reason
  })
  const seen = new Set(known)
  const loaded: ChosenPhoto[] = []
  while (queue.length && isCurrent()) {
    const free = room() - loaded.length
    if (free <= 0) break
    const batch = await nextCandidates(queue, free, seen, rejected)
    const loads = await Promise.allSettled(batch.map(decodePhoto))
    for (const load of loads)
      if (load.status === "fulfilled") loaded.push(load.value)
    rejected.push(...failuresOf(batch, loads))
  }
  for (const file of queue)
    rejected.push({ reason: "tooMany", name: file.name })
  return { loaded, rejected }
}

const reasonOf = (reason: PhotoRejectionReason) => (photo: ChosenPhoto) => ({
  reason,
  name: photo.name,
})

const NOTHING_ADDED: PhotoAddResult = { added: [], rejected: [] }

/** Зміни вибору без читання файлів: прибрати, вибрати, обрізати, переставити. */
function useChoiceEdits(
  latestRef: React.RefObject<PhotoChoice>,
  generationRef: React.RefObject<number>,
  commit: (next: PhotoChoice) => void,
) {
  const remove = React.useCallback(
    (url: string) => {
      if (!latestRef.current.photos.some((photo) => photo.url === url)) return
      URL.revokeObjectURL(url)
      commit(removePhoto(latestRef.current, url))
    },
    [latestRef, commit],
  )

  const clear = React.useCallback(() => {
    generationRef.current += 1
    revokeAll(latestRef.current.photos)
    commit(NO_PHOTOS)
  }, [latestRef, generationRef, commit])

  const select = React.useCallback(
    (url: string) => {
      if (latestRef.current.selectedUrl !== url)
        commit({ ...latestRef.current, selectedUrl: url })
    },
    [latestRef, commit],
  )

  const setCrop = React.useCallback(
    (url: string, crop: PhotoRect | null) => {
      const next = withCrop(latestRef.current, url, crop)
      if (next !== latestRef.current) commit(next)
    },
    [latestRef, commit],
  )
  const move = React.useCallback(
    (url: string, index: number) => {
      const next = movePhoto(latestRef.current, url, index)
      if (next !== latestRef.current) commit(next)
    },
    [latestRef, commit],
  )
  return { remove, clear, select, setCrop, move }
}

/** Читання, що йдуть зараз: скільки фото читається (для «Читаємо…») і дочікування всіх. */
function usePendingReads() {
  const [loading, setLoading] = React.useState(0)
  const pending = React.useRef(new Set<Promise<unknown>>())
  const track = React.useCallback(
    <T>(run: Promise<T>, photos: number): Promise<T> => {
      pending.current.add(run)
      setLoading((count) => count + photos)
      const done = () => {
        pending.current.delete(run)
        setLoading((count) => count - photos)
      }
      run.then(done, done)
      return run
    },
    [],
  )
  const idle = React.useCallback(async () => {
    while (pending.current.size) await Promise.allSettled([...pending.current])
  }, [])
  return { loading, track, idle }
}

export function usePhotoChoice({
  max = DEFAULT_MAX_PHOTOS,
  maxBytes = DEFAULT_MAX_PHOTO_BYTES,
}: PhotoChoiceOptions = {}): PhotoChoiceState {
  const [value, setValue] = React.useState<PhotoChoice>(NO_PHOTOS)
  const { loading, track, idle } = usePendingReads()
  // Фото, як їх востаннє змінено тут: читання закінчуються одне за одним, раніше за рендер.
  const latest = React.useRef(value)
  // Читання, почате до «Прибрати всі» чи виходу, нічого не додає.
  const generation = React.useRef(0)

  const commit = React.useCallback((next: PhotoChoice) => {
    latest.current = next
    setValue(next)
  }, [])
  const { remove, clear, select, setCrop, move } = useChoiceEdits(
    latest,
    generation,
    commit,
  )

  React.useEffect(() => {
    const current = generation
    return () => {
      current.current += 1
      revokeAll(latest.current.photos)
      // Прихований <Activity> теж знімає ефекти: показаний знову, він не має фото з відкликаними адресами.
      latest.current = NO_PHOTOS
      setValue(NO_PHOTOS)
    }
  }, [])

  const read = React.useCallback(
    async (files: readonly File[]): Promise<PhotoAddResult> => {
      const started = generation.current
      const isCurrent = () => started === generation.current
      const { loaded, rejected } = await readFiles(files, {
        maxBytes,
        known: new Set(latest.current.photos.map((photo) => photo.fingerprint)),
        room: () => max - latest.current.photos.length,
        isCurrent,
      })
      if (!isCurrent()) {
        revokeAll(loaded)
        return NOTHING_ADDED
      }
      // Інше додавання могло закінчитись раніше: межу й повтори звіряємо ще раз.
      const {
        rejected: extra,
        duplicates,
        ...next
      } = addPhotos(latest.current, loaded, max)
      revokeAll([...extra, ...duplicates])
      if (next.photos !== latest.current.photos) commit(next)
      const gone = new Set([...extra, ...duplicates])
      return {
        added: loaded.filter((photo) => !gone.has(photo)),
        rejected: [
          ...rejected,
          ...duplicates.map(reasonOf("duplicate")),
          ...extra.map(reasonOf("tooMany")),
        ],
      }
    },
    [commit, max, maxBytes],
  )

  const add = React.useCallback(
    (files: readonly File[]): Promise<PhotoAddResult> => {
      if (!files.length) return Promise.resolve(NOTHING_ADDED)
      const room = Math.max(0, max - latest.current.photos.length)
      return track(read(files), Math.min(files.length, room))
    },
    [read, track, max],
  )

  const settled = React.useCallback(async () => {
    await idle()
    return latest.current
  }, [idle])

  const actions = React.useMemo(
    () => ({ add, remove, clear, select, setCrop, move, settled }),
    [add, remove, clear, select, setCrop, move, settled],
  )
  return React.useMemo(
    () => ({ value, max, maxBytes, loading, ...actions }),
    [value, max, maxBytes, loading, actions],
  )
}
