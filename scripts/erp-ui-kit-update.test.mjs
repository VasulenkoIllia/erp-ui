/**
 * Повний `update` команди кіта (ADR-0029, доповнення fix-kit-deps) з підробленими CLI shadcn і
 * менеджерами пакетів: файли кіта, файли проекту, залежності, маніфест і зупинки з поясненням.
 */
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
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
import { after, test } from "node:test"
import { fileURLToPath } from "node:url"

const SCRIPT = fileURLToPath(
  new URL("../registry/tools/erp-ui-kit.mjs", import.meta.url),
)

const dirs = []
after(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
})
const tempDir = (prefix) => {
  const dir = mkdtempSync(path.join(tmpdir(), prefix))
  dirs.push(dir)
  return dir
}

// Підроблений CLI shadcn 4.22: build — реєстр з одним елементом із залежностями; add --dry-run —
// звіт, і як справжній CLI — секції «Dependencies» і «Dev Dependencies», якщо в елементі є
// залежності (FAKE_DRY_RUN_DEPS — і без них, лише для розробки); add — файли версії кіта й, як
// CLI, кожна залежність елемента в package.json заново (FAKE_ADD_TOUCHES_DEPS — і без них: інша
// версія CLI).
const FAKE_SHADCN = `#!/usr/bin/env node
const fs = require("node:fs")
const path = require("node:path")
const FILES = {
  "src/lib/a.ts": "export const a = 2\\n",
  "src/index.css": "/* кіт 2 */\\n",
  ".claude/skills/erp-ui/SKILL.md": "скіл\\n",
}
const [cmd, ...args] = process.argv.slice(2)
const itemDeps = () => {
  const deps = { dependencies: [], devDependencies: [] }
  for (const item of args.filter((arg) => arg.endsWith(".json"))) {
    const json = JSON.parse(fs.readFileSync(item, "utf8"))
    for (const field of Object.keys(deps)) deps[field].push(...(json[field] ?? []))
  }
  return deps
}
if (cmd === "build") {
  const out = args[args.indexOf("-o") + 1]
  fs.mkdirSync(out, { recursive: true })
  fs.writeFileSync(path.join(out, "base.json"), JSON.stringify({
    name: "base",
    dependencies: ["kept@^1.0.0", "fresh@^2.1.0"],
    devDependencies: ["@axe-core/playwright@^4.14.0", "fresh-dev@^3.0.0"],
  }))
} else if (cmd === "add" && args.includes("--dry-run")) {
  const lines = Object.entries(FILES).map(([file, text]) => {
    const now = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null
    const action = now === null ? "create" : now === text ? "skip" : "overwrite"
    return "│ " + { create: "+", skip: "=", overwrite: "~" }[action] + " " + file + "   " + action
  })
  const { dependencies, devDependencies } = itemDeps()
  if (process.env.FAKE_DRY_RUN_DEPS) devDependencies.push("extra@^1.0.0")
  console.log("├ Files (" + lines.length + ")\\n" + lines.join("\\n"))
  for (const [title, deps] of [["Dependencies", dependencies], ["Dev Dependencies", devDependencies]])
    if (deps.length)
      console.log("│\\n├ " + title + " (" + deps.length + ")\\n" + deps.map((d) => "│ + " + d).join("\\n"))
} else if (cmd === "add") {
  for (const [file, text] of Object.entries(FILES)) {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, text)
  }
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"))
  const deps = itemDeps()
  if (process.env.FAKE_ADD_TOUCHES_DEPS) deps.devDependencies.push("extra@^1.0.0")
  let changed = false
  for (const [field, specs] of Object.entries(deps))
    for (const spec of specs) {
      pkg[field][spec.replace(/@[^@]*$/, "")] = "^9.9.9"
      changed = true
    }
  if (changed) fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\\n")
} else process.exit(1)
`

