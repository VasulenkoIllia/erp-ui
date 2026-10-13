#!/usr/bin/env node
/**
 * Генератор design/themes.css з design/palette-tokens.json (джерело правди для кольорів).
 *   node design/generate-themes.mjs          — перезаписати themes.css
 *   node design/generate-themes.mjs --check  — перевірити, що themes.css актуальний (для CI)
 * Руками themes.css не правимо (CLAUDE.md, правило 4).
 */
import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const designDir = path.dirname(fileURLToPath(import.meta.url))
const TOKENS = path.join(designDir, "palette-tokens.json")
const OUTPUT = path.join(designDir, "themes.css")

/** Порядок палітр у файлі; перша — типова (`:root` без атрибута). */
const ORDER = ["sapphire", "indigo", "graphite", "teal", "terracotta"]

const HEADER = `/*
 * ERP UI kit — theme palettes (generated from palette-tokens.json by design/generate-themes.mjs; do not hand-edit).
 * 5 palettes × light/dark. Main palettes: sapphire, graphite.
 * Usage on <html>: data-palette="sapphire|indigo|graphite|teal|terracotta",
 *   class="dark" for dark mode, data-sidebar="dark" for a dark sidebar in light mode,
 *   data-density="compact" for compact density.
 * Contrast: all key pairs checked to WCAG 2.2 AA (text 4.5:1, input border/focus 3:1) in both modes.
 * Chart colors: validated for colour-vision deficiency (adjacent pairs) on card surfaces.
 * Status colors (success/warning/destructive/info) are identical in every palette.
 */

:root {
  --radius: 0.5rem;
  --control-h: 2.25rem;
  --row-h: 2.75rem;
  --touch-min: 2.75rem;
}
:root[data-density="compact"] {
  --control-h: 2rem;
  --row-h: 2rem;
  --touch-min: 1.5rem;
}
/* Modal scrim — the same in every palette. */
:root {
  --overlay: oklch(0 0 0 / 0.1);
}
:root.dark {
  --overlay: oklch(0 0 0 / 0.3);
}
`

const FOOTER = `
/* Tailwind v4: expose the extra tokens as utilities (bg-success, text-warning-foreground, …).
 * The standard shadcn tokens are mapped in registry/tokens/base.css. */
@theme inline {
  --color-success: var(--success);
  --color-success-foreground: var(--success-foreground);
  --color-success-soft: var(--success-soft);
  --color-warning: var(--warning);
  --color-warning-foreground: var(--warning-foreground);
  --color-warning-soft: var(--warning-soft);
  --color-info: var(--info);
  --color-info-foreground: var(--info-foreground);
  --color-info-soft: var(--info-soft);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-destructive-soft: var(--destructive-soft);
  --color-overlay: var(--overlay);
  /* Hover основної кнопки: зсув до --foreground, тобто завжди «від» тексту кнопки —
   * контраст з primary-foreground лише зростає (перевіряє check-contrast, пара primaryHover). */
  --color-primary-hover: color-mix(in oklab, var(--primary) 85%, var(--foreground));
}
`

/** CSS-змінна ← ключ токена (для основного блоку теми). */
const MAIN_VARS = [
  ["background", "background"],
  ["foreground", "foreground"],
  ["card", "card"],
  ["card-foreground", "foreground"],
  ["popover", "popover"],
  ["popover-foreground", "foreground"],
  ["primary", "primary"],
  ["primary-foreground", "primaryForeground"],
  ["secondary", "secondary"],
  ["secondary-foreground", "secondaryForeground"],
  ["muted", "muted"],
  ["muted-foreground", "mutedForeground"],
  ["accent", "accent"],
  ["accent-foreground", "accentForeground"],
  ["destructive", "destructive"],
  ["destructive-foreground", "destructiveForeground"],
  ["destructive-soft", "destructiveSoft"],
  ["success", "success"],
  ["success-foreground", "successForeground"],
  ["success-soft", "successSoft"],
  ["warning", "warning"],
  ["warning-foreground", "warningForeground"],
  ["warning-soft", "warningSoft"],
  ["info", "info"],
  ["info-foreground", "infoForeground"],
  ["info-soft", "infoSoft"],
  ["border", "border"],
  ["input", "input"],
  ["ring", "ring"],
]

