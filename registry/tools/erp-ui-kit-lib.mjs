/**
 * Версія кіта erp-ui для `scripts/erp-ui-kit.mjs` (крок 1.9, ADR-0029): архів тегу з GitHub або
 * гілка з локальної копії кіта → перевірка → реєстр (`shadcn build`) і звіт `add --dry-run`.
 * Файл ставить `shadcn add` разом із командою: у проекті його не правте.
 */
import { spawn } from "node:child_process"
import { createWriteStream, existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { stripVTControlCharacters } from "node:util"

export const REPO = "VasulenkoIllia/erp-ui"
/** Архів тегу (з v0.3.1) — ~1,5 МБ за кілька секунд; довше — збій мережі. */
const DOWNLOAD_TIMEOUT_MS = 120_000
/** Решта команд (`shadcn build`, `add` з встановленням залежностей, `tar`, `git`): повисла мережа не тримає CI вічно. */
const COMMAND_TIMEOUT_MS = 10 * 60_000
/** Після тайм-ауту — SIGTERM, а команда, що його ігнорує, через стільки отримує SIGKILL. */
const KILL_GRACE_MS = 5_000
/** Паузи перед повторами завантаження після тимчасового збою. */
const RETRY_DELAYS_MS = [5_000, 30_000]
/** Що береться з локальної копії кіта (`--from`): реєстр і файли, на які він посилається. */
const KIT_PATHS = [
  "registry.json",
  "package.json",
  "registry",
  "design",
  "docs/CATALOG.md",
  "docs/SPEC.md",
]

/** Помилка, яку команда пояснює людині одним повідомленням (без стека). */
export class KitError extends Error {}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Тег випуску `vX.Y.Z`: тоді версія в `package.json` архіву має з ним збігатися. */
export const isReleaseTag = (ref) => /^v\d+\.\d+\.\d+$/.test(ref)

/**
 * Звіт `shadcn add --dry-run` (CLI 4.22): рядки `│ ~ src/… overwrite`, `+ … create`, `= … skip` і
 * підсумок `├ Files (N) …`. Інший формат (інша версія CLI) — помилка, а не порожній список.
 */
export function parseDryRun(output) {
  const text = stripVTControlCharacters(output)
  const files = []
  for (const line of text.split("\n")) {
    const match = /^│\s+[+~=]\s+(\S+)\s+(create|overwrite|skip)\b/.exec(line)
    if (match) files.push({ path: match[1], action: match[2] })
  }
  const total = /├\s+Files \((\d+)\)/.exec(text)
  // Порожній звіт — теж помилка: інакше маніфест без файлів вимкнув би перевірку `check`.
  if (!total || Number(total[1]) !== files.length || !files.length)
    throw new KitError(
      `Не вдалося прочитати звіт shadcn add --dry-run (інша версія CLI?):\n${text}`,
    )
  return files
}

/**
 * Звіт `--dry-run` без секцій `├ Dependencies (N)` і `├ Dev Dependencies (N)`: залежності
 * елементів команда забрала, і CLI ставити їх не має. Секція є (напр. `registryDependencies`, які CLI довантажує зі своїми
 * залежностями) — зупинка ще до запису файлів.
 */
export function assertNoDependencies(output) {
  const section = /├\s+(?:Dev )?Dependencies \(\d+\)[^]*?(?=\n├|\n└|$)/.exec(
    stripVTControlCharacters(output),
  )
  if (section)
    throw new KitError(
      `shadcn add поставив би залежності, хоч команда забрала їх з елементів (інша версія CLI?):\n${section[0]}`,
    )
}

/** Аргументи `update`: версія, `--dry-run`, `--add a,b`, `--items a,b`, `--from <тека>`. */
export function parseArgs(args) {
  const options = { dryRun: false, add: [], items: undefined, from: undefined }
  const rest = []
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    const value = () => {
      const next = args[++i]
      if (!next) throw new KitError(`${arg}: потрібне значення`)
      return next
    }
    if (arg === "--dry-run") options.dryRun = true
    else if (arg === "--add") options.add.push(...value().split(","))
    else if (arg === "--items") options.items = value().split(",")
    else if (arg === "--from") options.from = value()
    else if (arg.startsWith("-")) throw new KitError(`Невідома опція ${arg}`)
    else rest.push(arg)
  }
  return { ...options, rest }
}

