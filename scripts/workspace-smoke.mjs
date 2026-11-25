#!/usr/bin/env node
/**
 * Адмінка в монорепо (ADR-0097): сервер і адмінка в одному репозиторії, адмінка — окремий пакет робочого простору
 * pnpm. Кіт попереднього тегу ставиться в пакет адмінки, як у посібнику (`base` тегу, решта — командою тегу з теки
 * пакета), і оновлюється до цього коміту командою цієї версії.
 *
 *   node scripts/workspace-smoke.mjs [--keep]
 *
 * Перевіряє: файли кіта й `kit-files.json` лише в пакеті адмінки; нові залежності — у `package.json` адмінки, її
 * запис точною версією лишається, `package.json` кореня й сервера не змінюються, lock-файл один — у корені;
 * незакомічена правка сервера зупиняє `update` (чистим має бути весь репозиторій); typecheck і збірка адмінки,
 * `check` і `check-tokens` з теки пакета; typecheck сервера зі схемами кіта з теки адмінки (посібник, «Сервер на
 * TypeScript», ADR-0093). Усе — з цієї копії кіта, без GitHub.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

import { mustRun } from "../registry/tools/erp-ui-kit-lib.mjs"
import {
  buildProject,
  COMMAND,
  commandAt,
  commitAll,
  expect,
  followProjectSteps,
  git,
  kit,
  latestReleaseTag,
  MANIFEST,
  projectAt,
  root,
  toHead,
} from "./upgrade-smoke-project.mjs"

const keep = process.argv.includes("--keep")

const ADMIN = "apps/admin"
const SERVER = "apps/server"
const SERVER_FILE = `${SERVER}/src/invoices.ts`
/** Файли кореня й сервера, яких команда кіта в пакеті адмінки не чіпає. */
const UNTOUCHED = [
  "package.json",
  "pnpm-workspace.yaml",
  ".gitignore",
  `${SERVER}/package.json`,
  `${SERVER}/tsconfig.json`,
  SERVER_FILE,
]
/** Усе, що є поза пакетом адмінки: файли кореня й сервера і один lock-файл воркспейсу. */
const OUTSIDE_ADMIN = [...UNTOUCHED, "pnpm-lock.yaml"].sort()
/** Файли кіта поза `src/` (команда, скіл, довідка, помічники e2e, фоновий файл push) і стилі — у пакеті адмінки. */
const KIT_FILES = [
  MANIFEST,
  "scripts/erp-ui-kit.mjs",
  ".claude/skills/erp-ui/SKILL.md",
  "docs/erp-ui/CLAUDE.project.md",
  "e2e/erp-ui.ts",
  "public/erp-ui-push-sw.js",
  "src/styles/erp-ui/themes.css",
]
/**
 * Запис адмінки до кіта точною версією: команда кіта не переписує його своїм діапазоном. Залежність не з `base` і не
 * з `init`: їх ставить сам CLI на першому кроці й переписав би діапазон.
 */
const PINNED = "sonner"
/** Залежність кіта, що до встановлення є лише в сервері: команда ставить її адмінці. */
const SERVER_ONLY = "zod"

const readJsonFile = (file) => JSON.parse(readFileSync(file, "utf8"))
const kitRange = (name) =>
  readJsonFile(path.join(root, "registry/package.json")).dependencies[name]
const writeFile = (file, text) => {
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, text)
}

/**
 * Корінь воркспейсу без залежностей кіта і сервер, що бере схему рахунку з теки адмінки (шляхи — як у посібнику).
 * Повертає вміст файлів, які мають лишитися як були.
 */
function setupWorkspace(ws) {
  const json = (value) => `${JSON.stringify(value, null, 2)}\n`
  const template = readJsonFile(
    path.join(root, "tests/consumer/template/package.json"),
  )
  writeFile(
    path.join(ws, "package.json"),
    json({ name: "erp-ui-workspace-smoke", private: true }),
  )
  writeFile(path.join(ws, "pnpm-workspace.yaml"), "packages:\n  - apps/*\n")
  writeFile(path.join(ws, ".gitignore"), "node_modules/\ndist/\n")
  writeFile(
    path.join(ws, SERVER, "package.json"),
    json({
      name: "erp-ui-workspace-smoke-server",
      private: true,
      type: "module",
      scripts: { typecheck: "tsc -p tsconfig.json" },
      dependencies: { [SERVER_ONLY]: kitRange(SERVER_ONLY) },
      devDependencies: { typescript: template.devDependencies.typescript },
    }),
  )
  writeFile(
    path.join(ws, SERVER, "tsconfig.json"),
    json({
      compilerOptions: {
        target: "ES2023",
        lib: ["ES2023", "DOM"],
        module: "ESNext",
        moduleResolution: "bundler",
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        types: [],
        paths: {
          "@/lib/*": ["../admin/src/lib/*"],
          "@/modules/*": ["../admin/src/modules/*"],
        },
      },
      include: ["src"],
    }),
  )
  writeFile(
    path.join(ws, SERVER_FILE),
    [
      "// Схема відповіді сервера — та сама функція контракту, що в адмінці й моках (ADR-0093).",
      'import { invoiceSchemaFor } from "@/modules/K2-invoices/contract"',
      "",
      "export const invoiceSchema = invoiceSchemaFor()",
      "",
    ].join("\n"),
  )
  return new Map(
    UNTOUCHED.map((file) => [file, readFileSync(path.join(ws, file), "utf8")]),
  )
}

/**
 * Файли кіта лише в пакеті адмінки: поза ним — лише файли кореня й сервера та lock-файл воркспейсу (відстежувані й
 * нові, без ігнорованих), їхній уміст як був; залежності — у `package.json` адмінки, CLI — у `devDependencies`.
 */