// Підроблений pnpm: \`--version\`; \`add [-D] -- назва@діапазон\` — журнал викликів поруч, запис у
// package.json, «встановлення» в node_modules і, як справжній, pnpm-lock.yaml, якщо його немає.
// FAKE_PNPM_FAIL — збій; FAKE_PNPM_TOUCHES — ще й переписує наявний діапазон (як міг би інший
// менеджер).
const FAKE_PNPM = `#!/usr/bin/env node
const fs = require("node:fs")
const path = require("node:path")
const args = process.argv.slice(2)
if (args[0] === "--version") {
  console.log("12.11.2")
  process.exit(0)
}
fs.appendFileSync(path.join(__dirname, "calls.log"), args.join(" ") + "\\n")
if (process.env.FAKE_PNPM_FAIL) {
  console.error("ERR_PNPM_FETCH_404")
  process.exit(1)
}
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"))
const field = args.includes("-D") ? "devDependencies" : "dependencies"
for (const spec of args.slice(args.indexOf("--") + 1)) {
  const at = spec.lastIndexOf("@")
  const [name, range] = [spec.slice(0, at), spec.slice(at + 1)]
  pkg[field][name] = range
  fs.mkdirSync(path.join("node_modules", name), { recursive: true })
  fs.writeFileSync(
    path.join("node_modules", name, "package.json"),
    JSON.stringify({ version: range.replace(/^[\\^~]/, "") }),
  )
}
if (process.env.FAKE_PNPM_TOUCHES) pkg.dependencies.kept = "^1.0.2"
fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\\n")
if (!fs.existsSync("pnpm-lock.yaml")) fs.writeFileSync("pnpm-lock.yaml", "lockfileVersion: '9.0'\\n")
`

// Інший менеджер у проекті з pnpm-lock.yaml — помилка визначення: тест упаде гучно, без мережі.
const unexpected = (name) =>
  `#!/usr/bin/env node\nconsole.error("неочікуваний ${name}")\nprocess.exit(1)\n`

/** git без глобальних налаштувань людини (підпис комітів, GIT_DIR): тест не залежить від машини. */
const gitEnv = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")),
)
const git = (cwd, ...args) => {
  const result = spawnSync(
    "git",
    [
      "-c",
      "user.name=test",
      "-c",
      "user.email=test@example.com",
      "-c",
      "commit.gpgsign=false",
      "-c",
      "tag.gpgsign=false",
      ...args,
    ],
    { cwd, encoding: "utf8", env: gitEnv },
  )
  assert.equal(result.status, 0, result.stderr)
}

const writeFiles = (dir, files) => {
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
    writeFileSync(path.join(dir, file), text)
  }
}

/** Копія кіта з тегом v1.0.0: лише те, що бере --from. */
function kitCheckout() {
  const dir = tempDir("erp-ui-kit-src-")
  writeFiles(dir, {
    "registry.json": JSON.stringify({
      homepage: "https://github.com/VasulenkoIllia/erp-ui",
    }),
    "package.json": JSON.stringify({ version: "1.0.0" }),
    "registry/lib/a.ts": "export const a = 2\n",
    "design/palette-tokens.json": "{}",
    "docs/CATALOG.md": "#",
    "docs/SPEC.md": "#",
  })
  git(dir, "init", "-q")
  git(dir, "add", ".")
  git(dir, "commit", "-qm", "kit")
  git(dir, "tag", "v1.0.0")
  return dir
}

const sha = (text) => createHash("sha256").update(text).digest("hex")

/**
 * Проект для повного `update`: старий маніфест, файл проекту, підроблені shadcn (у проекті) і
 * менеджери пакетів (у PATH), залежності `kept` і axe з діапазонами проекту, які кіт описує інакше.
 * `lock: false` — без lock-файлу; `packageManager` — поле в package.json; `keptVersion` —
 * встановлена версія `kept`.
 */