/** Звіт перед записом: що зміниться; файли проекту й файли, яких у новій версії немає, — окремо. */
export function printReport(kit, files, oldFiles, projectOwned) {
  const kitFiles = files.filter((file) => !projectOwned.includes(file.path))
  const count = (action) =>
    kitFiles.filter((file) => file.action === action).length
  console.log(
    `Кіт ${kit}: ${String(count("overwrite"))} зміниться, ${String(count("create"))} нових, ${String(count("skip"))} без змін.`,
  )
  for (const file of kitFiles)
    if (file.action !== "skip")
      console.log(`  ${file.action === "create" ? "+" : "~"} ${file.path}`)
  for (const file of files)
    if (projectOwned.includes(file.path) && file.action === "overwrite")
      console.log(
        `  * ${file.path} — файл проекту: якщо проект його змінював, лишиться версія проекту з різницею`,
      )
  const kept = new Set(files.map((file) => file.path))
  for (const file of Object.keys(oldFiles).filter((file) => !kept.has(file)))
    console.log(
      `  ? ${file} — у новій версії цього файлу немає; видаліть сам, якщо не потрібен`,
    )
}

/** Невдалий `gh api`: повторити (мережа, 5xx, 429) чи зупинитись із поясненням. */
export function classifyDownloadFailure(stderr, timedOut) {
  if (timedOut) return { retry: true, message: "тайм-аут завантаження" }
  // 404: немає тегу, а в приватного репозиторію ще й токен без доступу.
  if (/HTTP 404|Not Found/.test(stderr))
    return {
      retry: false,
      message:
        "немає такого тегу, гілки чи коміту або доступу до репозиторію (gh auth status)",
    }
  if (/HTTP 401|Bad credentials|gh auth login/.test(stderr))
    return {
      retry: false,
      message: "немає доступу до GitHub: gh auth login (у CI — GH_TOKEN)",
    }
  if (/HTTP 403/.test(stderr) && /rate limit/i.test(stderr))
    return {
      retry: false,
      message: "вичерпано годинний ліміт запитів GitHub, спробуйте пізніше",
    }
  if (/HTTP (429|5\d\d)/.test(stderr))
    return { retry: true, message: stderr.trim() }
  if (/HTTP 4\d\d/.test(stderr)) return { retry: false, message: stderr.trim() }
  return { retry: true, message: stderr.trim() || "збій мережі" }
}

/**
 * Команда з тайм-аутом (за замовчуванням `COMMAND_TIMEOUT_MS`); `capture` — повернути вивід,
 * `stdoutFile` — писати його у файл. Без `capture` вивід іде в термінал наживо.
 */
export function run(
  cmd,
  args,
  { cwd, capture = false, stdoutFile, timeoutMs = COMMAND_TIMEOUT_MS } = {},
) {
  return new Promise((resolve, reject) => {
    const out = stdoutFile ? createWriteStream(stdoutFile) : undefined
    const child = spawn(cmd, args, {
      cwd,
      stdio: ["ignore", capture || out ? "pipe" : "inherit", "pipe"],
    })
    let stdout = ""
    let stderr = ""
    let timedOut = false
    let killTimer
    const timer = setTimeout(() => {
      timedOut = true
      child.kill("SIGTERM")
      killTimer = setTimeout(() => child.kill("SIGKILL"), KILL_GRACE_MS)
    }, timeoutMs)
    const fail = (error) => {
      clearTimeout(timer)
      clearTimeout(killTimer)
      child.kill("SIGTERM")
      out?.destroy()
      reject(error)
    }
    // Рядки звіту з «│» не розриваються посеред символу на межі шматків виводу.
    child.stderr.setEncoding("utf8")
    if (out) {
      out.on("error", (error) =>
        fail(
          new KitError(`Не вдалося записати ${stdoutFile}: ${error.message}`),
        ),
      )
      child.stdout.pipe(out)
    } else if (capture) {
      child.stdout.setEncoding("utf8")
      child.stdout.on("data", (chunk) => (stdout += chunk))
    }
    child.stderr.on("data", (chunk) => {
      stderr += chunk
      if (!capture && !out) process.stderr.write(chunk)
    })
    child.on("error", (error) =>
      fail(
        error.code === "ENOENT"
          ? new KitError(`Не знайдено програму ${cmd}: встановіть її`)
          : error,
      ),
    )
    child.on("close", (code) => {
      clearTimeout(timer)
      clearTimeout(killTimer)
      const done = () => resolve({ code, stdout, stderr, timedOut })
      // pipe сам закриває файл, щойно вивід скінчився; чекаємо, поки все дописано.
      if (out && !out.writableFinished) out.once("finish", done)
      else done()
    })
  })
}

/**
 * Команда, що мусить пройти. Вивід, який не йшов у термінал (`capture`), — у тексті помилки: shadcn
 * пише причину збою в stdout, а не в stderr.
 */