async function assertLayout(ws, untouched, pinned, what) {
  const admin = path.join(ws, ADMIN)
  for (const file of KIT_FILES)
    expect(
      existsSync(path.join(admin, file)),
      `${what}: немає ${ADMIN}/${file}`,
    )
  const listed = await git(
    ws,
    "ls-files",
    "--cached",
    "--others",
    "--exclude-standard",
  )
  const outside = listed
    .split("\n")
    .filter((file) => file && !file.startsWith(`${ADMIN}/`))
    .sort()
  expect(
    JSON.stringify(outside) === JSON.stringify(OUTSIDE_ADMIN),
    `${what}: поза пакетом адмінки — ${outside.join(", ")}, а мають бути лише ${OUTSIDE_ADMIN.join(", ")}`,
  )
  for (const [file, text] of untouched)
    expect(
      readFileSync(path.join(ws, file), "utf8") === text,
      `${what}: змінено ${file} (корінь і сервер мають лишитися як були)`,
    )
  const { dependencies, devDependencies } = readJsonFile(
    path.join(admin, "package.json"),
  )
  expect(
    dependencies[PINNED] === pinned,
    `${what}: запис адмінки ${PINNED} ${pinned} став ${String(dependencies[PINNED])}`,
  )
  expect(
    dependencies[SERVER_ONLY],
    `${what}: ${SERVER_ONLY} є лише в сервері, а адмінці команда його не поставила`,
  )
  expect(
    !dependencies.shadcn && /^\d+\.\d+\.\d+$/.test(devDependencies.shadcn),
    `${what}: CLI shadcn не в devDependencies точною версією`,
  )
}

/**
 * Залежності ставить саме команда цієї версії: перед оновленням адмінка без `SERVER_ONLY` (він лишається в сервері),
 * після — з ним, а звіт називає його новим.
 */
async function removeServerOnlyFromAdmin(admin) {
  await mustRun("pnpm", ["remove", SERVER_ONLY], { cwd: admin })
  await commitAll(admin, `адмінка без ${SERVER_ONLY}`)
}

/** `check-tokens` без аргументів перевіряє саме `src` пакета (тека з `components.json`, ADR-0096 п. 2). */
async function assertTokensCheck(admin) {
  const { stdout } = await mustRun(
    process.execPath,
    ["scripts/erp-ui-check-tokens.mjs"],
    { cwd: admin, capture: true },
  )
  console.log(stdout)
  expect(
    /теки: src — /.test(stdout),
    "check-tokens без аргументів перевірив не теку src пакета адмінки",
  )
}

/** Чисте дерево — увесь репозиторій: незакомічена правка сервера зупиняє `update` до запису. */
async function assertServerChangeStops(ws, script) {
  const file = path.join(ws, SERVER_FILE)
  const original = readFileSync(file, "utf8")
  writeFileSync(file, `${original}// незакомічена правка сервера\n`)
  try {
    const stopped = await kit(path.join(ws, ADMIN), script, toHead(), {
      fail: true,
    })
    expect(
      stopped.includes("Спершу закомітьте зміни") &&
        stopped.includes(SERVER_FILE),
      "update не зупинився на незакоміченій правці сервера",
    )
  } finally {
    writeFileSync(file, original)
  }
}

const temp = mkdtempSync(path.join(tmpdir(), "erp-ui-workspace-"))
try {
  const tag = await latestReleaseTag()
  const ws = path.join(temp, "repo")
  const admin = path.join(ws, ADMIN)
  const head = (await git(root, "rev-parse", "HEAD")).trim()
  console.log(`Адмінка в монорепо: кіт ${tag} у ${ADMIN} → цей коміт (${head})`)
  const untouched = setupWorkspace(ws)
  const pinned = kitRange(PINNED).replace(/^[\^~]/, "")
  await projectAt(tag, admin, temp, {
    repo: ws,
    dependencies: { [PINNED]: pinned },
  })
  await assertLayout(ws, untouched, pinned, `доставка ${tag}`)

  console.log(`\n=== Оновлення ${tag} → HEAD командою цієї версії ===`)
  const script = await commandAt("HEAD", path.join(temp, "head"))
  await removeServerOnlyFromAdmin(admin)
  await assertServerChangeStops(ws, script)
  const report = await kit(admin, script, toHead())
  expect(
    report.includes(`${SERVER_ONLY}@${kitRange(SERVER_ONLY)}`),
    `звіт update не назвав ${SERVER_ONLY} новою залежністю адмінки`,
  )
  await assertLayout(ws, untouched, pinned, "оновлення до HEAD")
  await followProjectSteps(admin, tag)
  await buildProject(admin, "адмінка після оновлення")
  await kit(admin, COMMAND, ["check"])
  await assertTokensCheck(admin)
  console.log("\n=== typecheck сервера зі схемами кіта ===")
  await mustRun("pnpm", ["typecheck"], { cwd: path.join(ws, SERVER) })
  console.log(
    `\nOK: кіт ${tag} поставлено в ${ADMIN} і оновлено до цього коміту; файли й залежності кіта — у пакеті адмінки, корінь і сервер не змінено, правка сервера зупиняє update, адмінка й сервер компілюються.`,
  )
} finally {
  if (keep) console.log(`Тестовий робочий простір лишено: ${temp}`)
  else
    try {
      rmSync(temp, { recursive: true, force: true })
    } catch (error) {
      // Збій прибирання не має підмінити справжню причину падіння сценарію.
      console.warn(`Не вдалося прибрати ${temp}: ${String(error)}`)
    }
}
