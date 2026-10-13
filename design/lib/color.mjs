/**
 * Кольорова математика для генератора тем і перевірки контрасту.
 * OKLCH → лінійний sRGB (з обрізанням до гамуту) → відносна яскравість WCAG 2.x.
 */

/** "oklch(0.53 0.2 262)" → [L, C, H] */
export function parseOklch(value) {
  const m = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/.exec(value.trim())
  if (!m) throw new Error(`Не OKLCH: ${value}`)
  return [Number(m[1]), Number(m[2]), Number(m[3])]
}

/** OKLCH → лінійний sRGB, кожен канал обрізано до [0, 1]. */
export function oklchToLinearSrgb([L, C, H]) {
  const a = C * Math.cos((H * Math.PI) / 180)
  const b = C * Math.sin((H * Math.PI) / 180)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((x) => Math.min(1, Math.max(0, x)))
}

const toGamma = (x) =>
  x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055
const toLinear = (x) =>
  x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4

/** OKLCH-рядок → "#rrggbb". */
export function oklchToHex(value) {
  return (
    "#" +
    oklchToLinearSrgb(parseOklch(value))
      .map((x) =>
        Math.round(toGamma(x) * 255)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  )
}

/** Лінійний sRGB для OKLCH або hex. */
function linearRgb(value) {
  const v = value.trim()
  if (v.startsWith("#")) {
    return [1, 3, 5].map((i) => toLinear(parseInt(v.slice(i, i + 2), 16) / 255))
  }
  return oklchToLinearSrgb(parseOklch(v))
}

export function relativeLuminance(value) {
  const [r, g, b] = linearRgb(value)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Контраст WCAG 2.x між двома кольорами (OKLCH або hex). */
export function contrastRatio(a, b) {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort(
    (x, y) => y - x,
  )
  return (hi + 0.05) / (lo + 0.05)
}

/** OKLCH → OKLab [L, a, b]. */
function oklchToOklab([L, C, H]) {
  return [
    L,
    C * Math.cos((H * Math.PI) / 180),
    C * Math.sin((H * Math.PI) / 180),
  ]
}

/**
 * Змішування як CSS `color-mix(in oklab, a (1−t), b t)`: результат — рядок OKLCH.
 * Похідні токени (напр. hover основного кольору) рахуються так само, як у браузері.
 */
export function mixOklab(a, b, t) {
  const [L1, a1, b1] = oklchToOklab(parseOklch(a))
  const [L2, a2, b2] = oklchToOklab(parseOklch(b))
  const L = L1 + (L2 - L1) * t
  const A = a1 + (a2 - a1) * t
  const B = b1 + (b2 - b1) * t
  const C = Math.hypot(A, B)
  const H = ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360
  return `oklch(${L.toFixed(4)} ${C.toFixed(4)} ${H.toFixed(2)})`
}
