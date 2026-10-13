#!/usr/bin/env node
/**
 * Перевірка доставки (крок 0.2b, ADR-0004): чистий клієнтський проект ставить кіт із GitHub-реєстру
 * так само, як це робитиме розробник, і має скомпілюватися.
 *
 *   node scripts/consumer-smoke.mjs --ref <коміт|тег|гілка> [--keep] [--diff-from <старий ref>]
 *
 * Кроки: шаблон tests/consumer/template → pnpm install → shadcn init (Base UI, Nova) →
 * shadcn add <REPO>/base і всі елементи ui/* та erp/* на одному ref → tsc → vite build.
 * --diff-from: спершу ставить усе зі старого ref, потім показує `add --diff` для нового (оновлення).
 * Приватний репозиторій: потрібен `gh auth login` або GH_TOKEN з правом читання.
 */
import { execFileSync } from "node:child_process"
import { cpSync, mkdtempSync, readFileSync, renameSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const args = process.argv.slice(2)
const arg = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const ref = arg("--ref")
const diffFrom = arg("--diff-from")
if (!ref) {
  console.error("Потрібно --ref <коміт|тег|гілка>")
  process.exit(1)
}

const registry = JSON.parse(
  readFileSync(path.join(root, "registry.json"), "utf8"),
)
const repo = new URL(registry.homepage).pathname.slice(1)
const shadcnVersion = JSON.parse(
  readFileSync(path.join(root, "node_modules/shadcn/package.json"), "utf8"),
).version
const uiItems = registry.items
  .filter((it) => /^(ui|erp)\//.test(it.name))
  .map((it) => it.name)

const dir = mkdtempSync(path.join(tmpdir(), "erp-ui-consumer-"))
const run = (cmd, cmdArgs, opts = {}) => {
  console.log(`\n$ ${cmd} ${cmdArgs.join(" ")}`)
  return execFileSync(cmd, cmdArgs, {
    cwd: dir,
    stdio: opts.capture ? "pipe" : "inherit",
    encoding: "utf8",
  })
}
const shadcn = (...cmdArgs) =>
  run("npx", ["-y", `shadcn@${shadcnVersion}`, ...cmdArgs])
const addAll = (atRef, extra = []) =>
  shadcn(
    "add",
    ...["base", ...uiItems].map((name) => `${repo}/${name}#${atRef}`),
    "-y",
    "--overwrite",
    ...extra,
  )

try {
  cpSync(path.join(root, "tests/consumer/template"), dir, { recursive: true })
  run("pnpm", ["install", "--ignore-workspace"])
  shadcn("init", "-b", "base", "-p", "nova", "-y", "--no-rtl")

  if (diffFrom) {
    addAll(diffFrom)
    console.log(
      `\n=== Оновлення ${diffFrom} → ${ref}: що зміниться (add --diff) ===`,
    )
    shadcn("add", `${repo}/ui/button#${ref}`, "--diff")
  }
  addAll(ref)

  renameSync(
    path.join(dir, "App.tsx.after-install"),
    path.join(dir, "src/App.tsx"),
  )
  const css = readFileSync(path.join(dir, "src/index.css"), "utf8")
  if (!css.includes("./styles/erp-ui/themes.css"))
    throw new Error("src/index.css не замінено точкою входу erp-ui")
  const button = readFileSync(
    path.join(dir, "src/components/ui/button.tsx"),
    "utf8",
  )
  if (!button.includes('from "@/lib/utils"'))
    throw new Error("Імпорти @/registry/… не переписано на аліаси проекту")
  if (!button.includes("erp-ui: основа"))
    throw new Error("Шапку походження втрачено")
  const phone = readFileSync(
    path.join(dir, "src/components/erp/phone-input.tsx"),
    "utf8",
  )
  for (const expected of [
    'from "@/components/ui/select"',
    'from "@/lib/phone"',
    'from "@/lib/i18n"',
  ]) {
    if (!phone.includes(expected))
      throw new Error(`erp/phone-input: немає імпорту ${expected}`)
  }

  run("pnpm", ["typecheck"])
  run("pnpm", ["build"])
  console.log(
    `\nOK: ${uiItems.length + 1} елементів із ${repo}#${ref} встановлено, проект компілюється.`,
  )
} finally {
  if (args.includes("--keep")) console.log(`Тестовий проект лишено: ${dir}`)
  else rmSync(dir, { recursive: true, force: true })
}
