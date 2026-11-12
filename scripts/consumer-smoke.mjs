#!/usr/bin/env node
/**
 * Перевірка доставки (крок 0.2b, ADR-0004): чистий клієнтський проект ставить кіт так само, як це
 * робитиме розробник, і має скомпілюватися.
 *
 *   node scripts/consumer-smoke.mjs --ref <коміт|тег|гілка> [--local] [--keep] [--diff-from <старий ref>]
 *
 * Кроки: шаблон tests/consumer/template → pnpm install → shadcn init (Base UI, Nova) →
 * shadcn add base, пакунки data, mocks і auth, lib/query-client, усі елементи ui/*, erp/*, templates/* і tools/* та модулі
 * modules/* → tsc → vite build. Файли модуля мають лягти в проект дослівно (ADR-0025): імпорти в них
 * уже шляхами проекту, і shadcn не має їх переписувати.
 *
 * Моки поза продакшном (ADR-0079): збірка без VITE_BACKEND, з опискою чи з `mocks` лише з .env-файла
 * зупиняється на запобіжнику vite.config.ts шаблону; з бекендом (`api`) у dist немає ні MSW, ні моків
 * кіта й проекту; з `mocks` вони є, але MSW і моки проекту — не в першому екрані.
 *
 * --local (CI): повний набір — з реєстру, зібраного з робочої копії (`shadcn build` + локальний
 *   сервер); з GitHub на --ref — лише ui/button в окремий проект, щоб перевірити саму доставку
 *   (повний набір з GitHub — ~1400 запитів до API, ліміт ~1000 на годину). Ще кілька
 *   елементів ставляться поодинці в чисті проекти: залежність, якої бракує елементу, не принесе сусід.
 * Без --local — усе з GitHub на --ref (перевірка тегу перед випуском).
 * --diff-from: спершу ставить усе зі старого ref, потім показує `add --diff` для нового (оновлення).
 * Відкритий репозиторій: токен не потрібен.
 */
import { spawn } from "node:child_process"
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
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
/** Пакунки, які ставить проект: основа, шар даних, моки, вхід, політика повторів запитів. */
const BUNDLES = ["base", "data", "mocks", "auth", "lib/query-client"]
const uiItems = registry.items
  .filter((it) => /^(ui|erp|templates|tools)\//.test(it.name))
  .map((it) => it.name)
const modules = registry.items.filter((it) => it.meta?.layer === "modules")
/** Елементи з реєстру робочої копії, що ставляться поодинці (--local): найбільше залежностей. */
const ISOLATED = ["data", "erp/phone-input", ...modules.map((it) => it.name)]
/**
 * Шар моків у збірці за групами (ADR-0079): кожна група має знайтися в збірці на моках (інакше
 * сигнатури застаріли) і не знайтися в збірці з бекендом.
 */
const MOCK_SIGNATURES = {
  // Ядро MSW: повідомлення бібліотеки й сховище cookie (з ним tough-cookie і tldts).
  msw: ["[MSW]", "__msw-cookie-store__"],
  // Ключі сховища моків кіта (`lib/mock-*`, панель сценаріїв).
  kit: ["erp-ui:mock-"],
  // Мітка моків проекту: пароль користувача моків шаблону (`mocks.ts.after-install`).
  project: ["erp-ui-smoke-mock-canary"],
}
/** Групи, яких і на моках немає в першому екрані; панель сценаріїв із ключем кіта там бути може. */
const LAZY_MOCK_GROUPS = ["msw", "project"]
/** Файли застосунку шаблону, що стають у `src/` після `shadcn add`: файл → шлях у `src/`. */
const AFTER_INSTALL = {
  "App.tsx": "App.tsx",
  "Data.tsx": "Data.tsx",
  "Contacts.tsx": "Contacts.tsx",
  "mocks.ts": "mocks/browser.ts",
}
/** Паузи перед повтором запиту до GitHub: 403/429 — ліміт API, а не помилка коду. */
const GITHUB_RETRY_DELAYS_MS = [30_000, 90_000]

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const dirs = []

/** Середовище процесу зі змінами `env`: `undefined` прибирає змінну. */
function withEnv(env) {
  const next = { ...process.env }
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete next[key]
    else next[key] = value
  }
  return next
}

