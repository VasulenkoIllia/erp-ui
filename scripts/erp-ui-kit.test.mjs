import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { after, describe, test } from "node:test"
import { fileURLToPath } from "node:url"

import {
  classifyDownloadFailure,
  isReleaseTag,
  KitError,
  parseDryRun,
} from "../registry/tools/erp-ui-kit-lib.mjs"
import {
  keepProjectOwned,
  kitFileProblems,
  PROJECT_OWNED,
} from "../registry/tools/erp-ui-kit.mjs"

const SCRIPT = fileURLToPath(
  new URL("../registry/tools/erp-ui-kit.mjs", import.meta.url),
)

// Звіт shadcn 4.22 `add --dry-run`: кольори ANSI, рамка, файли й залежності.
const DRY_RUN = [
  "- Resolving items.",
  "┌ shadcn add /tmp/r/base.json, /tmp/r/erp/app-gate.json (dry run)",
  "│",
  "├ Files (3) +1 new, ~1 overwrite, =1 skip",
  "│ \x1b[32m+\x1b[39m src/components/erp/app-gate.tsx        create",
  "│ \x1b[33m~\x1b[39m src/components/erp/app-shell.tsx       overwrite",
  "│ = src/lib/api.ts                          skip (identical)",
  "│",
  "├ Dependencies (2)",
  "│ + sonner@^2.0.8",
  "│ + ra-core@^5.15.4",
].join("\n")

test("parseDryRun: файли з діями, без залежностей і кольорів", () => {
  assert.deepEqual(parseDryRun(DRY_RUN), [
    { path: "src/components/erp/app-gate.tsx", action: "create" },
    { path: "src/components/erp/app-shell.tsx", action: "overwrite" },
    { path: "src/lib/api.ts", action: "skip" },
  ])
})

test("parseDryRun: інший формат — помилка, а не порожній список", () => {
  assert.throws(
    () => parseDryRun(DRY_RUN.replace("Files (3)", "Files (4)")),
    KitError,
  )
  assert.throws(() => parseDryRun("Done. 3 files"), KitError)
  // Порожній звіт вимкнув би перевірку check (маніфест без файлів).
  assert.throws(() => parseDryRun("├ Files (0)\n│"), KitError)
})

test("classifyDownloadFailure: що повторюємо, а на чому зупиняємось", () => {
  const retry = (stderr, timedOut = false) =>
    classifyDownloadFailure(stderr, timedOut).retry
  assert.equal(retry("", true), true)
  assert.equal(retry("gh: Not Found (HTTP 404)"), false)
  assert.equal(retry("gh: Bad credentials (HTTP 401)"), false)
  assert.equal(
    retry("To get started with GitHub CLI, run:  gh auth login"),
    false,
  )
  assert.equal(retry("gh: API rate limit exceeded (HTTP 403)"), false)
  assert.equal(retry("gh: Resource not accessible (HTTP 422)"), false)
  assert.equal(retry("gh: Bad Gateway (HTTP 502)"), true)
  assert.equal(retry("gh: Too Many Requests (HTTP 429)"), true)
  assert.equal(retry("error connecting to api.github.com"), true)
  assert.match(
    classifyDownloadFailure("gh: Not Found (HTTP 404)", false).message,
    /немає такого тегу/,
  )
})

test("isReleaseTag: лише vX.Y.Z", () => {
  assert.equal(isReleaseTag("v1.0.0"), true)
  assert.equal(isReleaseTag("v1.0"), false)
  assert.equal(isReleaseTag("wave-1/1.9-app-assembly-update"), false)
  assert.equal(isReleaseTag("951bb73"), false)
})

test("kitFileProblems: змінені й видалені; файли проекту не рахуються", () => {
  const current = {
    "src/a.ts": "h-a",
    "src/b.ts": "інший",
    [PROJECT_OWNED[0]]: "проект доповнив",
  }
  const problems = kitFileProblems(
    {
      "src/a.ts": "h-a",
      "src/b.ts": "h-b",
      "src/c.ts": "h-c",
      [PROJECT_OWNED[0]]: "h-css",
    },
    (file) => current[file],
  )
  assert.deepEqual(problems, { changed: ["src/b.ts"], missing: ["src/c.ts"] })
})

const projects = []
after(() => {
  for (const dir of projects) rmSync(dir, { recursive: true, force: true })
})

/** Тимчасовий проект: components.json, файл кіта й kit-files.json. */
function project({ manifest = true } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "erp-ui-kit-test-"))
  projects.push(dir)
  writeFileSync(path.join(dir, "components.json"), "{}")
  writeFileSync(path.join(dir, "a.ts"), "export const a = 1\n")
  if (manifest) {
    const hash = createHash("sha256")
      .update("export const a = 1\n")
      .digest("hex")
    writeFileSync(
      path.join(dir, "kit-files.json"),
      JSON.stringify({
        kit: "v1.0.0",
        items: ["base"],
        files: { "a.ts": hash },
      }),
    )
  }
  return dir
}

const kit = (cwd, ...args) =>
  spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: "utf8" })

