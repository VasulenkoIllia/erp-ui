import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

import { checkContrast } from "./check-contrast.mjs"
import { generateThemes } from "./generate-themes.mjs"
import { contrastRatio, mixOklab, oklchToHex } from "./lib/color.mjs"

const tokens = JSON.parse(
  readFileSync(new URL("./palette-tokens.json", import.meta.url), "utf8"),
)

test("контраст за WCAG: біле й чорне — 21:1, однакові — 1:1", () => {
  assert.equal(Math.round(contrastRatio("#ffffff", "#000000") * 100) / 100, 21)
  assert.equal(contrastRatio("oklch(0.5 0.1 250)", "oklch(0.5 0.1 250)"), 1)
})

// hex у токенах — довідкові; допускаємо різницю округлення в 1 на канал.
test("OKLCH → hex збігається з hex у токенах (±1 на канал)", () => {
  const channels = (hex) =>
    [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  for (const palette of Object.values(tokens)) {
    for (const mode of [palette.light, palette.dark]) {
      for (const [key, token] of Object.entries(mode)) {
        if (key === "charts") continue
        const actual = channels(oklchToHex(token.css))
        const expected = channels(token.hex)
        const diff = Math.max(
          ...actual.map((c, i) => Math.abs(c - expected[i])),
        )
        assert.ok(
          diff <= 1,
          `${key}: ${token.css} → ${oklchToHex(token.css)}, у токенах ${token.hex}`,
        )
      }
    }
  }
})

test("themes.css згенеровано з актуальних токенів", () => {
  const css = readFileSync(new URL("./themes.css", import.meta.url), "utf8")
  assert.equal(css, generateThemes(tokens))
})

test("усі обов'язкові пари контрасту проходять", () => {
  const failures = checkContrast(tokens).report.filter((r) => !r.pass)
  assert.deepEqual(failures, [])
})

test("color-mix в OKLab: краї дають вихідні кольори, середина — між ними", () => {
  const a = "oklch(0.53 0.2 262)"
  const b = "oklch(0.2 0.02 262)"
  assert.equal(oklchToHex(mixOklab(a, b, 0)), oklchToHex(a))
  assert.equal(oklchToHex(mixOklab(a, b, 1)), oklchToHex(b))
  const mid = /^oklch\(([\d.]+) /.exec(mixOklab(a, b, 0.5))
  assert.ok(mid && Math.abs(Number(mid[1]) - 0.365) < 1e-3)
})

test("hover основного кольору не знижує контраст тексту кнопки", () => {
  for (const palette of Object.values(tokens)) {
    for (const mode of [palette.light, palette.dark]) {
      const base = contrastRatio(mode.primaryForeground.css, mode.primary.css)
      const hover = contrastRatio(
        mode.primaryForeground.css,
        mixOklab(mode.primary.css, mode.foreground.css, 0.15),
      )
      assert.ok(hover >= base, `${palette.name}: ${hover} < ${base}`)
    }
  }
})
