/**
 * Цілісність `kit-files.json` (ADR-0078) і зупинка на позначці локальної правки (ADR-0076): контрольна
 * сума, той самий тег з іншим умістом, сироти й `--prune`, відбиток реєстру.
 */
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { after, test } from "node:test"
import { fileURLToPath } from "node:url"

import {
  isPlainRelativePath,
  KitError,
  parseArgs,
  registryFingerprint,
} from "../registry/tools/erp-ui-kit-lib.mjs"
import {
  checksumProblem,
  localOverrides,
  manifestChecksum,
  manifestShapeProblem,
  orphansAfter,
  pruneOrphans,
  sameVersionProblem,
  stopsBeforeWrite,
  withChecksum,
} from "../registry/tools/erp-ui-kit-manifest.mjs"

const ROOT = fileURLToPath(new URL("..", import.meta.url))

const dirs = []
after(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
})

const sha = (text) => createHash("sha256").update(text).digest("hex")

function tree(files) {
  const dir = mkdtempSync(path.join(tmpdir(), "erp-ui-kit-manifest-"))
  dirs.push(dir)
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
    writeFileSync(path.join(dir, file), text)
  }
  return dir
}

const OLD = "a".repeat(40)
const NEW = "b".repeat(40)

test("manifestChecksum: не залежить від порядку полів, ловить зміну items і files", () => {
  const manifest = {
    kit: "v1.0.0",
    items: ["base", "data"],
    files: { "src/a.ts": "1", "src/b.ts": "2" },
  }
  const reordered = {
    files: { "src/b.ts": "2", "src/a.ts": "1" },
    items: ["base", "data"],
    kit: "v1.0.0",
  }
  assert.equal(manifestChecksum(manifest), manifestChecksum(reordered))
  assert.equal(
    manifestChecksum(withChecksum(manifest)),
    manifestChecksum(manifest),
  )
  assert.notEqual(
    manifestChecksum({ ...manifest, items: ["base"] }),
    manifestChecksum(manifest),
  )
  assert.notEqual(
    manifestChecksum({ ...manifest, files: { "src/a.ts": "1" } }),
    manifestChecksum(manifest),
  )
})

test("checksumProblem: сума збігається — нічого; немає — нагадування; не збігається — помилка", () => {
  const manifest = withChecksum({ kit: "v1.0.0", items: ["base"], files: {} })
  assert.equal(checksumProblem(manifest, "kit-files.json"), undefined)
  const old = checksumProblem({ kit: "v1.0.0", files: {} }, "kit-files.json")
  assert.equal(old.fatal, false)
  assert.match(old.message, /без контрольної суми/)
  const edited = checksumProblem({ ...manifest, items: [] }, "kit-files.json")
  assert.equal(edited.fatal, true)
  assert.match(edited.message, /git checkout -- kit-files\.json/)
  // Суму прибрали з маніфесту нової команди: обхід перевірки, а не старий формат.
  const stripped = withChecksum({ kit: "v1.0.0", sha: OLD, files: {} })
  delete stripped.checksum
  const bypass = checksumProblem(stripped, "kit-files.json")
  assert.equal(bypass.fatal, true)
  assert.match(
    bypass.message,
    /без контрольної суми, хоч його записала команда із сумою/,
  )
})

