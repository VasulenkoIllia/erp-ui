#!/usr/bin/env node
/**
 * Перевірка контрасту палітр (WCAG 2.2 AA) за design/palette-tokens.json.
 *   node design/check-contrast.mjs          — перевірити й перезаписати palette-contrast-report.json
 *   node design/check-contrast.mjs --check  — лише перевірити (CI): падає на будь-якій помилці
 *                                             і на застарілому звіті
 * Обов'язкові пари валять перевірку; «довідкові» лише друкуються (див. ADVISORY).
 */
import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { contrastRatio, mixOklab } from "./lib/color.mjs"

const designDir = path.dirname(fileURLToPath(import.meta.url))
const TOKENS = path.join(designDir, "palette-tokens.json")
const REPORT = path.join(designDir, "palette-contrast-report.json")

/** [передній план, фон, мінімум]. Текст — 4.5 (основний — 7), межі полів і фокус — 3. */
export const PAIRS = [
  // Текст на поверхнях
  ["foreground", "background", 7],
  ["foreground", "card", 7],
  ["foreground", "popover", 7],
  ["mutedForeground", "background", 4.5],
  ["mutedForeground", "card", 4.5],
  ["mutedForeground", "muted", 4.5],
  ["mutedForeground", "popover", 4.5],
  ["mutedForeground", "secondary", 4.5],
  ["mutedForeground", "accent", 4.5],
  ["secondaryForeground", "secondary", 4.5],
  ["accentForeground", "accent", 4.5],
  // Основний колір: кнопка (зокрема під курсором) і текст-посилання
  ["primaryForeground", "primary", 4.5],
  ["primaryForeground", "primaryHover", 4.5],
  ["primary", "card", 4.5],
  ["primary", "background", 4.5],
  // Межі полів і фокус (WCAG 1.4.11, 2.4.13)
  ["input", "card", 3],
  ["input", "background", 3],
  ["ring", "card", 3],
  ["ring", "background", 3],
  // Статуси: бейдж (soft + foreground) і текст/іконка статусу на картці
  ["successForeground", "successSoft", 4.5],
  ["warningForeground", "warningSoft", 4.5],
  ["destructiveForeground", "destructiveSoft", 4.5],
  ["infoForeground", "infoSoft", 4.5],
  ["successForeground", "card", 4.5],
  ["warningForeground", "card", 4.5],
  ["destructiveForeground", "card", 4.5],
  ["destructiveForeground", "background", 4.5],
  ["infoForeground", "card", 4.5],
  ["success", "card", 3],
  ["destructive", "card", 3],
  // Сайдбар
  ["sidebarForeground", "sidebar", 4.5],
  ["sidebarForeground", "sidebarAccent", 4.5],
  ["sidebarPrimary", "sidebar", 3],
  ["sidebarPrimaryForeground", "sidebarPrimary", 4.5],
  ["sidebarDarkForeground", "sidebarDark", 4.5],
  ["sidebarDarkForeground", "sidebarDarkAccent", 4.5],
  ["sidebarDarkPrimary", "sidebarDark", 3],
  ["sidebarDarkPrimaryForeground", "sidebarDarkPrimary", 4.5],
]

/**
 * Довідкові пари: не валять перевірку, бо компенсуються правилами SPEC.
 * - --warning (жовтий) — лише заливка під темним текстом, не іконка чи лінія на світлому фоні;
 * - кольори графіків нижче 3:1 допустимі лише з підписами й переглядом таблицею (SPEC §6.4).
 */
export const ADVISORY = [
  ["warning", "card", 3],
  ["chart1", "card", 3],
  ["chart2", "card", 3],
  ["chart3", "card", 3],
  ["chart4", "card", 3],
  ["chart5", "card", 3],
]

/** Похідні токени: так само, як --color-primary-hover у generate-themes.mjs. */
const DERIVED = {
  primaryHover: (mode) => mixOklab(mode.primary.css, mode.foreground.css, 0.15),
}

function color(mode, key) {
  if (DERIVED[key]) return DERIVED[key](mode)
  const chart = /^chart(\d)$/.exec(key)
  if (chart) return mode.charts[Number(chart[1]) - 1]
  const token = mode[key]
  if (!token?.css) throw new Error(`Немає токена ${key}`)
  return token.css
}

function evaluate(tokens, pairs) {
  const rows = []
  for (const [palette, p] of Object.entries(tokens)) {
    for (const modeName of ["light", "dark"]) {
      const mode = p[modeName]
      for (const [fg, bg, min] of pairs) {
        const ratio =
          Math.round(contrastRatio(color(mode, fg), color(mode, bg)) * 100) /
          100
        rows.push({
          palette,
          mode: modeName,
          pair: `${fg} / ${bg}`,
          ratio,
          min,
          pass: ratio >= min,
        })
      }
    }
  }
  return rows
}

export function checkContrast(tokens) {
  return {
    report: evaluate(tokens, PAIRS),
    advisory: evaluate(tokens, ADVISORY),
  }
}

function main() {
  const check = process.argv.includes("--check")
  const { report, advisory } = checkContrast(
    JSON.parse(readFileSync(TOKENS, "utf8")),
  )
  const failures = report.filter((r) => !r.pass)
  const json = JSON.stringify(report, null, 2) + "\n"

  const below = advisory.filter((a) => !a.pass)
  if (below.length > 0) {
    const pairs = [...new Set(below.map((r) => r.pair))].join(", ")
    console.log(
      `Довідково (не помилка, див. ADVISORY): ${below.length} випадків нижче 3:1 — ${pairs}.` +
        (process.argv.includes("--verbose")
          ? "\n" +
            below
              .map((r) => `  ${r.palette} ${r.mode} ${r.pair} = ${r.ratio}`)
              .join("\n")
          : " Подробиці: --verbose."),
    )
  }
  for (const r of failures) {
    console.error(
      `ПОМИЛКА: ${r.palette} ${r.mode} ${r.pair} = ${r.ratio} (потрібно ≥ ${r.min})`,
    )
  }

  let stale = false
  if (check) {
    stale = readFileSync(REPORT, "utf8") !== json
    if (stale)
      console.error(
        "palette-contrast-report.json застарів. Запустіть `pnpm themes`.",
      )
  } else {
    writeFileSync(REPORT, json)
  }

  const tightest = [...report].sort(
    (a, b) => a.ratio / a.min - b.ratio / b.min,
  )[0]
  console.log(
    `Контраст: ${report.length} пар, помилок ${failures.length}. ` +
      `Найменший запас: ${tightest.palette} ${tightest.mode} ${tightest.pair} = ${tightest.ratio} (мін. ${tightest.min}).`,
  )
  if (failures.length > 0 || stale) process.exit(1)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
