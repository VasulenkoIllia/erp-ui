#!/usr/bin/env node
/**
 * Зводить скриншоти кроку в аркуші «2 палітри × 2 теми» для кожної ширини — зручно дивитися з телефона.
 * Використання: node scripts/contact-sheet.mjs <тека зі скриншотами від кореня репозиторію>
 * Очікує файли [<сторінка>-]<palette>-<theme>-<width>[-compact].png і пише
 * sheet-[<сторінка>-]<width>[-compact].png у ту саму теку.
 */
import { chromium } from "@playwright/test"
import { readFileSync, readdirSync, writeFileSync } from "node:fs"
import path from "node:path"

const repoRoot = path.resolve(import.meta.dirname, "../../..")
const dir = path.resolve(repoRoot, process.argv[2] ?? "")
const SHOT = /^(?:([a-z]+)-)?[a-z]+-(?:light|dark)-(\d+)(-compact)?\.png$/
const files = readdirSync(dir).filter(
  (f) => SHOT.test(f) && !f.startsWith("sheet-"),
)
/** Група аркуша: сторінка + ширина + щільність. */
const groupOf = (f) => {
  const [, pageId, width, compact] = SHOT.exec(f)
  return {
    key: `${pageId ? `${pageId}-` : ""}${width}${compact ?? ""}`,
    width: Number(width),
  }
}
const groups = new Map()
for (const f of files) {
  const { key, width } = groupOf(f)
  if (!groups.has(key)) groups.set(key, { width, shots: [] })
  groups.get(key).shots.push(f)
}

const browser = await chromium.launch(
  process.env.PW_CHROMIUM_PATH
    ? { executablePath: process.env.PW_CHROMIUM_PATH }
    : {},
)
const page = await browser.newPage({ deviceScaleFactor: 1 })

for (const [key, { width, shots }] of groups) {
  shots.sort()
  const scale = width > 800 ? 0.5 : 1
  const cells = shots
    .map((f) => {
      const src = `data:image/png;base64,${readFileSync(path.join(dir, f)).toString("base64")}`
      return `<figure><figcaption>${f.replace(".png", "")}</figcaption><img src="${src}" style="width:${width * scale}px"></figure>`
    })
    .join("")
  await page.setContent(
    `<style>body{margin:0;padding:16px;font:600 16px system-ui;background:#888;display:grid;grid-template-columns:repeat(2,max-content);gap:16px}
     figure{margin:0}figcaption{margin-bottom:6px;color:#111}img{display:block;border:1px solid #444}</style>${cells}`,
  )
  await page.waitForLoadState("load")
  const out = path.join(dir, `sheet-${key}.png`)
  writeFileSync(out, await page.screenshot({ fullPage: true }))
  console.log(path.relative(repoRoot, out))
}

await browser.close()
