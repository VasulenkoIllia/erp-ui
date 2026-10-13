#!/usr/bin/env node
/**
 * Зводить скриншоти кроку в аркуші «2 палітри × 2 теми» для кожної ширини — зручно дивитися з телефона.
 * Використання: node scripts/contact-sheet.mjs <тека зі скриншотами від кореня репозиторію>
 * Очікує файли <palette>-<theme>-<width>.png і пише sheet-<width>.png у ту саму теку.
 */
import { chromium } from "@playwright/test"
import { readFileSync, readdirSync, writeFileSync } from "node:fs"
import path from "node:path"

const repoRoot = path.resolve(import.meta.dirname, "../../..")
const dir = path.resolve(repoRoot, process.argv[2] ?? "")
const files = readdirSync(dir).filter((f) =>
  /^[a-z]+-(light|dark)-\d+\.png$/.test(f),
)
const widths = [
  ...new Set(files.map((f) => Number(f.match(/-(\d+)\.png$/)[1]))),
].sort((a, b) => a - b)

const browser = await chromium.launch(
  process.env.PW_CHROMIUM_PATH
    ? { executablePath: process.env.PW_CHROMIUM_PATH }
    : {},
)
const page = await browser.newPage({ deviceScaleFactor: 1 })

for (const width of widths) {
  const shots = files.filter((f) => f.endsWith(`-${width}.png`)).sort()
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
  const out = path.join(dir, `sheet-${width}.png`)
  writeFileSync(out, await page.screenshot({ fullPage: true }))
  console.log(path.relative(repoRoot, out))
}

await browser.close()