test("check: файли кіта не змінені — код 0; змінено — код 1 з назвою файлу", () => {
  const dir = project()
  const ok = kit(dir, "check")
  assert.equal(ok.status, 0, ok.stderr)
  assert.match(ok.stdout, /v1\.0\.0 не змінені: 1/)
  writeFileSync(path.join(dir, "a.ts"), "export const a = 2\n")
  const changed = kit(dir, "check")
  assert.equal(changed.status, 1)
  assert.match(changed.stderr, /змінено файл кіта: a\.ts/)
})

test("check: без kit-files.json чи не з кореня проекту — пояснення, код 1", () => {
  const noManifest = kit(project({ manifest: false }), "check")
  assert.equal(noManifest.status, 1)
  assert.match(noManifest.stderr, /Немає kit-files\.json/)
  const dir = project()
  const outside = kit(path.dirname(dir), "check")
  assert.equal(outside.status, 1)
  assert.match(outside.stderr, /components\.json/)
})

test("update: аргументи перевіряються до мережі й до запису", () => {
  const dir = project()
  const cases = [
    [[], /Потрібна версія кіта/],
    [["v1.0.0;rm"], /Потрібна версія кіта/],
    [["v1.0.0", "--dry-run", "--add", "../evil"], /Некоректна назва елемента/],
    [["v1.0.0", "--force"], /Невідома опція --force/],
    [["v1.0.0", "--items"], /--items: потрібне значення/],
  ]
  for (const [args, message] of cases) {
    const result = kit(dir, "update", ...args)
    assert.equal(result.status, 1, args.join(" "))
    assert.match(result.stderr, message)
  }
  writeFileSync(
    path.join(dir, "kit-files.json"),
    JSON.stringify({ kit: "v0.3.1", files: {} }),
  )
  const noItems = kit(dir, "update", "v1.0.0", "--dry-run")
  assert.equal(noItems.status, 1)
  assert.match(noItems.stderr, /перший раз — --items/)
})

test("check: через символьне посилання (як /var і /tmp на macOS) — працює, а не мовчить", () => {
  const dir = project()
  const link = path.join(dir, "linked-erp-ui-kit.mjs")
  symlinkSync(SCRIPT, link)
  const result = spawnSync(process.execPath, [link, "check"], {
    cwd: dir,
    encoding: "utf8",
  })
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /не змінені: 1/)
})

test("kit-files.json зіпсований чи порожній — пояснення без стека", () => {
  const dir = project()
  writeFileSync(path.join(dir, "kit-files.json"), "<<<<<<< HEAD\n{")
  const broken = kit(dir, "check")
  assert.equal(broken.status, 1)
  assert.match(broken.stderr, /Не вдалося прочитати kit-files\.json/)
  assert.doesNotMatch(broken.stderr, /at JSON\.parse/)
  writeFileSync(
    path.join(dir, "kit-files.json"),
    JSON.stringify({ kit: "v1.0.0", files: {} }),
  )
  const empty = kit(dir, "check")
  assert.equal(empty.status, 1)
  assert.match(empty.stderr, /без відбитків файлів/)
})

test("update --items поверх наявного списку — помилка з підказкою --add", () => {
  const result = kit(project(), "update", "v1.0.0", "--items", "base")
  assert.equal(result.status, 1)
  assert.match(result.stderr, /уже є список елементів: новий — --add/)
})

describe("keepProjectOwned: файли, які проект доповнює сам", () => {
  const CSS = PROJECT_OWNED[0]
  const sha = (text) => createHash("sha256").update(text).digest("hex")
  const setup = (installed) => {
    const dir = project()
    mkdirSync(path.join(dir, path.dirname(CSS)), { recursive: true })
    writeFileSync(path.join(dir, CSS), installed)
    return dir
  }
  const read = (dir) => readFileSync(path.join(dir, CSS), "utf8")
  const quiet = async (fn) => {
    const log = console.log
    console.log = () => undefined
    try {
      return await fn()
    } finally {
      console.log = log
    }
  }

  test("створений цим add — відбиток версії кіта, файл не чіпаємо", async () => {
    const dir = setup("кіт 2")
    const own = await keepProjectOwned(dir, new Map(), {}, dir)
    assert.equal(own[CSS], sha("кіт 2"))
    assert.equal(read(dir), "кіт 2")
  })

  test("проект не змінював — нова версія кіта", async () => {
    const dir = setup("кіт 2")
    const saved = new Map([[CSS, Buffer.from("кіт 1")]])
    await keepProjectOwned(dir, saved, { [CSS]: sha("кіт 1") }, dir)
    assert.equal(read(dir), "кіт 2")
  })

  test("проект змінював — його версія лишається (і коли кіт змінився, і коли ні)", async () => {
    const changedKit = setup("кіт 2")
    const saved = new Map([[CSS, Buffer.from("кіт 1 + проект")]])
    const own = await quiet(() =>
      keepProjectOwned(changedKit, saved, { [CSS]: sha("кіт 1") }, changedKit),
    )
    assert.equal(read(changedKit), "кіт 1 + проект")
    assert.equal(own[CSS], sha("кіт 2"))
    const sameKit = setup("кіт 1")
    await keepProjectOwned(sameKit, saved, { [CSS]: sha("кіт 1") }, sameKit)
    assert.equal(read(sameKit), "кіт 1 + проект")
  })
})