const envPrefix = (env) =>
  Object.entries(env)
    .map(([key, value]) =>
      value === undefined ? `env -u ${key} ` : `${key}=${value} `,
    )
    .join("")

/**
 * Команда з виводом у консоль. Асинхронно: у цьому ж процесі працює сервер реєстру, і синхронний
 * запуск заблокував би його відповіді.
 */
function run(cwd, cmd, cmdArgs, env = {}) {
  console.log(`\n$ ${envPrefix(env)}${cmd} ${cmdArgs.join(" ")}`)
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, cmdArgs, {
      cwd,
      stdio: "inherit",
      env: withEnv(env),
    })
    child.on("error", reject)
    child.on("exit", (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${cmd} ${cmdArgs[0] ?? ""}: код ${String(code)}`))
    })
  })
}

/** Команда, що має впасти: повертає її вивід (і показує його), успіх — помилка перевірки. */
function runExpectingFailure(cwd, cmd, cmdArgs, env = {}) {
  console.log(
    `\n$ ${envPrefix(env)}${cmd} ${cmdArgs.join(" ")}   # очікується помилка`,
  )
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, cmdArgs, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: withEnv(env),
    })
    let output = ""
    for (const stream of [child.stdout, child.stderr]) {
      // Рядки, а не байти: межа шматка не розріже кириличну літеру в повідомленні запобіжника.
      stream.setEncoding("utf8")
      stream.on("data", (chunk) => {
        output += chunk
        process.stdout.write(chunk)
      })
    }
    child.on("error", reject)
    // `close`, а не `exit`: до нього вивід дочитано, і повідомлення запобіжника не загубиться.
    child.on("close", (code) => {
      if (code === 0)
        reject(new Error(`${cmd} ${cmdArgs.join(" ")}: мало впасти, а пройшло`))
      else resolve(output)
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
      ...[...BUNDLES, ...uiItems, ...modules.map((it) => it.name)].map(
        (name) => (source ? source.url(name) : `${repo}/${name}#${atRef}`),
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

  for (const [file, target] of Object.entries(AFTER_INSTALL)) {
    const to = path.join(dir, "src", target)
    mkdirSync(path.dirname(to), { recursive: true })
    renameSync(path.join(dir, `${file}.after-install`), to)
  }
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

  if (source) checkModulesVerbatim(dir)

  await exec("pnpm", ["typecheck"])
  await checkMocksOutOfProduction(dir)
}

/** JS збірки: усі файли й перший екран (вхід і його `modulepreload` з `dist/index.html`). */
function distScripts(dir) {
  const dist = path.join(dir, "dist")
  const html = readFileSync(path.join(dist, "index.html"), "utf8")
  const firstScreen = [
    ...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.js)"/g),
  ].map((match) => match[1])
  if (!firstScreen.length)
    throw new Error("dist/index.html: не знайдено вхідного скрипта")
  const all = readdirSync(dist, { recursive: true }).filter((name) =>
    name.endsWith(".js"),
  )
  const containing = (files, signatures) =>
    files.filter((file) => {
      const text = readFileSync(path.join(dist, file), "utf8")
      return signatures.some((signature) => text.includes(signature))
    })
  return { all, firstScreen, containing }
}

/** Збірка має зупинитися саме на запобіжнику `vite.config.ts` шаблону. */
async function expectGuardStop(dir, env, expected) {
  const output = await runExpectingFailure(dir, "pnpm", ["build"], env)
  if (!output.includes(expected))
    throw new Error(
      `Збірка (${envPrefix(env).trim()}) упала не на запобіжнику vite.config.ts: немає «${expected}»`,
    )
}

/**
 * Моки поза продакшном (ADR-0079): без VITE_BACKEND, з опискою чи з `mocks` лише з .env-файла збірки
 * немає; з бекендом у dist немає жодної групи шару моків; з явним `mocks` усі групи є (перевірка їх
 * бачить), а MSW і моки проекту — лише лінивими чанками, не в першому екрані.
 */
async function checkMocksOutOfProduction(dir) {
  await expectGuardStop(dir, { VITE_BACKEND: undefined }, 'VITE_BACKEND=""')
  await expectGuardStop(dir, { VITE_BACKEND: "typo" }, 'VITE_BACKEND="typo"')
  const envFile = path.join(dir, ".env.local")
  writeFileSync(envFile, "VITE_BACKEND=mocks\n")
  try {
    await expectGuardStop(
      dir,
      { VITE_BACKEND: undefined },
      "лише змінною команди",
    )
  } finally {
    rmSync(envFile)
  }

  await run(dir, "pnpm", ["build"], { VITE_BACKEND: "api" })
  const api = distScripts(dir)
  for (const [group, signatures] of Object.entries(MOCK_SIGNATURES)) {
    const leaked = api.containing(api.all, signatures)
    if (leaked.length)
      throw new Error(
        `Збірка з бекендом (VITE_BACKEND=api) містить моки (${group}): ${leaked.join(", ")}`,
      )
  }

  await run(dir, "pnpm", ["build"], { VITE_BACKEND: "mocks" })
  const mocks = distScripts(dir)
  for (const [group, signatures] of Object.entries(MOCK_SIGNATURES)) {
    if (!mocks.containing(mocks.all, signatures).length)
      throw new Error(
        `Збірка з VITE_BACKEND=mocks без групи «${group}»: сигнатури MOCK_SIGNATURES застаріли`,
      )
    const firstScreen = LAZY_MOCK_GROUPS.includes(group)
      ? mocks.containing(mocks.firstScreen, signatures)
      : []
    if (firstScreen.length)
      throw new Error(
        `Моки (${group}) у першому екрані збірки на моках: ${firstScreen.join(", ")}`,
      )
  }
}

/** Модулі, а також фоновий файл web push: браузер не зареєструє його, якщо файл загубився. */
const VERBATIM_TARGETS = ["~/src/modules/", "~/public/"]

/** Файли модулів у проекті — ті самі, що в робочій копії: shadcn нічого в них не переписав. */
function checkModulesVerbatim(dir) {
  for (const item of modules)
    for (const file of item.files) {
      if (!VERBATIM_TARGETS.some((prefix) => file.target?.startsWith(prefix)))
        continue
      const installed = readFileSync(
        path.join(dir, file.target.slice(2)),
        "utf8",
      )
      if (installed !== readFileSync(path.join(root, file.path), "utf8"))
        throw new Error(
          `${file.path}: у проекті файл модуля інший, ніж у реєстрі (ADR-0025)`,
        )
    }
}

/** Один елемент у чистому проекті: компілюються лише його файли з його залежностями. */
async function isolatedInstall(item, add) {
  const { dir, run: exec, shadcn } = await createProject()
  await add(shadcn, item)
  writeFileSync(
    path.join(dir, "tsconfig.isolated.json"),
    JSON.stringify({
      extends: "./tsconfig.json",
      include: ["src/components", "src/lib", "src/hooks", "src/modules"],
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
    // Сама доставка з GitHub — на одному елементі.
    await isolatedInstall("ui/button", (shadcn) =>
      fromGithub(() =>
        shadcn("add", `${repo}/ui/button#${ref}`, "-y", "--overwrite"),
      ),
    )
  }
  console.log(
    local
      ? `\nOK: ${String(uiItems.length + BUNDLES.length + modules.length)} елементів із робочої копії встановлено, файли модулів — дослівно, проект компілюється, моків у збірці з бекендом немає; поодинці: ${ISOLATED.join(", ")} і ui/button з ${repo}#${ref}.`
      : `\nOK: ${String(uiItems.length + BUNDLES.length + modules.length)} елементів із ${repo}#${ref} встановлено, проект компілюється, моків у збірці з бекендом немає.`,
  )
} finally {
  source?.close()
  if (keep) console.log(`Тестові проекти лишено: ${dirs.join(", ")}`)
  else for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
}