test("manifestShapeProblem: шляхи лише відносні всередині проекту, відбитки sha256", () => {
  const ok = {
    kit: "v1.0.0",
    sha: OLD,
    fingerprint: sha("r"),
    items: ["base"],
    files: { "src/a.ts": sha("a") },
    own: { "src/index.css": sha("c") },
    orphans: { "src/old.ts": sha("o") },
  }
  assert.equal(manifestShapeProblem(ok, "kit-files.json"), undefined)
  // Старі формати команди.
  assert.equal(
    manifestShapeProblem({ kit: "v0.3.1", files: {} }, "kit-files.json"),
    undefined,
  )
  const bad = [
    [{ ...ok, files: undefined }, /немає відбитків файлів/],
    [{ ...ok, items: "base" }, /items/],
    [{ ...ok, orphans: ["src/old.ts"] }, /orphans/],
    [{ ...ok, orphans: { "src/old.ts": 1 } }, /orphans/],
    [{ ...ok, orphans: { "../outside.ts": sha("o") } }, /orphans/],
    [{ ...ok, orphans: { "./src/a.ts": sha("o") } }, /orphans/],
    [{ ...ok, orphans: { ".git/config": sha("o") } }, /orphans/],
    [{ ...ok, files: { "node_modules/x/index.js": sha("o") } }, /files/],
    [{ ...ok, files: { "kit-files.json": sha("o") } }, /files/],
    [{ ...ok, sha: "main" }, /sha/],
    [{ ...ok, fingerprint: "f1" }, /fingerprint/],
  ]
  for (const [manifest, message] of bad)
    assert.match(manifestShapeProblem(manifest, "kit-files.json"), message)
})

test("isPlainRelativePath: лише нормальні відносні posix-шляхи", () => {
  for (const file of ["src/a.ts", ".claude/skills/erp-ui/SKILL.md", "..foo/x"])
    assert.equal(isPlainRelativePath(file), true, file)
  for (const file of [
    "",
    ".",
    "/a",
    "a/",
    "./a",
    "a/../b",
    "a//b",
    "..",
    "../a",
    "a\\b",
    "a\0b",
  ])
    assert.equal(isPlainRelativePath(file), false, JSON.stringify(file))
})

test("sameVersionProblem: той самий тег з іншим умістом — зупинка; з тим самим — попередження", () => {
  const manifest = { kit: "v1.0.0", sha: OLD, fingerprint: "f1", files: {} }
  const moved = sameVersionProblem(manifest, {
    kit: "v1.0.0",
    sha: NEW,
    fingerprint: "f2",
  })
  assert.equal(moved.fatal, true)
  assert.match(
    moved.message,
    /та сама версія, інший вміст \(коміт a{12} → b{12}\)/,
  )
  const rewritten = sameVersionProblem(manifest, {
    kit: "v1.0.0",
    sha: NEW,
    fingerprint: "f1",
  })
  assert.equal(rewritten.fatal, false)
  assert.match(rewritten.message, /вміст реєстру той самий/)
  // Інша версія, той самий коміт і гілка — нічого звіряти.
  for (const [old, version] of [
    [manifest, { kit: "v1.1.0", sha: NEW, fingerprint: "f2" }],
    [manifest, { kit: "v1.0.0", sha: OLD, fingerprint: "f1" }],
    [
      { ...manifest, kit: "main@aaaaaaaaaaaa" },
      { kit: "main@bbbbbbbbbbbb", sha: NEW, fingerprint: "f2" },
    ],
  ])
    assert.equal(sameVersionProblem(old, version), undefined)
  // SHA минулого встановлення не записала попередня команда: лише сказати, з чим звірити.
  const unknown = sameVersionProblem(
    { kit: "v1.0.0", files: {} },
    { kit: "v1.0.0", sha: NEW, fingerprint: "f2" },
  )
  assert.equal(unknown.fatal, false)
  assert.match(unknown.message, /не записано[^]*b{40}[^]*CHANGELOG\.md на main/)
})

test("localOverrides: позначка в коментарі коду — так; у markdown і без коментаря — ні", () => {
  const marker = ["erp-ui", "local override"].join(": ")
  const dir = tree({
    "src/lib/a.ts": `// ${marker} — інший формат дати\nexport const a = 1\n`,
    "src/styles/b.css": `/* ${marker} */\n.b {}\n`,
    "src/c.tsx": `{/* ${marker} — підпис */}\n`,
    "src/e.ts": `/**\n * Формат дати.\n * ${marker} — інший формат\n */\n`,
    "docs/erp-ui/SPEC.md": `Позначка \`// ${marker}\` старого правила\n`,
    "src/d.ts": `const text = "local override"\n`,
  })
  assert.deepEqual(
    localOverrides(dir, [
      "src/lib/a.ts",
      "src/styles/b.css",
      "src/c.tsx",
      "src/e.ts",
      "docs/erp-ui/SPEC.md",
      "src/d.ts",
      "src/missing.ts",
    ]),
    ["src/lib/a.ts", "src/styles/b.css", "src/c.tsx", "src/e.ts"],
  )
})

