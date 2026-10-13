#!/usr/bin/env node
/**
 * Перевірка доставки (крок 0.2b, ADR-0004): чистий клієнтський проект ставить кіт так само, як це
 * робитиме розробник, і має скомпілюватися.
 *
 *   node scripts/consumer-smoke.mjs --ref <коміт|тег|гілка> [--local] [--keep] [--diff-from <старий ref>]
 *
 * Кроки: шаблон tests/consumer/template → pnpm install → shadcn init (Base UI, Nova) →
 * shadcn add base, пакунки data, mocks і auth та всі елементи ui/* і erp/* → tsc → vite build.
 *
 * --local (CI): повний набір — з реєстру, зібраного з робочої копії (`shadcn build` + локальний
 *   сервер); з GitHub на --ref — лише ui/button в окремий проект, щоб перевірити саму доставку з
 *   токеном (повний набір з GitHub — ~1400 запитів до API, ліміт ~1000 на годину). Ще кілька
 *   елементів ставляться поодинці в чисті проекти: залежність, якої бракує елементу, не принесе сусід.
 * Без --local — усе з GitHub на --ref (перевірка тегу перед випуском).
 * --diff-from: спершу ставить усе зі старого ref, потім показує `add --diff` для нового (оновлення).
 * Приватний репозиторій: потрібен `gh auth login` або GH_TOKEN з правом читання.
 */
