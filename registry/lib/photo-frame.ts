/**
 * Рамка обрізання фото й стискання в JPEG на canvas (частина UI11, ADR-0101). Без React і залежностей:
 * координати — у пікселях самого фото, тож рамка не залежить від розміру, у якому фото показано.
 */

export interface PhotoPoint {
  readonly x: number
  readonly y: number
}

export interface PhotoSize {
  readonly width: number
  readonly height: number
}

/** Прямокутник у пікселях фото. */
export interface PhotoRect extends PhotoPoint, PhotoSize {}

/** Довша сторона готового фото за замовчуванням, px. */
export const PHOTO_MAX_SIDE_PX = 1024
/** Рамка, вужча за це на екрані, — клацання, а не обрізання, px екрана. */
export const MIN_FRAME_SIDE_PX = 16
/** Рамка з клавіатури спершу займає таку частку кожної сторони фото, по центру. */
const KEYBOARD_FRAME_SHARE = 0.8
/** Крок стрілки — частка довшої сторони фото. */
const KEY_STEP_SHARE = 0.02
const JPEG_QUALITY = 0.9
/** Прозоре в PNG чи WebP лягає на біле, як фото в каталогах. */
const JPEG_BACKGROUND = "#ffffff" // erp-ui: allow-raw-value — тло пікселів готового JPEG, не колір інтерфейсу

export function fullRect(size: PhotoSize): PhotoRect {
  return { x: 0, y: 0, width: size.width, height: size.height }
}

const clamp = (value: number, max: number) => Math.min(Math.max(value, 0), max)

/**
 * Рамка між двома точками перетягування в будь-якому напрямку, у межах фото. `null`, коли одна зі сторін
 * менша за `minSidePx` пікселів фото: таке перетягування — клацання.
 */
export function frameBetween(
  from: PhotoPoint,
  to: PhotoPoint,
  size: PhotoSize,
  minSidePx: number,
): PhotoRect | null {
  const [fromX, toX] = [clamp(from.x, size.width), clamp(to.x, size.width)]
  const [fromY, toY] = [clamp(from.y, size.height), clamp(to.y, size.height)]
  const x = Math.round(Math.min(fromX, toX))
  const y = Math.round(Math.min(fromY, toY))
  const width = Math.round(Math.max(fromX, toX)) - x
  const height = Math.round(Math.max(fromY, toY)) - y
  return width >= minSidePx && height >= minSidePx
    ? { x, y, width, height }
    : null
}

/** Рамка, з якої починає клавіатура: по центру, 80 % кожної сторони. */
export function keyboardFrame(size: PhotoSize): PhotoRect {
  const width = Math.round(size.width * KEYBOARD_FRAME_SHARE)
  const height = Math.round(size.height * KEYBOARD_FRAME_SHARE)
  return {
    x: Math.round((size.width - width) / 2),
    y: Math.round((size.height - height) / 2),
    width,
    height,
  }
}

/** Крок стрілки в пікселях фото: 2 % довшої сторони, не менше пікселя. */
export function keyStep(size: PhotoSize): number {
  return Math.max(
    1,
    Math.round(Math.max(size.width, size.height) * KEY_STEP_SHARE),
  )
}

/** Рамку зсунуто, але вона лишається в межах фото. */
export function moveFrame(
  rect: PhotoRect,
  dx: number,
  dy: number,
  size: PhotoSize,
): PhotoRect {
  return {
    ...rect,
    x: clamp(rect.x + dx, size.width - rect.width),
    y: clamp(rect.y + dy, size.height - rect.height),
  }
}

/** Права й нижня сторони рамки зсунуті: рамка не менша за `minSidePx` і не виходить за фото. */
export function resizeFrame(
  rect: PhotoRect,
  dw: number,
  dh: number,
  size: PhotoSize,
  minSidePx: number,
): PhotoRect {
  const fit = (side: number, delta: number, start: number, max: number) =>
    Math.min(
      Math.max(side + delta, Math.min(minSidePx, max - start)),
      max - start,
    )
  return {
    ...rect,
    width: fit(rect.width, dw, rect.x, size.width),
    height: fit(rect.height, dh, rect.y, size.height),
  }
}

export function isSameFrame(
  left: PhotoRect | null,
  right: PhotoRect | null,
): boolean {
  if (left === null || right === null) return left === right
  return (
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height
  )
}

/** Розмір готового фото: довша сторона не більша за `maxSidePx`, менше фото не збільшується. */
export function outputSize(
  rect: PhotoSize,
  maxSidePx = PHOTO_MAX_SIDE_PX,
): PhotoSize {
  const scale = Math.min(1, maxSidePx / Math.max(rect.width, rect.height))
  return {
    width: Math.max(1, Math.round(rect.width * scale)),
    height: Math.max(1, Math.round(rect.height * scale)),
  }
}

export interface PhotoEncodeOptions {
  /** Довша сторона готового фото, px (типово 1024). */
  readonly maxSidePx?: number
  /** Якість JPEG від 0 до 1 (типово 0,9). */
  readonly quality?: number
}

/**
 * Фрагмент фото в рамці — JPEG на білому тлі, довша сторона до `maxSidePx`. Будь-який збій, і canvas
 * теж, — відхилена обіцянка, а не виняток під час виклику.
 */
export async function encodePhotoFrame(
  image: CanvasImageSource,
  rect: PhotoRect,
  {
    maxSidePx = PHOTO_MAX_SIDE_PX,
    quality = JPEG_QUALITY,
  }: PhotoEncodeOptions = {},
): Promise<Blob> {
  if (!(rect.width > 0 && rect.height > 0))
    throw new Error(`The frame is ${String(rect.width)}×${String(rect.height)}`)
  const size = outputSize(rect, maxSidePx)
  const canvas = document.createElement("canvas")
  canvas.width = size.width
  canvas.height = size.height
  const context = canvas.getContext("2d")
  if (!context) throw new Error("Canvas is not available")
  context.fillStyle = JPEG_BACKGROUND
  context.fillRect(0, 0, size.width, size.height)
  context.imageSmoothingQuality = "high"
  context.drawImage(
    image,
    rect.x,
    rect.y,
    rect.width,
    rect.height,
    0,
    0,
    size.width,
    size.height,
  )
  return await new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        // Браузер, що не стиснув у JPEG, дає null чи інший тип.
        if (blob?.type === "image/jpeg") resolve(blob)
        else reject(new Error("The browser did not encode the photo as JPEG"))
      },
      "image/jpeg",
      quality,
    )
  })
}

/**
 * Фото як `data:image/jpeg;base64,…` — для API, що приймає фото лише в JSON. Base64 на третину довший за
 * файл: API, що приймає `multipart/form-data`, краще отримує сам `Blob` у `FormData`.
 */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result)
      else reject(new Error("Cannot read the photo"))
    }
    reader.onerror = () => {
      reject(reader.error ?? new Error("Cannot read the photo"))
    }
    reader.readAsDataURL(blob)
  })
}
