#!/usr/bin/env node
/**
 * Легкий набір (ADR-0099): проект зі своїм сервером і своїм входом ставить кіт цього коміту, як у посібнику
 * («Легкий набір: свій сервер і свій вхід»): `base`, далі елементи `LIGHT_SET` командою кіта. Екран зібрано з
 * базовим шляхом Vite `/new/` (старий екран проекту лишається на `/`).
 *
 *   node scripts/light-smoke.mjs [--keep]
 *
 * Перевіряє: кіт не ставить ra-core і не чіпає роутер проекту; typecheck і збірка; ассети, шрифти й чанк англійських
 * рядків — під `/new/`; у браузері (Chromium з Playwright демо) вхід логіном, оболонка з посиланнями роутера, таблиця й
 * новий пароль за посиланням з токеном у `#` працюють під `/new/`, англійська довантажується, шрифт Geist завантажено,
 * жодного запиту з помилкою. Усе — із закоміченого стану цієї копії кіта, без GitHub.
 */
/* global document -- функцію page.evaluate виконує браузер */
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { createServer } from "node:http"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import path from "node:path"

import { LIGHT_SET } from "../registry/registry.config.mjs"
import { mustRun } from "../registry/tools/erp-ui-kit-lib.mjs"
import {
  addBase,
  COMMAND,
  commitAll,
  expect,
  git,
  kit,
  pinShadcn,
  root,
  toHead,
} from "./upgrade-smoke-project.mjs"

const keep = process.argv.includes("--keep")

const TEMPLATE = "tests/light/template"
/** Базовий шлях екрана: як у `vite.config.ts` шаблону. */
const BASE = "/new/"
/** Пароль «сервера» шаблону (`App.tsx.after-install`). */
const SMOKE_PASSWORD = "smoke-password-12"
/** Пакети, яких кіт легкому проекту не ставить; роутер проекту — його власний запис. */
const FORBIDDEN = ["ra-core", "msw"]
const ROUTER = "react-router"
const BROWSER_TIMEOUT_MS = 15_000
/** Токен запрошення в `#`: формат «сервера» шаблону (`App.tsx.after-install`, `TOKEN`). */
const INVITE_TOKEN = "invite-token-0123456789"

const readJson = (file) => JSON.parse(readFileSync(file, "utf8"))

/** Шаблон, закріплена CLI shadcn, `init`, `base` цього коміту — як у посібнику (розділ 1). */
async function startProject(dir, temp) {
  cpSync(path.join(root, TEMPLATE), dir, { recursive: true })
  writeFileSync(path.join(dir, ".gitignore"), "node_modules/\ndist/\n")
  pinShadcn(dir)
  await mustRun("pnpm", ["install", "--ignore-workspace"], { cwd: dir })
  await addBase("HEAD", dir, temp)
  // Шрифт від init: Geist ставить base (посібник, розділ 1).
  if (
    readJson(path.join(dir, "package.json")).dependencies?.[
      "@fontsource-variable/geist"
    ]
  )
    await mustRun("pnpm", ["remove", "@fontsource-variable/geist"], {
      cwd: dir,
    })
  await git(dir, "init", "-q")
  await commitAll(dir, "erp-ui: base HEAD")
}

/** Залежності після команди кіта: без ra-core і моків, запис роутера проекту як був. */
function assertDependencies(dir, before) {
  const after = readJson(path.join(dir, "package.json"))
  const all = { ...after.dependencies, ...after.devDependencies }
  for (const name of FORBIDDEN)
    expect(!all[name], `кіт поставив легкому проекту ${name}`)
  expect(
    after.dependencies[ROUTER] === before.dependencies[ROUTER],
    `кіт змінив роутер проекту: ${String(before.dependencies[ROUTER])} → ${String(after.dependencies[ROUTER])}`,
  )
  expect(
    !existsSync(path.join(dir, "src/lib/ra-core.ts")),
    "у проекті з'явився шов ra-core (src/lib/ra-core.ts)",
  )
}

/** Збірка під `/new/`: посилання сторінки, шрифти в CSS і чанк англійських рядків. */
function assertBuild(dist) {
  const html = readFileSync(path.join(dist, "index.html"), "utf8")
  const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1])
  expect(
    refs.length > 0 && refs.every((ref) => ref.startsWith(BASE)),
    `index.html посилається не з ${BASE}: ${refs.join(", ")}`,
  )
  const assets = readdirSync(path.join(dist, "assets"))
  const fonts = assets
    .filter((file) => file.endsWith(".css"))
    .flatMap((file) => [
      ...readFileSync(path.join(dist, "assets", file), "utf8").matchAll(
        /url\(\s*["']?([^"')]+\.woff2)/g,
      ),
    ])
    .map((m) => m[1])
  expect(fonts.length > 0, "у CSS збірки немає шрифтів woff2")
  const outside = fonts.filter(
    (url) => url.startsWith("/") && !url.startsWith(BASE),
  )
  expect(
    outside.length === 0,
    `шрифти поза ${BASE}: ${outside.slice(0, 3).join(", ")}`,
  )
  expect(
    assets.some((file) => /^i18n-en.*\.js$/.test(file)),
    "у збірці немає окремого чанка англійських рядків (i18n-en)",
  )
}

/** Статика `dist` під `/new/`; адреса екрана без файла — index.html (роутер у браузері). */
function serveDist(dist) {
  const types = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".woff2": "font/woff2",
    ".svg": "image/svg+xml",
  }
  const server = createServer((req, res) => {
    const pathname = new URL(req.url ?? "/", "http://localhost").pathname
    if (!pathname.startsWith(BASE)) {
      res.writeHead(404).end()
      return
    }
    const file = path.join(dist, pathname.slice(BASE.length))
    const inside = !path.relative(dist, file).startsWith("..")
    const target =
      inside && existsSync(file) && statSync(file).isFile()
        ? file
        : path.join(dist, "index.html")
    res.writeHead(200, {
      "content-type": types[path.extname(target)] ?? "application/octet-stream",
    })
    res.end(readFileSync(target))
  })
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve(server)
    })
  })
}

