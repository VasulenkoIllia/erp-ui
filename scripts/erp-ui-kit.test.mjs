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
  addCommand,
  dependencyPlan,
  detectPackageManager,
  packageManagerFor,
  parseDependency,
  printDependencyWarnings,
  satisfiesRange,
  snapshotDependencies,
  takeItemDependencies,
  verifyDependencies,
} from "../registry/tools/erp-ui-kit-deps.mjs"
import {
  assertNoDependencies,
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

const projects = []
after(() => {
  for (const dir of projects) rmSync(dir, { recursive: true, force: true })
})

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

test("assertNoDependencies: секція залежностей у звіті — зупинка до запису", () => {
  assert.throws(
    () => assertNoDependencies(DRY_RUN),
    /поставив би залежності[^]*sonner@\^2\.0\.8/,
  )
  const filesOnly = DRY_RUN.slice(0, DRY_RUN.indexOf("├ Dependencies"))
  assert.doesNotThrow(() => assertNoDependencies(filesOnly))
  // CLI друкує залежності для розробки окремою секцією — її теж не пропускаємо.
  const devOnly = `${filesOnly}│\n\x1b[2m├\x1b[22m \x1b[1mDev Dependencies\x1b[22m \x1b[2m(1)\x1b[22m\n│ + vitest@^4.1.0`
  assert.throws(
    () => assertNoDependencies(devOnly),
    /поставив би залежності[^]*Dev Dependencies[^]*vitest@\^4\.1\.0/,
  )
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

test("parseDependency: назва й діапазон, зокрема пакети з @", () => {
  assert.deepEqual(parseDependency("sonner@^2.0.8"), {
    name: "sonner",
    range: "^2.0.8",
  })
  assert.deepEqual(parseDependency("@axe-core/playwright@~4.14.0"), {
    name: "@axe-core/playwright",
    range: "~4.14.0",
  })
  // Лише назва npm і діапазон кіта: інше в реєстрі кіта — зіпсований реєстр.
  for (const spec of [
    "cn",
    "@scope-only",
    "a@latest",
    "a@^1 || ^2",
    "a@file:../x",
    "a@npm:b@1.0.0",
    "..@1.0.0",
    "-D@1.0.0",
  ])
    assert.equal(parseDependency(spec), undefined, spec)
})

test("satisfiesRange: ^, ~ і точна версія як у semver; інший запис — не перевіряємо", () => {
  const cases = [
    ["1.9.0", "^1.2.3", true],
    ["1.2.3", "^1.2.3", true],
    ["1.2.2", "^1.2.3", false],
    ["2.0.0", "^1.2.3", false],
    ["0.7.5", "^0.7.1", true],
    ["0.8.0", "^0.7.1", false],
    ["0.0.3", "^0.0.3", true],
    ["0.0.4", "^0.0.3", false],
    ["4.14.9", "~4.14.0", true],
    ["4.15.0", "~4.14.0", false],
    ["4.13.9", "~4.14.0", false],
    ["6.0.3", "6.0.3", true],
    ["6.0.4", "6.0.3", false],
    ["10.0.0", "^9.0.0", false],
    ["1.10.0", "^1.9.0", true],
    // Пререліз у діапазон без пререлізу не входить; збірка (+…) не важить.
    ["5.0.0-beta.1", "^5.0.0", false],
    ["5.1.0-rc.1", "^5.0.0", false],
    ["5.0.1+build.7", "^5.0.0", true],
  ]
  for (const [version, range, expected] of cases)
    assert.equal(
      satisfiesRange(version, range),
      expected,
      `${version} ${range}`,
    )
  assert.equal(satisfiesRange("1.0.0", ">=1 <2"), undefined)
  assert.equal(satisfiesRange("1.0.0", undefined), undefined)
  assert.equal(satisfiesRange(undefined, "^1.0.0"), undefined)
  assert.equal(satisfiesRange("1.2.3foo", "^1.0.0"), undefined)
})

test("dependencyPlan: відсутні — з діапазоном кіта, наявні — як є, поза діапазоном кіта — попередження", () => {
  const kitDeps = new Map([
    ["kept", { range: "^1.0.0", dev: false }],
    ["fresh", { range: "^2.1.0", dev: false }],
    ["@axe-core/playwright", { range: "^4.14.0", dev: true }],
    ["fresh-dev", { range: "^3.0.0", dev: true }],
    ["router", { range: "^8.0.0", dev: false }],
    ["missing", { range: "^1.0.0", dev: false }],
    ["linked", { range: "^1.0.0", dev: false }],
  ])
  const pkg = {
    dependencies: { kept: "~1.0.0", router: "^7.18.4", missing: "^1.0.0" },
    devDependencies: { "@axe-core/playwright": "~4.14.0" },
    peerDependencies: { linked: "^1.0.0" },
  }
  const installed = {
    kept: "1.0.2",
    router: "7.18.4",
    "@axe-core/playwright": "4.14.0",
    linked: "1.4.0",
  }
  assert.deepEqual(
    dependencyPlan(kitDeps, pkg, (name) => installed[name]),
    {
      add: ["fresh@^2.1.0"],
      addDev: ["fresh-dev@^3.0.0"],
      outside: [
        {
          name: "missing",
          range: "^1.0.0",
          project: "^1.0.0",
          version: undefined,
        },
        {
          name: "router",
          range: "^8.0.0",
          project: "^7.18.4",
          version: "7.18.4",
        },
      ],
    },
  )
})

test("takeItemDependencies: залежності елементів — з файлів у список, потрібне застосунку — не dev", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "erp-ui-kit-items-"))
  projects.push(dir)
  const write = (name, item) => {
    const file = path.join(dir, name)
    writeFileSync(file, JSON.stringify({ name, files: [], ...item }))
    return file
  }
  const files = [
    write("base.json", {
      dependencies: ["tw-animate-css@^1.4.0"],
      devDependencies: ["msw@^3.0.3"],
    }),
    write("tools-e2e.json", {
      devDependencies: [
        "@axe-core/playwright@^4.14.0",
        "tw-animate-css@^1.4.0",
      ],
    }),
  ]
  assert.deepEqual(
    takeItemDependencies(files),
    new Map([
      ["tw-animate-css", { range: "^1.4.0", dev: false }],
      ["msw", { range: "^3.0.3", dev: true }],
      ["@axe-core/playwright", { range: "^4.14.0", dev: true }],
    ]),
  )
  // CLI shadcn не бачить залежностей — і не ставить їх (крок fix-kit-deps).
  for (const file of files) {
    const item = JSON.parse(readFileSync(file, "utf8"))
    assert.equal(item.dependencies, undefined)
    assert.equal(item.devDependencies, undefined)
  }
  assert.throws(
    () => takeItemDependencies([write("bad.json", { dependencies: ["@x"] })]),
    /незрозуміла залежність @x/,
  )
  assert.throws(
    () =>
      takeItemDependencies([
        write("a.json", { dependencies: ["sonner@^2.0.8"] }),
        write("b.json", { dependencies: ["sonner@^2.1.0"] }),
      ]),
    /sonner: у елементах різні діапазони/,
  )
})