test("stopsBeforeWrite: змінена в проекті сирота, яку нова версія повертає, — зупинка", () => {
  const dir = tree({ "src/old.ts": "1 + проект", "src/same.ts": "2" })
  const stops = stopsBeforeWrite(
    dir,
    { files: {}, orphans: { "src/old.ts": sha("1"), "src/same.ts": sha("2") } },
    { kit: "v1.1.0", sha: NEW, fingerprint: "f2" },
    [
      { path: "src/old.ts", action: "overwrite" },
      { path: "src/same.ts", action: "overwrite" },
    ],
  )
  assert.equal(stops.length, 1)
  assert.match(stops[0].message, /поверне й перезапише: src\/old\.ts\./)
})

test("stopsBeforeWrite: позначка лише у файлах, які перезапишуться; пересунутий тег", () => {
  const marker = ["erp-ui", "local override"].join(": ")
  const dir = tree({
    "src/a.ts": `// ${marker}\n`,
    "src/b.ts": `// ${marker}\n`,
  })
  const stops = stopsBeforeWrite(
    dir,
    { kit: "v1.0.0", sha: OLD, fingerprint: "f1", files: {} },
    { kit: "v1.0.0", sha: NEW, fingerprint: "f2" },
    [
      { path: "src/a.ts", action: "overwrite" },
      { path: "src/b.ts", action: "skip" },
    ],
  )
  assert.equal(stops.length, 2)
  assert.ok(stops.every((stop) => stop.fatal))
  assert.match(stops[0].message, /та сама версія, інший вміст/)
  assert.match(
    stops[1].message,
    /local override update не перезаписує[^]*src\/a\.ts\./,
  )
  assert.doesNotMatch(stops[1].message, /src\/b\.ts/)
})

test("orphansAfter: файли старої версії й минулі сироти, яких нема в новій, але є в проекті", () => {
  const dir = tree({
    "src/kept.ts": "1",
    "src/gone.ts": "2",
    "src/old-orphan.ts": "3",
  })
  const manifest = {
    files: {
      "src/kept.ts": sha("1"),
      "src/gone.ts": sha("2"),
      "src/deleted.ts": sha("x"),
    },
    orphans: { "src/old-orphan.ts": sha("3"), "src/removed.ts": sha("y") },
  }
  assert.deepEqual(
    orphansAfter(dir, manifest, [{ path: "src/kept.ts", action: "skip" }]),
    { "src/gone.ts": sha("2"), "src/old-orphan.ts": sha("3") },
  )
  // Лише інший регістр у новій версії: на macOS і Windows той самий файл, не сирота.
  assert.deepEqual(
    orphansAfter(dir, manifest, [
      { path: "src/kept.ts", action: "skip" },
      { path: "src/Gone.ts", action: "create" },
    ]),
    { "src/old-orphan.ts": sha("3") },
  )
  // Сирота, що повернулась у нову версію, — знову файл кіта.
  assert.deepEqual(
    orphansAfter(dir, manifest, [
      { path: "src/kept.ts", action: "skip" },
      { path: "src/old-orphan.ts", action: "overwrite" },
      { path: "src/gone.ts", action: "skip" },
    ]),
    {},
  )
})