const SIDEBAR_VARS = [
  ["sidebar", "sidebar"],
  ["sidebar-foreground", "sidebarForeground"],
  ["sidebar-primary", "sidebarPrimary"],
  ["sidebar-primary-foreground", "sidebarPrimaryForeground"],
  ["sidebar-accent", "sidebarAccent"],
  ["sidebar-accent-foreground", "sidebarForeground"],
  ["sidebar-border", "sidebarBorder"],
  ["sidebar-ring", "ring"],
]

const SIDEBAR_DARK_VARS = [
  ["sidebar", "sidebarDark"],
  ["sidebar-foreground", "sidebarDarkForeground"],
  ["sidebar-primary", "sidebarDarkPrimary"],
  ["sidebar-primary-foreground", "sidebarDarkPrimaryForeground"],
  ["sidebar-accent", "sidebarDarkAccent"],
  ["sidebar-accent-foreground", "sidebarDarkForeground"],
  ["sidebar-border", "sidebarDarkBorder"],
  ["sidebar-ring", "sidebarDarkPrimary"],
]

function value(mode, key, palette) {
  const token = mode[key]
  if (!token?.css) throw new Error(`${palette}: немає токена ${key}`)
  return token.css
}

function block(selectors, lines) {
  return `${selectors.join(",\n")} {\n${lines.map((l) => `  ${l}`).join("\n")}\n}\n`
}

function themeBlock(name, palette, mode, isDefault, isDark) {
  const lines = MAIN_VARS.map(([v, k]) => `--${v}: ${value(mode, k, name)};`)
  mode.charts.forEach((c, i) => lines.push(`--chart-${i + 1}: ${c};`))
  for (const [v, k] of SIDEBAR_VARS)
    lines.push(`--${v}: ${value(mode, k, name)};`)
  const base = isDark ? ":root.dark" : ":root"
  const selectors = [`${base}[data-palette="${name}"]`]
  if (isDefault) selectors.unshift(base)
  const title = isDark
    ? `${palette.name} — dark`
    : `${palette.name} (${palette.hueName}) — light`
  return `/* ${title} */\n${block(selectors, lines)}`
}

function sidebarDarkBlock(name, palette, isDefault) {
  const light = palette.light
  const lines = SIDEBAR_DARK_VARS.map(
    ([v, k]) => `--${v}: ${value(light, k, name)};`,
  )
  const selectors = [
    `:root[data-sidebar="dark"][data-palette="${name}"]:not(.dark)`,
  ]
  if (isDefault) selectors.unshift(`:root[data-sidebar="dark"]:not(.dark)`)
  return `/* ${palette.name} — dark sidebar in light mode */\n${block(selectors, lines)}`
}

export function generateThemes(tokens) {
  const missing = Object.keys(tokens).filter((k) => !ORDER.includes(k))
  if (missing.length)
    throw new Error(`Палітри без місця в ORDER: ${missing.join(", ")}`)
  const parts = [HEADER]
  ORDER.forEach((name, i) => {
    const palette = tokens[name]
    const isDefault = i === 0
    parts.push(
      "\n" + themeBlock(name, palette, palette.light, isDefault, false),
      themeBlock(name, palette, palette.dark, isDefault, true),
      sidebarDarkBlock(name, palette, isDefault),
    )
  })
  parts.push(FOOTER)
  return parts.join("")
}

function main() {
  const css = generateThemes(JSON.parse(readFileSync(TOKENS, "utf8")))
  if (process.argv.includes("--check")) {
    if (readFileSync(OUTPUT, "utf8") !== css) {
      console.error(
        "design/themes.css застарів або правлений вручну. Запустіть `pnpm themes` і закомітьте результат.",
      )
      process.exit(1)
    }
    console.log("themes.css: актуальний")
    return
  }
  writeFileSync(OUTPUT, css)
  console.log(`Записано ${path.relative(process.cwd(), OUTPUT)}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