test("addCommand: команда менеджера пакетів, назви після --", () => {
  assert.deepEqual(addCommand("npm", ["a@^1.0.0"]), [
    "npm",
    ["install", "--no-audit", "--no-fund", "--", "a@^1.0.0"],
  ])
  assert.deepEqual(
    addCommand("pnpm", ["a@^1.0.0", "b@~2.0.0"], { dev: true }),
    ["pnpm", ["add", "-D", "--", "a@^1.0.0", "b@~2.0.0"]],
  )
  assert.deepEqual(addCommand("bun", ["a@^1.0.0"], { dev: true }), [
    "bun",
    ["add", "-d", "--", "a@^1.0.0"],
  ])
})

test("detectPackageManager: packageManager, lock-файл у проекті чи вище (воркспейс), інакше — не вгадуємо", () => {
  const workspace = mkdtempSync(path.join(tmpdir(), "erp-ui-kit-pm-"))
  projects.push(workspace)
  // Корінь git — воркспейс: вище (тимчасова тека машини) не шукаємо, тест від неї не залежить.
  mkdirSync(path.join(workspace, ".git"))
  const app = path.join(workspace, "apps", "crm")
  mkdirSync(app, { recursive: true })
  const pkg = (fields = {}) =>
    writeFileSync(path.join(app, "package.json"), JSON.stringify(fields))
  pkg()
  assert.equal(detectPackageManager(app), undefined)

  writeFileSync(path.join(workspace, "pnpm-lock.yaml"), "")
  assert.deepEqual(detectPackageManager(app), {
    name: "pnpm",
    lock: path.join(workspace, "pnpm-lock.yaml"),
  })

  writeFileSync(path.join(app, "bun.lockb"), "")
  assert.deepEqual(detectPackageManager(app), {
    name: "bun",
    lock: path.join(app, "bun.lockb"),
  })

  writeFileSync(path.join(app, "yarn.lock"), "")
  assert.throws(() => detectPackageManager(app), /Кілька lock-файлів/)
  pkg({ packageManager: "pnpm@12.11.2" })
  assert.deepEqual(detectPackageManager(app), {
    name: "pnpm",
    lock: path.join(workspace, "pnpm-lock.yaml"),
  })
  pkg({ packageManager: "deno@2.0.0" })
  assert.throws(() => detectPackageManager(app), /невідомий packageManager/)
  pkg({ packageManager: { name: "pnpm" } })
  assert.throws(() => detectPackageManager(app), KitError)
  pkg({ packageManager: "toString@1.0.0" })
  assert.throws(() => detectPackageManager(app), /невідомий packageManager/)

  // Вище кореня git-репозиторію не шукаємо: lock-файл там — не проекту.
  pkg()
  rmSync(path.join(app, "bun.lockb"))
  rmSync(path.join(app, "yarn.lock"))
  mkdirSync(path.join(app, ".git"))
  assert.equal(detectPackageManager(app), undefined)
})