function updateProject({
  lock = true,
  packageManager,
  keptVersion = "1.0.2",
} = {}) {
  const dir = tempDir("erp-ui-kit-test-")
  writeFiles(dir, {
    ".gitignore": "node_modules/\n.claude/\n",
    "components.json": "{}",
    "package.json": JSON.stringify({
      packageManager,
      dependencies: { kept: "~1.0.0" },
      devDependencies: { shadcn: "4.22.0", "@axe-core/playwright": "~4.14.0" },
    }),
    ...(lock ? { "pnpm-lock.yaml": "lockfileVersion: '9.0'\n" } : {}),
    "node_modules/kept/package.json": JSON.stringify({ version: keptVersion }),
    "node_modules/@axe-core/playwright/package.json": JSON.stringify({
      version: "4.14.0",
    }),
    "src/lib/a.ts": "export const a = 1\n",
    "src/index.css": "/* кіт 1 + проект */\n",
    // Старий формат тестового проекту: { kit, files } без items і own.
    "kit-files.json": JSON.stringify({
      kit: "v0.3.1",
      files: { "src/lib/a.ts": sha("export const a = 1\n") },
    }),
  })
  mkdirSync(path.join(dir, "node_modules", ".bin"))
  writeFileSync(path.join(dir, "node_modules", ".bin", "shadcn"), FAKE_SHADCN, {
    mode: 0o755,
  })
  git(dir, "init", "-q")
  git(dir, "add", ".")
  git(dir, "commit", "-qm", "project")
  const fakeBin = tempDir("erp-ui-kit-bin-")
  writeFileSync(path.join(fakeBin, "pnpm"), FAKE_PNPM, { mode: 0o755 })
  for (const name of ["npm", "yarn", "bun"])
    writeFileSync(path.join(fakeBin, name), unexpected(name), { mode: 0o755 })
  const update = ({ env = {}, args = [] } = {}) =>
    spawnSync(
      process.execPath,
      [
        SCRIPT,
        "update",
        "v1.0.0",
        "--from",
        kitCheckout(),
        "--items",
        "base",
        ...args,
      ],
      {
        cwd: dir,
        encoding: "utf8",
        env: {
          ...gitEnv,
          PATH: `${fakeBin}${path.delimiter}${String(process.env.PATH)}`,
          ...env,
        },
      },
    )
  const calls = path.join(fakeBin, "calls.log")
  const read = (file) => readFileSync(path.join(dir, file), "utf8")
  return {
    dir,
    update,
    read,
    pnpmCalls: () => (existsSync(calls) ? readFileSync(calls, "utf8") : ""),
  }
}