/** Сторінки під `/new/` у Chromium: вхід, оболонка й таблиця, англійська, новий пароль; без запитів із помилкою. */
async function assertInBrowser(dist) {
  const { chromium } = createRequire(path.join(root, "apps/demo/package.json"))(
    "@playwright/test",
  )
  const server = await serveDist(dist)
  const origin = `http://127.0.0.1:${String(server.address().port)}`
  const executablePath = process.env.PW_CHROMIUM_PATH
  const failures = []
  let browser
  try {
    browser = await chromium.launch(executablePath ? { executablePath } : {})
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
    })
    page.setDefaultTimeout(BROWSER_TIMEOUT_MS)
    page.on("response", (response) => {
      if (response.status() >= 400)
        failures.push(`${String(response.status())} ${response.url()}`)
    })
    page.on("requestfailed", (request) => {
      failures.push(`збій ${request.url()}`)
    })
    page.on("pageerror", (error) => {
      failures.push(`помилка сторінки: ${error.message}`)
    })

    await page.goto(`${origin}${BASE}login`)
    await page.getByRole("heading", { level: 1, name: "Вхід" }).waitFor()
    await page.getByLabel("Логін", { exact: true }).fill("manager")
    await page.getByLabel("Пароль", { exact: true }).fill(SMOKE_PASSWORD)
    await page.getByRole("button", { name: /^Увійти/ }).click()
    // Корінь роутера з `basename` — `/new` без скісної риски наприкінці.
    await page.waitForURL(
      (url) => url.pathname.replace(/\/$/, "") === BASE.replace(/\/$/, ""),
    )

    await page.getByRole("link", { name: "Постачальники" }).first().click()
    await page.waitForURL(`${origin}${BASE}suppliers`)
    await page.getByText("Опт Південь").first().waitFor()
    const geist = await page.evaluate(async () => {
      await document.fonts.ready
      return [...document.fonts].some(
        (font) => font.family.includes("Geist") && font.status === "loaded",
      )
    })
    expect(geist, `шрифт Geist не завантажено під ${BASE}`)

    await page.getByRole("button", { name: "English" }).click()
    await page.locator("html[lang=en]").waitFor({ state: "attached" })

    await page.goto(`${origin}${BASE}invite#${INVITE_TOKEN}`)
    await page
      .getByRole("heading", { level: 1, name: "New password" })
      .waitFor()
    // Токен прочитано й прибрано з адреси (посібник), сторінка — та сама, під базою.
    await page.waitForURL(`${origin}${BASE}invite`)
    await page
      .getByLabel("New password", { exact: true })
      .fill("long phrase of words")
    await page.getByRole("button", { name: "Save password" }).click()
    await page
      .getByRole("status")
      .filter({ hasText: "Пароль збережено" })
      .waitFor()
  } catch (error) {
    // Таймаут Playwright часто має причиною запит, що впав: показуємо їх разом.
    if (failures.length > 0)
      console.error(`під ${BASE}: ${failures.join("; ")}`)
    throw error
  } finally {
    await browser?.close().catch((error) => {
      console.warn(`Не вдалося закрити браузер: ${String(error)}`)
    })
    server.close()
  }
  expect(
    failures.length === 0,
    `під ${BASE}: ${failures.slice(0, 5).join("; ")}`,
  )
}

const temp = mkdtempSync(path.join(tmpdir(), "erp-ui-light-"))
try {
  const dir = path.join(temp, "app")
  const head = (await git(root, "rev-parse", "HEAD")).trim()
  console.log(
    `Легкий набір: кіт ${head} у проект зі своїм сервером, база ${BASE}`,
  )
  await startProject(dir, temp)
  const before = readJson(path.join(dir, "package.json"))
  await kit(dir, COMMAND, toHead("--items", LIGHT_SET.join(",")))
  assertDependencies(dir, before)
  await commitAll(dir, "erp-ui: легкий набір")
  renameSync(
    path.join(dir, "App.tsx.after-install"),
    path.join(dir, "src/App.tsx"),
  )
  console.log("\n=== typecheck і збірка під /new/ ===")
  await mustRun("pnpm", ["typecheck"], { cwd: dir })
  await mustRun("pnpm", ["build"], { cwd: dir })
  const dist = path.join(dir, "dist")
  assertBuild(dist)
  console.log("\n=== сторінки під /new/ у браузері ===")
  await assertInBrowser(dist)
  await kit(dir, COMMAND, ["check"])
  console.log(
    `\nOK: легкий набір (${String(LIGHT_SET.length)} елементів) без ra-core, роутер проекту не змінено; збірка й сторінки працюють під ${BASE}.`,
  )
} finally {
  if (keep) console.log(`Тестовий проект лишено: ${temp}`)
  else
    try {
      rmSync(temp, { recursive: true, force: true })
    } catch (error) {
      // Збій прибирання не має підмінити справжню причину падіння сценарію.
      console.warn(`Не вдалося прибрати ${temp}: ${String(error)}`)
    }
}
