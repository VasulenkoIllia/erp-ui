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
  expect,
  followProjectSteps,
  git,
  kit,
  MANIFEST,
  projectAt,
  root,
} from "./upgrade-smoke-project.mjs"

const keep = process.argv.includes("--keep")

const RELEASE_TAG = /^v\d+\.\d+\.\d+$/
const ADMIN = "apps/admin"
const SERVER = "apps/server"
const SERVER_FILE = `${SERVER}/src/invoices.ts`
/** Файли кореня й сервера, яких команда кіта в пакеті адмінки не чіпає. */
const UNTOUCHED = [
  "package.json",
  "pnpm-workspace.yaml",
  ".gitignore",
  `${SERVER}/package.json`,
  SERVER_FILE,
]
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
/** Запис адмінки до кіта точною версією: команда кіта не переписує його своїм діапазоном. */
const PINNED = "i18next"
/** Залежність кіта, що до встановлення є лише в сервері: команда ставить її адмінці. */
const SERVER_ONLY = "zod"

const readJsonFile = (file) => JSON.parse(readFileSync(file, "utf8"))
const kitRange = (name) =>
  readJsonFile(path.join(root, "registry/package.json")).dependencies[name]
const writeFile = (file, text) => {
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, text)
}

/** `update` до цього коміту з цієї копії кіта. */
const toHead = () => ["update", "HEAD", "--from", root]

/** Найновіший тег випуску (за версією). */
async function previousTag() {
  const tags = await git(root, "tag", "--list", "v*", "--sort=-v:refname")
  const tag = tags.split("\n").find((name) => RELEASE_TAG.test(name))
  expect(tag, "у копії немає тегів vX.Y.Z (CI: fetch-depth: 0)")
  return tag
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

/** Файли кіта лише в пакеті адмінки, залежності — у її `package.json`, корінь і сервер — як були. */
function assertLayout(ws, untouched, pinned, what) {
  const admin = path.join(ws, ADMIN)
  for (const file of KIT_FILES) {
    expect(
      existsSync(path.join(admin, file)),
      `${what}: немає ${ADMIN}/${file}`,
    )
    for (const other of ["", SERVER])
      expect(
        !existsSync(path.join(ws, other, file)),
        `${what}: файл кіта ${path.posix.join(other, file)} поза пакетом адмінки`,
      )
  }
  for (const [file, text] of untouched)
    expect(
      readFileSync(path.join(ws, file), "utf8") === text,
      `${what}: команда кіта змінила ${file}`,
    )
  expect(
    existsSync(path.join(ws, "pnpm-lock.yaml")) &&
      !existsSync(path.join(admin, "pnpm-lock.yaml")),
    `${what}: lock-файл не лише в корені воркспейсу`,
  )
  const { dependencies } = readJsonFile(path.join(admin, "package.json"))
  expect(
    dependencies[PINNED] === pinned,
    `${what}: запис адмінки ${PINNED} ${pinned} став ${String(dependencies[PINNED])}`,
  )
  expect(
    dependencies[SERVER_ONLY],
    `${what}: ${SERVER_ONLY} є лише в сервері, а адмінці команда його не поставила`,
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
  const tag = await previousTag()
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
  assertLayout(ws, untouched, pinned, `доставка ${tag}`)

  console.log(`\n=== Оновлення ${tag} → HEAD командою цієї версії ===`)
  const script = await commandAt("HEAD", path.join(temp, "head"))
  await assertServerChangeStops(ws, script)
  await kit(admin, script, toHead())
  await followProjectSteps(admin, tag)
  await buildProject(admin, "адмінка після оновлення")
  await kit(admin, COMMAND, ["check"])
  await mustRun(process.execPath, ["scripts/erp-ui-check-tokens.mjs"], {
    cwd: admin,
  })
  console.log("\n=== typecheck сервера зі схемами кіта ===")
  await mustRun("pnpm", ["typecheck"], { cwd: path.join(ws, SERVER) })
  assertLayout(ws, untouched, pinned, "оновлення до HEAD")
  console.log(
    `\nOK: кіт ${tag} поставлено в ${ADMIN} і оновлено до цього коміту; файли й залежності кіта — у пакеті адмінки, корінь і сервер не змінено, правка сервера зупиняє update, адмінка й сервер компілюються.`,
  )
} finally {
  if (keep) console.log(`Тестовий робочий простір лишено: ${temp}`)
  else rmSync(temp, { recursive: true, force: true })
}