import { spawn } from "node:child_process"
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { createServer } from "node:http"
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
const local = args.includes("--local")
const keep = args.includes("--keep")
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
/** Пакунки, які ставить проект: основа, шар даних, моки, вхід. */
const BUNDLES = ["base", "data", "mocks", "auth"]
const uiItems = registry.items
  .filter((it) => /^(ui|erp)\//.test(it.name))
  .map((it) => it.name)
/** Елементи з реєстру робочої копії, що ставляться поодинці (--local): найбільше залежностей. */
const ISOLATED = ["data", "erp/phone-input"]
/** Паузи перед повтором запиту до GitHub: 403/429 — ліміт API, а не помилка коду. */
const GITHUB_RETRY_DELAYS_MS = [30_000, 90_000]

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const dirs = []

/**
 * Команда з виводом у консоль. Асинхронно: у цьому ж процесі працює сервер реєстру, і синхронний
 * запуск заблокував би його відповіді.
 */
function run(cwd, cmd, cmdArgs) {
  console.log(`\n$ ${cmd} ${cmdArgs.join(" ")}`)
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, cmdArgs, { cwd, stdio: "inherit" })
    child.on("error", reject)
    child.on("exit", (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${cmd} ${cmdArgs[0] ?? ""}: код ${String(code)}`))
    })
  })
}

async function createProject() {
  const dir = mkdtempSync(path.join(tmpdir(), "erp-ui-consumer-"))
  dirs.push(dir)
  const shadcn = (...cmdArgs) =>
    run(dir, "npx", ["-y", `shadcn@${shadcnVersion}`, ...cmdArgs])
  cpSync(path.join(root, "tests/consumer/template"), dir, { recursive: true })
  await run(dir, "pnpm", ["install", "--ignore-workspace"])
  await shadcn("init", "-b", "base", "-p", "nova", "-y", "--no-rtl")
  return { dir, shadcn, run: (cmd, cmdArgs) => run(dir, cmd, cmdArgs) }
}

/** Запит до GitHub із повторами: ліміт API (403/429) минає за хвилину-другу. */
async function fromGithub(action) {
  for (let attempt = 0; ; attempt++) {
    try {
      await action()
      return
    } catch (error) {
      const delay = GITHUB_RETRY_DELAYS_MS[attempt]
      if (delay === undefined) throw error
      console.warn(
        `\nGitHub не віддав елементи (можливо, 403/429 — ліміт API). Повтор через ${String(delay / 1000)} с.`,
      )
      await sleep(delay)
    }
  }
}

/** Реєстр із робочої копії: `shadcn build` і статичний сервер на випадковому порту. */
async function serveLocalRegistry() {
  const out = mkdtempSync(path.join(tmpdir(), "erp-ui-registry-"))
  dirs.push(out)
  await run(root, "npx", ["-y", `shadcn@${shadcnVersion}`, "build", "-o", out])
  const server = createServer((req, res) => {
    let file
    try {
      file = path.join(out, path.normalize(decodeURIComponent(req.url ?? "/")))
    } catch {
      // Зіпсоване %-кодування не повинно валити сервер посеред перевірки.
      res.writeHead(400).end()
      return
    }
    const inside = path.relative(out, file)
    if (
      inside.startsWith("..") ||
      path.isAbsolute(inside) ||
      !file.endsWith(".json") ||
      !existsSync(file)
    ) {
      res.writeHead(404).end()
      return
    }
    res.writeHead(200, { "Content-Type": "application/json" })
    res.end(readFileSync(file))
  })
  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", resolve)
  })
  const { port } = server.address()
  return {
    url: (name) => `http://127.0.0.1:${String(port)}/${name}.json`,
    close: () => server.close(),
  }
}

/** Повний набір: компілюється й збирається разом із прикладами застосунку. */
async function fullInstall(source) {
  const { dir, run: exec, shadcn } = await createProject()
  const addAll = (atRef) =>
    shadcn(
      "add",
      ...[...BUNDLES, ...uiItems].map((name) =>
        source ? source.url(name) : `${repo}/${name}#${atRef}`,
      ),
      "-y",
      "--overwrite",
    )

  if (diffFrom) {
    await fromGithub(() => addAll(diffFrom))
    console.log(
      `\n=== Оновлення ${diffFrom} → ${ref}: що зміниться (add --diff) ===`,
    )
    await fromGithub(() => shadcn("add", `${repo}/ui/button#${ref}`, "--diff"))
  }
  if (source) await addAll(ref)
  else await fromGithub(() => addAll(ref))

  for (const file of ["App.tsx", "Data.tsx", "mocks.ts"])
    renameSync(
      path.join(dir, `${file}.after-install`),
      path.join(dir, `src/${file}`),
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

  await exec("pnpm", ["typecheck"])
  await exec("pnpm", ["build"])
}

/** Один елемент у чистому проекті: компілюються лише його файли з його залежностями. */
async function isolatedInstall(item, add) {
  const { dir, run: exec, shadcn } = await createProject()
  await add(shadcn, item)
  writeFileSync(
    path.join(dir, "tsconfig.isolated.json"),
    JSON.stringify({
      extends: "./tsconfig.json",
      include: ["src/components", "src/lib", "src/hooks"],
    }),
  )
  await exec("npx", ["tsc", "-p", "tsconfig.isolated.json"])
}

let source
try {
  source = local ? await serveLocalRegistry() : undefined
  await fullInstall(source)
  if (source) {
    for (const name of ISOLATED)
      await isolatedInstall(name, (shadcn) =>
        shadcn("add", source.url(name), "-y", "--overwrite"),
      )
    // Сама доставка з приватного GitHub з токеном — на одному елементі.
    await isolatedInstall("ui/button", (shadcn) =>
      fromGithub(() =>
        shadcn("add", `${repo}/ui/button#${ref}`, "-y", "--overwrite"),
      ),
    )
  }
  console.log(
    local
      ? `\nOK: ${String(uiItems.length + BUNDLES.length)} елементів із робочої копії встановлено, проект компілюється; поодинці: ${ISOLATED.join(", ")} і ui/button з ${repo}#${ref}.`
      : `\nOK: ${String(uiItems.length + BUNDLES.length)} елементів із ${repo}#${ref} встановлено, проект компілюється.`,
  )
} finally {
  source?.close()
  if (keep) console.log(`Тестові проекти лишено: ${dirs.join(", ")}`)
  else for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
}