/** Тимчасовий корінь git-проекту й запис JSON у ньому. */
function gitProject(prefix) {
  const root = mkdtempSync(path.join(tmpdir(), prefix))
  projects.push(root)
  mkdirSync(path.join(root, ".git"))
  const write = (file, json) => {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    writeFileSync(path.join(root, file), JSON.stringify(json))
  }
  return { root, write }
}

const NOTHING_TO_ADD = { add: [], addDev: [], outside: [] }

test("packageManagerFor: ставити нічого — менеджер однаково визначається, і --dry-run бачить ту саму помилку", async () => {
  const { root, write } = gitProject("erp-ui-kit-pmfor-")
  write("package.json", {})
  assert.equal(await packageManagerFor(root, NOTHING_TO_ADD), undefined)
  writeFileSync(path.join(root, "pnpm-lock.yaml"), "")
  writeFileSync(path.join(root, "yarn.lock"), "")
  await assert.rejects(
    packageManagerFor(root, NOTHING_TO_ADD),
    /Кілька lock-файлів/,
  )
})

test("verifyDependencies: свій перший lock-файл — не чужий; нова не встановилась чи чужий lock-файл — зупинка", async () => {
  const { root, write } = gitProject("erp-ui-kit-verify-")
  const pkg = {
    packageManager: "pnpm@12.11.2",
    dependencies: { kept: "~1.0.0" },
  }
  write("package.json", pkg)
  write("node_modules/kept/package.json", { version: "1.0.2" })
  const manager = await packageManagerFor(root, NOTHING_TO_ADD)
  assert.deepEqual(manager, { name: "pnpm", lock: undefined })
  const snapshot = snapshotDependencies(root, manager)
  const plan = { add: ["fresh@^2.1.0"], addDev: [], outside: [] }

  // Як pnpm add без lock-файлу: нова в package.json, перший pnpm-lock.yaml.
  write("package.json", {
    ...pkg,
    dependencies: { ...pkg.dependencies, fresh: "^2.1.0" },
  })
  writeFileSync(path.join(root, "pnpm-lock.yaml"), "")
  assert.throws(
    () => verifyDependencies(snapshot, plan, manager),
    /fresh: не встановлено/,
  )
  write("node_modules/fresh/package.json", { version: "2.1.0" })
  assert.doesNotThrow(() => verifyDependencies(snapshot, plan, manager))

  writeFileSync(path.join(root, "package-lock.json"), "")
  assert.throws(
    () => verifyDependencies(snapshot, plan, manager),
    /lock-файл іншого менеджера: package-lock\.json/,
  )
})

test("printDependencyWarnings: версії — поточні; доставлену менеджером пакетів не згадуємо", (t) => {
  const { root, write } = gitProject("erp-ui-kit-warn-")
  const warn = t.mock.method(console, "warn", () => {})
  const plan = {
    ...NOTHING_TO_ADD,
    outside: [
      { name: "kept", range: "^1.0.0", project: "~1.0.0", version: undefined },
    ],
  }
  printDependencyWarnings(root, plan)
  assert.match(
    warn.mock.calls.map((call) => call.arguments.join(" ")).join("\n"),
    /kept: у package\.json ~1\.0\.0, але не встановлено/,
  )
  warn.mock.resetCalls()
  write("node_modules/kept/package.json", { version: "1.0.2" })
  printDependencyWarnings(root, plan)
  assert.equal(warn.mock.callCount(), 0)
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
  // І з --add: інакше список склав би лише новий елемент, а base випав би з оновлень.
  const addOnly = kit(dir, "update", "v1.0.0", "--add", "ui/button")
  assert.equal(addOnly.status, 1)
  assert.match(addOnly.stderr, /перший раз — --items/)
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