test("pruneOrphans: незмінені під git видаляє; змінені, не під git, поза проектом і через посилання лишає", () => {
  const outside = tree({ "victim.ts": "v", "dir/victim.ts": "d" })
  const dir = tree({
    "src/same.ts": "1",
    "src/edited.ts": "2 + проект",
    "src/untracked.ts": "3",
    "src/folder/x.ts": "4",
  })
  symlinkSync(path.join(outside, "victim.ts"), path.join(dir, "src/link.ts"))
  symlinkSync(path.join(outside, "dir"), path.join(dir, "src/linked-dir"))
  const escape = path.relative(dir, path.join(outside, "victim.ts"))
  const orphans = {
    "src/same.ts": sha("1"),
    "src/edited.ts": sha("2"),
    "src/untracked.ts": sha("3"),
    "src/folder": sha("4"),
    "src/link.ts": sha("v"),
    "src/linked-dir/victim.ts": sha("d"),
    [escape]: sha("v"),
  }
  const isTracked = (file) => file !== "src/untracked.ts"
  const preview = pruneOrphans(dir, orphans, isTracked, { dryRun: true })
  assert.deepEqual(preview.removed, ["src/same.ts"])
  assert.ok(existsSync(path.join(dir, "src/same.ts")))
  const { removed, kept } = pruneOrphans(dir, orphans, isTracked)
  assert.deepEqual(removed, ["src/same.ts"])
  assert.deepEqual(
    Object.keys(kept).sort(),
    Object.keys(orphans)
      .filter((file) => file !== "src/same.ts")
      .sort(),
  )
  assert.ok(!existsSync(path.join(dir, "src/same.ts")))
  for (const file of ["src/edited.ts", "src/untracked.ts", "src/folder/x.ts"])
    assert.ok(existsSync(path.join(dir, file)), file)
  assert.ok(existsSync(path.join(outside, "victim.ts")))
  assert.ok(existsSync(path.join(outside, "dir/victim.ts")))
})

test("registryFingerprint: той самий уміст — той самий відбиток; змінений файл — інший; шлях поза кітом — помилка", () => {
  const registry = {
    items: [
      { files: [{ path: "registry/b.ts" }, { path: "registry/a.ts" }] },
      { files: [{ path: "registry/a.ts" }] },
    ],
  }
  const files = {
    "registry.json": JSON.stringify(registry),
    "registry/a.ts": "a",
    "registry/b.ts": "b",
  }
  const one = registryFingerprint(tree(files), registry)
  assert.match(one, /^[0-9a-f]{64}$/)
  assert.equal(registryFingerprint(tree(files), registry), one)
  assert.notEqual(
    registryFingerprint(tree({ ...files, "registry/b.ts": "b2" }), registry),
    one,
  )
  // Шлях поза кітом, файла немає, посилання на файл поза архівом — помилка, без читання.
  const outside = tree({ "secret.txt": "s" })
  const linked = tree(files)
  symlinkSync(
    path.join(outside, "secret.txt"),
    path.join(linked, "registry/c.ts"),
  )
  for (const [dir, file] of [
    [tree(files), "../outside.ts"],
    [tree(files), "registry/missing.ts"],
    [tree(files), "registry/a.ts/under-file.ts"],
    [linked, "registry/c.ts"],
  ])
    assert.throws(
      () => registryFingerprint(dir, { items: [{ files: [{ path: file }] }] }),
      (error) =>
        error instanceof KitError &&
        /не звичайний файл усередині кіта/.test(error.message),
      file,
    )
})

test("parseArgs: --prune", () => {
  assert.equal(parseArgs(["v1.0.0", "--prune"]).prune, true)
  assert.equal(parseArgs(["v1.0.0"]).prune, false)
})

test("кіт сам не містить позначки локальної правки в коді: інакше update зупинявся б на власних файлах", () => {
  const files = []
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules") continue
      const full = path.join(dir, name)
      const stat = lstatSync(full)
      if (stat.isDirectory()) walk(full)
      else if (!stat.isFile()) continue
      else files.push(path.relative(ROOT, full))
    }
  }
  walk(path.join(ROOT, "registry"))
  walk(path.join(ROOT, "design"))
  assert.ok(files.length > 100)
  assert.deepEqual(localOverrides(ROOT, files), [])
})