/** Зупинка: код 1, пояснення, файл кіта й маніфест не змінені, менеджер пакетів не запускався. */
function assertStoppedBeforeWrite(project, result, message) {
  assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`)
  assert.match(result.stderr, message)
  assert.equal(project.read("src/lib/a.ts"), "export const a = 1\n")
  assert.match(project.read("kit-files.json"), /"v0\.3\.1"/)
  assert.equal(project.pnpmCalls(), "")
}

test("update: увесь ланцюжок — файли кіта, файл проекту, ігноровані, залежності, новий маніфест", () => {
  const project = updateProject()
  const result = project.update()
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  assert.match(result.stdout, /Кіт v1\.0\.0: 1 зміниться, 1 нових, 0 без змін/)
  assert.match(result.stdout, /\* src\/index\.css — файл проекту/)
  assert.match(
    result.stdout,
    /Без відбитків \(git їх ігнорує.*\.claude\/skills\/erp-ui\/SKILL\.md/,
  )

  // Залежності (крок fix-kit-deps): наявні — з діапазонами проекту, нові — з діапазоном кіта,
  // одним викликом для застосунку й одним для розробки; CLI shadcn їх не бачив.
  assert.match(
    result.stdout,
    /Нові залежності: fresh@\^2\.1\.0, fresh-dev@\^3\.0\.0 \(для розробки\)\. Наявні в package\.json — без змін\./,
  )
  assert.equal(
    project.pnpmCalls(),
    "add -- fresh@^2.1.0\nadd -D -- fresh-dev@^3.0.0\n",
  )
  assert.deepEqual(JSON.parse(project.read("package.json")), {
    dependencies: { kept: "~1.0.0", fresh: "^2.1.0" },
    devDependencies: {
      shadcn: "4.22.0",
      "@axe-core/playwright": "~4.14.0",
      "fresh-dev": "^3.0.0",
    },
  })
  assert.doesNotMatch(result.stderr, /Увага/)

  assert.deepEqual(JSON.parse(project.read("kit-files.json")), {
    kit: "v1.0.0",
    items: ["base"],
    files: { "src/lib/a.ts": sha("export const a = 2\n") },
    own: { "src/index.css": sha("/* кіт 2 */\n") },
  })
  // Без відбитка минулого встановлення файл проекту вважається зміненим проектом — лишається його.
  assert.equal(project.read("src/index.css"), "/* кіт 1 + проект */\n")
  const check = spawnSync(process.execPath, [SCRIPT, "check"], {
    cwd: project.dir,
    encoding: "utf8",
  })
  assert.equal(check.status, 0, check.stderr)
})

test("update --dry-run: звіт з новими залежностями, нічого не записує й не ставить", () => {
  const project = updateProject()
  const pkg = project.read("package.json")
  const result = project.update({ args: ["--dry-run"] })
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  assert.match(result.stdout, /Нові залежності: fresh@\^2\.1\.0/)
  assert.equal(project.read("package.json"), pkg)
  assert.equal(project.read("src/lib/a.ts"), "export const a = 1\n")
  assert.match(project.read("kit-files.json"), /"v0\.3\.1"/)
  assert.equal(project.pnpmCalls(), "")
})

test("update: встановлена версія поза діапазоном кіта — лишається проектова, попередження й наприкінці", () => {
  const project = updateProject({ keptVersion: "0.9.0" })
  const result = project.update()
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  const line =
    /! kept: кіт чекає \^1\.0\.0, у проекті ~1\.0\.0 \(встановлено 0\.9\.0\) — лишається версія проекту/
  assert.match(result.stdout, line)
  assert.match(result.stderr, /Увага: 1 залежн\. проекту не в діапазоні кіта/)
  assert.match(result.stderr, line)
  assert.equal(
    JSON.parse(project.read("package.json")).dependencies.kept,
    "~1.0.0",
  )
})

test("update: звіт CLI обіцяє залежності — зупинка ще до запису файлів", () => {
  const project = updateProject()
  assertStoppedBeforeWrite(
    project,
    project.update({ env: { FAKE_DRY_RUN_DEPS: "1" } }),
    /shadcn add поставив би залежності, хоч команда забрала їх/,
  )
})

test("update: менеджер пакетів не визначити, а ставити треба — зупинка до запису, npm не вгадуємо", () => {
  const project = updateProject({ lock: false })
  assertStoppedBeforeWrite(
    project,
    project.update(),
    /Не вдалося визначити менеджер пакетів[^]*fresh@\^2\.1\.0/,
  )
})

test("update: packageManager без lock-файлу — ставить ним, і його новий lock-файл не чужий", () => {
  const project = updateProject({
    lock: false,
    packageManager: "pnpm@12.11.2",
  })
  const result = project.update()
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  assert.equal(
    project.pnpmCalls(),
    "add -- fresh@^2.1.0\nadd -D -- fresh-dev@^3.0.0\n",
  )
  assert.ok(existsSync(path.join(project.dir, "pnpm-lock.yaml")))
  assert.match(project.read("kit-files.json"), /"v1\.0\.0"/)
})

test("update: CLI shadcn сам змінив package.json — зупинка з поясненням, маніфест старий", () => {
  const project = updateProject()
  const result = project.update({ env: { FAKE_ADD_TOUCHES_DEPS: "1" } })
  assert.equal(result.status, 1)
  assert.match(
    result.stderr,
    /shadcn add змінив package\.json, хоч залежностей в елементах немає/,
  )
  assert.match(
    result.stderr,
    /Оновлення не завершилось, kit-files\.json не змінено/,
  )
  assert.equal(project.pnpmCalls(), "")
  assert.match(project.read("kit-files.json"), /"v0\.3\.1"/)
})

test("update: збій менеджера пакетів — маніфест старий, підказка про залежності", () => {
  const project = updateProject()
  const result = project.update({ env: { FAKE_PNPM_FAIL: "1" } })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /pnpm add: код 1/)
  assert.match(
    result.stderr,
    /kit-files\.json не змінено[^]*ще раз встановіть залежності проекту/,
  )
  assert.match(project.read("kit-files.json"), /"v0\.3\.1"/)
})

test("update: менеджер пакетів переписав наявний діапазон — зупинка, хоч код виходу 0", () => {
  const project = updateProject()
  const result = project.update({ env: { FAKE_PNPM_TOUCHES: "1" } })
  assert.equal(result.status, 1)
  assert.match(
    result.stderr,
    /Залежності після встановлення не такі, як треба:\n {2}kept: було dependencies ~1\.0\.0, стало dependencies \^1\.0\.2/,
  )
  assert.match(project.read("kit-files.json"), /"v0\.3\.1"/)
})