export async function mustRun(cmd, args, options = {}) {
  const result = await run(cmd, args, options)
  if (result.code === 0 && !result.timedOut) return result
  const name = `${path.basename(cmd)} ${args[0] ?? ""}`.trim()
  const reason = result.timedOut
    ? `не завершилась за ${String(Math.round((options.timeoutMs ?? COMMAND_TIMEOUT_MS) / 60_000))} хв`
    : `код ${String(result.code)}`
  const output = options.capture
    ? `${result.stdout}${result.stderr}`.trim()
    : ""
  throw new KitError(`${name}: ${reason}${output ? `\n${output}` : ""}`)
}

/** JSON із файлу; зіпсований чи відсутній — пояснення замість стека. */
export function readJson(file, what) {
  try {
    return JSON.parse(readFileSync(file, "utf8"))
  } catch (error) {
    throw new KitError(
      `Не вдалося прочитати ${what} (${file}): ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

/** Тег із GitHub одним запитом: тайм-аут, повтори на тимчасових збоях, без повтору на 4xx. */
async function downloadTag(ref, dir) {
  const archive = path.join(dir, "kit.tar.gz")
  for (let attempt = 0; ; attempt++) {
    const result = await run("gh", ["api", `repos/${REPO}/tarball/${ref}`], {
      stdoutFile: archive,
      timeoutMs: DOWNLOAD_TIMEOUT_MS,
    })
    if (result.code === 0 && !result.timedOut) break
    const failure = classifyDownloadFailure(result.stderr, result.timedOut)
    const delay = RETRY_DELAYS_MS[attempt]
    if (!failure.retry || delay === undefined)
      throw new KitError(`Кіт ${ref} не завантажився: ${failure.message}`)
    console.warn(
      `Кіт ${ref}: ${failure.message}. Повтор через ${String(delay / 1000)} с.`,
    )
    await sleep(delay)
  }
  await mustRun("tar", ["-xzf", archive, "-C", dir, "--strip-components=1"])
}

/** Закомічений стан гілки чи коміту локальної копії кіта; повертає SHA коміту. */
async function copyFromCheckout(ref, from, dir) {
  const sha = await mustRun(
    "git",
    [
      "-C",
      from,
      "rev-parse",
      "--verify",
      "--end-of-options",
      `${ref}^{commit}`,
    ],
    { capture: true },
  )
  const status = await mustRun("git", ["-C", from, "status", "--porcelain"], {
    capture: true,
  })
  if (status.stdout.trim())
    console.warn(
      `У ${from} є незакомічені зміни: в оновлення йде лише закомічений стан ${ref}.`,
    )
  const tar = path.join(dir, "kit.tar")
  await mustRun("git", [
    "-C",
    from,
    "archive",
    "--format=tar",
    `--output=${tar}`,
    ref,
    "--",
    ...KIT_PATHS,
  ])
  await mustRun("tar", ["-xf", tar, "-C", dir])
  return sha.stdout.trim()
}

/** CLI shadcn самого проекту: та сама закріплена версія для збирання й встановлення. */
export function shadcnBin(root) {
  const bin = path.join(root, "node_modules", ".bin", "shadcn")
  if (!existsSync(bin))
    throw new KitError(
      "У проекті немає CLI shadcn (node_modules/.bin/shadcn): закріпіть версію в package.json і встановіть залежності",
    )
  return bin
}

/**
 * Реєстр версії кіта в `dir/r`: архів тегу (чи гілка локальної копії) → перевірка, що це той
 * репозиторій і та версія → `shadcn build`. `kit` — що записати як версію: тег, а для гілки з
 * локальної копії — гілка з SHA коміту (гілка рухається).
 */
export async function buildKit({ ref, from, root, dir }) {
  let kit = ref
  if (from) {
    const sha = await copyFromCheckout(ref, path.resolve(root, from), dir)
    if (!isReleaseTag(ref)) kit = `${ref}@${sha.slice(0, 12)}`
  } else await downloadTag(ref, dir)
  const registryFile = path.join(dir, "registry.json")
  if (!existsSync(registryFile))
    throw new KitError(`У версії ${ref} немає registry.json: це не кіт erp-ui`)
  const registry = readJson(registryFile, `registry.json версії ${ref}`)
  if (registry.homepage !== `https://github.com/${REPO}`)
    throw new KitError(`registry.json версії ${ref} — не з ${REPO}`)
  const { version } = readJson(
    path.join(dir, "package.json"),
    `package.json версії ${ref}`,
  )
  if (isReleaseTag(ref) && `v${String(version)}` !== ref)
    throw new KitError(`Тег ${ref} містить версію ${String(version)}`)
  const out = path.join(dir, "r")
  await mustRun(
    shadcnBin(root),
    ["build", registryFile, "-c", dir, "-o", out],
    {
      capture: true,
    },
  )
  return { out, kit }
}