// Підроблений CLI shadcn: build — реєстр з одним елементом, add --dry-run — звіт у форматі 4.22,
// add — записує файли версії кіта.
const FAKE_SHADCN = `#!/usr/bin/env node
const fs = require("node:fs")
const path = require("node:path")
const FILES = {
  "src/lib/a.ts": "export const a = 2\\n",
  "src/index.css": "/* кіт 2 */\\n",
  ".claude/skills/erp-ui/SKILL.md": "скіл\\n",
}
const [cmd, ...args] = process.argv.slice(2)
if (cmd === "build") {
  const out = args[args.indexOf("-o") + 1]
  fs.mkdirSync(out, { recursive: true })
  fs.writeFileSync(path.join(out, "base.json"), "{}")
} else if (cmd === "add" && args.includes("--dry-run")) {
  const lines = Object.entries(FILES).map(([file, text]) => {
    const now = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null
    const action = now === null ? "create" : now === text ? "skip" : "overwrite"
    return "│ " + { create: "+", skip: "=", overwrite: "~" }[action] + " " + file + "   " + action
  })
  console.log("├ Files (" + lines.length + ")\\n" + lines.join("\\n"))
} else if (cmd === "add") {
  for (const [file, text] of Object.entries(FILES)) {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, text)
  }
} else process.exit(1)
`

const git = (cwd, ...args) => {
  const result = spawnSync(
    "git",
    ["-c", "user.name=test", "-c", "user.email=test@example.com", ...args],
    { cwd, encoding: "utf8" },
  )
  assert.equal(result.status, 0, result.stderr)
}

/** Копія кіта з тегом v1.0.0: лише те, що бере --from. */
function kitCheckout() {
  const dir = mkdtempSync(path.join(tmpdir(), "erp-ui-kit-src-"))
  projects.push(dir)
  const files = {
    "registry.json": JSON.stringify({
      homepage: "https://github.com/VasulenkoIllia/erp-ui",
    }),
    "package.json": JSON.stringify({ version: "1.0.0" }),
    "registry/lib/a.ts": "export const a = 2\n",
    "design/palette-tokens.json": "{}",
    "docs/CATALOG.md": "#",
    "docs/SPEC.md": "#",
  }
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
    writeFileSync(path.join(dir, file), text)
  }
  git(dir, "init", "-q")
  git(dir, "add", ".")
  git(dir, "commit", "-qm", "kit")
  git(dir, "tag", "v1.0.0")
  return dir
}

test("update: увесь ланцюжок — файли кіта, файл проекту, ігноровані, новий маніфест", () => {
  const dir = project({ manifest: false })
  const files = {
    ".gitignore": "node_modules/\n.claude/\n",
    "package.json": JSON.stringify({ devDependencies: { shadcn: "4.22.0" } }),
    "src/lib/a.ts": "export const a = 1\n",
    "src/index.css": "/* кіт 1 + проект */\n",
    // Старий формат тестового проекту: { kit, files } без items і own.
    "kit-files.json": JSON.stringify({
      kit: "v0.3.1",
      files: {
        "src/lib/a.ts": createHash("sha256")
          .update("export const a = 1\n")
          .digest("hex"),
      },
    }),
  }
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
    writeFileSync(path.join(dir, file), text)
  }
  const bin = path.join(dir, "node_modules", ".bin", "shadcn")
  mkdirSync(path.dirname(bin), { recursive: true })
  writeFileSync(bin, FAKE_SHADCN, { mode: 0o755 })
  git(dir, "init", "-q")
  git(dir, "add", ".")
  git(dir, "commit", "-qm", "project")

  const result = kit(
    dir,
    "update",
    "v1.0.0",
    "--from",
    kitCheckout(),
    "--items",
    "base",
  )
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  assert.match(result.stdout, /Кіт v1\.0\.0: 1 зміниться, 1 нових, 0 без змін/)
  assert.match(result.stdout, /\* src\/index\.css — файл проекту/)
  assert.match(
    result.stdout,
    /Без відбитків \(git їх ігнорує.*\.claude\/skills\/erp-ui\/SKILL\.md/,
  )

  const manifest = JSON.parse(
    readFileSync(path.join(dir, "kit-files.json"), "utf8"),
  )
  const sha = (text) => createHash("sha256").update(text).digest("hex")
  assert.deepEqual(manifest, {
    kit: "v1.0.0",
    items: ["base"],
    files: { "src/lib/a.ts": sha("export const a = 2\n") },
    own: { "src/index.css": sha("/* кіт 2 */\n") },
  })
  // Без відбитка минулого встановлення файл проекту вважається зміненим проектом — лишається його.
  assert.equal(
    readFileSync(path.join(dir, "src/index.css"), "utf8"),
    "/* кіт 1 + проект */\n",
  )
  assert.equal(kit(dir, "check").status, 0)
})
