import { posix } from "node:path"

import { render, screen } from "@testing-library/react"
import { I18nextProvider } from "react-i18next"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  addStrings,
  createI18n,
  ERP_UI_NAMESPACE,
  useErpUiT,
  useStrings,
  type ErpUiStrings,
} from "@/registry/lib/i18n"
import { kitStringPart, uk, ukParts } from "@/registry/lib/i18n-uk"
import { ukAudit } from "@/registry/lib/i18n-uk-audit"
import { ukBase } from "@/registry/lib/i18n-uk-base"
import { ukSignIn } from "@/registry/lib/i18n-uk-sign-in"

import * as demoPages from "@/i18n/pages"
import demoShell from "@/i18n/uk.json"

type Tree = { readonly [key: string]: string | Tree }

/**
 * Рядки функцій приходять із її чанком (ADR-0094): у першому екрані лише база, а компонент функції
 * передає свою частину в хук. Сторож нижче ловить файл із хуком перекладу, що бере рядки частини сам чи
 * через помічника, але її не імпортує: такий компонент, відкритий першим, показав би ключ замість тексту.
 */

const kitParts = import.meta.glob<Record<string, Tree>>(
  ["../../../../registry/lib/i18n-uk-*.ts", "!**/i18n-uk-base.ts"],
  { eager: true },
)
const sources = import.meta.glob<string>(
  [
    "../../../../registry/**/*.{ts,tsx}",
    "../**/*.{ts,tsx}",
    "!**/node_modules/**",
    "!**/*.test.{ts,tsx}",
    "!**/lib/i18n*.ts",
    "!**/src/i18n/**",
  ],
  { query: "?raw", import: "default", eager: true },
)

interface Part {
  /** Ім'я експорту, яке файл має імпортувати: `ukAudit`. */
  readonly name: string
  readonly tree: Tree
}

const parts: Part[] = Object.entries(kitParts).map(([file, module]) => {
  const entries = Object.entries(module)
  const [name, tree] = entries[0] ?? []
  // Один експорт на файл: за ним сторож шукає імпорт частини.
  if (entries.length !== 1 || !name || !tree)
    throw new Error(`${file}: частина рядків — рівно один експорт`)
  return { name, tree }
})

const capitalize = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1)
const demoParts: Part[] = Object.entries(demoPages).map(([name, tree]) => ({
  name,
  tree,
}))

const isTree = (value: unknown): value is Tree =>
  typeof value === "object" && value !== null

/** Ключ (чи основа ключа з формами множини) є в дереві. */
function hasKey(tree: string | Tree | undefined, key: string): boolean {
  if (!isTree(tree)) return false
  return key in tree || Object.keys(tree).some((k) => k.startsWith(`${key}_`))
}

/**
 * Частина, якій належить ключ `section.key…`, або `null`, якщо він у базі чи це не ключ рядка.
 * `key` — `${` для ключа з підстановкою (`audit.actions.${a}`): тоді рішення за розділом.
 */
function partOf(
  base: Tree,
  all: readonly Part[],
  section: string,
  key: string,
): Part | null {
  const inBase = base[section]
  if (inBase !== undefined) {
    if (!isTree(inBase) || key === "${" || hasKey(inBase, key)) return null
    return all.find((part) => hasKey(part.tree[section], key)) ?? null
  }
  const part = all.find((candidate) => section in candidate.tree)
  if (!part) return null
  return key === "${" || hasKey(part.tree[section], key) ? part : null
}

const KIT_KEY = /["'`](?:erp-ui:)?([a-zA-Z_$][\w$]*)\.(\$\{|[a-zA-Z_$][\w$]*)/g
const KIT_HOOK =
  /\b(useErpUiT|usePrintSheet|usePrintLanguage)\(|\buseTranslation\(\s*(?:["'`]erp-ui|ERP_UI_NAMESPACE)/
const DEMO_KEY =
  /keyPrefix: ["'`]([a-zA-Z]+)[."'`]|["'`](?:demo:)?([a-zA-Z]+)\.[a-zA-Z$]/g
const DEMO_HOOK = /\b(useDemoTranslation|useTranslation)\(/

const imports = (source: string, name: string) =>
  new RegExp(`import \\{[^}]*\\b${name}\\b[^}]*\\} from`).test(source)

/** Коментарі не беремо: ключ у JSDoc — не використання рядка. */
const withoutComments = (source: string) =>
  source
    .replace(/^\s*\/\*[\s\S]*?\*\//gm, "")
    .replace(/(^|\s)\/\/\s.*$/gm, "$1")

/** Шлях від кореня репозиторію: ключі glob відносні до цього файла. */
const repoPath = (file: string) =>
  file.startsWith("../../../../")
    ? file.slice("../../../../".length)
    : posix.join("apps/demo/src/kit", file)
const sourceByPath = new Map(
  Object.entries(sources).map(([file, source]) => [repoPath(file), source]),
)

const ALIASES: readonly (readonly [string, string])[] = [
  ["@/registry/", "registry/"],
  ["@/components/ui/", "registry/ui/"],
  ["@/components/erp/", "registry/erp/"],
  ["@/components/templates/", "registry/templates/"],
  ["@/hooks/", "registry/hooks/"],
  ["@/lib/", "registry/lib/"],
  ["@/", "apps/demo/src/"],
]

function resolveImport(from: string, spec: string): string | undefined {
  const alias = ALIASES.find(([prefix]) => spec.startsWith(prefix))
  const base = spec.startsWith(".")
    ? posix.join(posix.dirname(from), spec)
    : alias && alias[1] + spec.slice(alias[0].length)
  if (!base) return undefined
  return [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`].find(
    (candidate) => sourceByPath.has(candidate),
  )
}

const IMPORT =
  /import\s+(type\s+)?(?:(\w+)\s*,?\s*)?(?:\{([^}]*)\})?\s*from\s*"([^"]+)"/g
/** Помічник (функція, стала), а не компонент чи хук: його рядки підключає той, хто його кличе. */
const isHelper = (name: string) =>
  !/^[A-Z][a-z]/.test(name) && !/^use[A-Z]/.test(name)

/** Файли, з яких цей бере помічників. */
function helperImports(path: string, source: string): string[] {
  const deps: string[] = []
  for (const [, type, first, named = "", spec = ""] of source.matchAll(
    IMPORT,
  )) {
    if (type) continue
    const names = [
      first ?? "",
      ...named
        .split(",")
        .map((name) => name.trim())
        .filter((name) => !name.startsWith("type "))
        .map((name) => name.split(/\s+as\s+/)[0] ?? ""),
    ].filter(Boolean)
    const dep = names.some(isHelper) ? resolveImport(path, spec) : undefined
    if (dep) deps.push(dep)
  }
  return deps
}

/**
 * Файли з хуком перекладу, що не імпортують потрібної частини. Потрібні — частини його власних ключів і
 * ключів помічників, яких він бере з інших файлів (транзитивно): помічник отримує `t` від компонента, тож
 * рядки підключає компонент. Байтів це не додає, бо помічник і так у статичних імпортах компонента.
 */
function missingParts(
  hook: RegExp,
  keys: RegExp,
  resolve: (match: RegExpMatchArray) => Part | null,
): string[] {
  const own = new Map<string, Set<string>>()
  const ownOf = (path: string) => {
    let names = own.get(path)
    if (!names) {
      names = new Set()
      for (const match of withoutComments(
        sourceByPath.get(path) ?? "",
      ).matchAll(keys)) {
        const part = resolve(match)
        if (part) names.add(part.name)
      }
      own.set(path, names)
    }
    return names
  }
  const deps = new Map<string, string[]>()
  const depsOf = (path: string) => {
    let found = deps.get(path)
    if (!found) {
      found = helperImports(path, sourceByPath.get(path) ?? "")
      deps.set(path, found)
    }
    return found
  }
  const problems: string[] = []
  for (const [path, source] of sourceByPath) {
    if (!hook.test(withoutComments(source))) continue
    // Обхід без запам'ятовування підсумків: у циклі імпортів підсумок вузла був би неповним.
    const needed = new Set(ownOf(path))
    const seen = new Set([path])
    const queue = [...depsOf(path)]
    for (let dep = queue.pop(); dep !== undefined; dep = queue.pop()) {
      if (seen.has(dep)) continue
      seen.add(dep)
      for (const name of ownOf(dep)) needed.add(name)
      queue.push(...depsOf(dep))
    }
    for (const name of needed)
      if (!imports(source, name)) problems.push(`${path}: ${name}`)
  }
  return problems.sort()
}

describe("рядки функції з її чанком", () => {
  it("частина додає рядки функції, ключі ті самі", () => {
    const i18n = createI18n()
    expect(i18n.exists("audit.title", { ns: ERP_UI_NAMESPACE })).toBe(false)
    expect(i18n.t("common.close", { ns: ERP_UI_NAMESPACE })).toBe(
      uk.common.close,
    )

    addStrings(i18n, ERP_UI_NAMESPACE, ukAudit)
    addStrings(i18n, ERP_UI_NAMESPACE, ukAudit)
    expect(i18n.t("audit.title", { ns: ERP_UI_NAMESPACE })).toBe(uk.audit.title)
    // База — та сама: частина доливається, а не замінює простір.
    expect(i18n.t("common.close", { ns: ERP_UI_NAMESPACE })).toBe(
      uk.common.close,
    )
  })

  it("перевизначення рядка функції з проекту лишається після частини", () => {
    const i18n = createI18n()
    i18n.addResourceBundle(
      "uk",
      ERP_UI_NAMESPACE,
      { audit: { title: "Хто що змінив" } },
      true,
      true,
    )
    addStrings(i18n, ERP_UI_NAMESPACE, ukAudit)
    expect(i18n.t("audit.title", { ns: ERP_UI_NAMESPACE })).toBe(
      "Хто що змінив",
    )
    expect(i18n.t("audit.export", { ns: ERP_UI_NAMESPACE })).toBe(
      uk.audit.export,
    )
  })

  it("частина не змінює модуль бази: новий екземпляр знову без неї", () => {
    // `auth` ділиться між базою й частиною входу: i18next доливає частину глибоко.
    addStrings(createI18n(), ERP_UI_NAMESPACE, ukSignIn)
    expect(ukBase.auth).not.toHaveProperty("signIn")
    expect(createI18n().exists("auth.signIn", { ns: ERP_UI_NAMESPACE })).toBe(
      false,
    )
  })

  it("useErpUiT(частина) показує текст функції з першого рендера", () => {
    const i18n = createI18n()
    function AuditTitle() {
      const t = useErpUiT(ukAudit)
      return <h1>{t("audit.title")}</h1>
    }
    render(
      <I18nextProvider i18n={i18n}>
        <AuditTitle />
      </I18nextProvider>,
    )
    expect(
      screen.getByRole("heading", { name: uk.audit.title }),
    ).toBeInTheDocument()
  })

  it("частину додано раз на екземпляр, хоч скільки компонентів її беруть", () => {
    const i18n = createI18n()
    // У типі сховища методу немає, хоч екземпляр передає виклик саме йому.
    const store = i18n.store as typeof i18n.store &
      Pick<typeof i18n, "addResourceBundle">
    const added = vi.spyOn(store, "addResourceBundle")
    function AuditTitle() {
      const t = useErpUiT(ukAudit)
      return <li>{t("audit.title")}</li>
    }
    render(
      <I18nextProvider i18n={i18n}>
        <ul>
          {Array.from({ length: 5 }, (_, index) => (
            <AuditTitle key={index} />
          ))}
        </ul>
      </I18nextProvider>,
    )
    expect(screen.getAllByRole("listitem")).toHaveLength(5)
    expect(added).toHaveBeenCalledTimes(1)
  })

  it("частина рядків кіта — лише розділи кіта", () => {
    const own: ErpUiStrings[] = [ukAudit, ukSignIn]
    // @ts-expect-error розділ демо — не частина рядків кіта
    const demo: ErpUiStrings = demoPages.ukDataPage
    // @ts-expect-error вміст розділу, а не частина
    const section: ErpUiStrings = ukAudit.audit
    expect([...own, demo, section]).toHaveLength(4)
  })

  it("useStrings додає частину рядків проекту в її простір імен", () => {
    const i18n = createI18n({
      resources: { uk: { app: { title: "Застосунок" } } },
      defaultNamespace: "app",
    })
    const ordersPart = { orders: { title: "Замовлення" } }
    function Orders() {
      useStrings("app", ordersPart)
      return null
    }
    render(
      <I18nextProvider i18n={i18n}>
        <Orders />
      </I18nextProvider>,
    )
    expect(i18n.getResource("uk", "app", "orders.title")).toBe("Замовлення")
    expect(i18n.getResource("uk", "app", "title")).toBe("Застосунок")
  })

  it("база й частини разом дають усі рядки кіта без перекриття", () => {
    const leaves = (tree: Tree, prefix = ""): string[] =>
      Object.entries(tree).flatMap(([key, value]) =>
        isTree(value) ? leaves(value, `${prefix}${key}.`) : [`${prefix}${key}`],
      )
    const own = [ukBase as Tree, ...parts.map((part) => part.tree)].flatMap(
      (tree) => leaves(tree),
    )
    expect(own.filter((key, i) => own.indexOf(key) !== i)).toEqual([])
    expect([...own].sort()).toEqual(leaves(uk as Tree).sort())
  })

  it("файл кіта, що бере рядки частини, імпортує її", () => {
    // Сторож бачить код: інакше після перенесення тек він зеленів би без жодного файла.
    expect(sourceByPath.size).toBeGreaterThan(700)
    expect(parts.length).toBeGreaterThan(20)
    expect(
      missingParts(KIT_HOOK, KIT_KEY, (match) =>
        partOf(ukBase as Tree, parts, match[1] ?? "", match[2] ?? ""),
      ),
    ).toEqual([])
  })

  it("сторінка демо, що бере свої рядки, імпортує їх з pages.ts", () => {
    const sections = new Map(
      demoParts.map((part) => [Object.keys(part.tree)[0] ?? "", part]),
    )
    // Один розділ на частину, назва — розділ із префіксом `uk`: так її легко знайти за ключем.
    expect(demoParts.length).toBeGreaterThan(40)
    for (const part of demoParts) expect(Object.keys(part.tree)).toHaveLength(1)
    for (const [section, part] of sections)
      expect(part.name).toBe(`uk${capitalize(section)}`)
    expect(Object.keys(demoShell).filter((key) => sections.has(key))).toEqual(
      [],
    )
    expect(
      missingParts(DEMO_HOOK, DEMO_KEY, (match) => {
        const section = match[1] ?? match[2] ?? ""
        return sections.get(section) ?? null
      }),
    ).toEqual([])
  })
})

describe("розробка: рядок кіта без частини (createI18n)", () => {
  const kitWarnings = (spy: { mock: { calls: unknown[][] } }) =>
    spy.mock.calls
      .map(([message]) => String(message))
      .filter((message) => message.startsWith("erp-ui:"))
  /** `t` без типів ключів демо: перевіряємо саме рядки, яких немає. */
  const untypedT = (i18n: ReturnType<typeof createI18n>) =>
    i18n.t.bind(i18n) as unknown as (key: string, options?: object) => string

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("перелік частин — усі файли lib/i18n-uk-*, ім'я експорту за назвою файла", () => {
    const fromFiles = Object.entries(kitParts).map(([file, module]) => {
      const stem = /i18n-uk-([a-z-]+)\.ts$/.exec(file)?.[1] ?? ""
      const name = `uk${stem.replace(/(^|-)([a-z])/g, (_, _dash, c: string) => c.toUpperCase())}`
      return [name, module[name]] as const
    })
    expect(Object.keys(ukParts).sort()).toEqual(
      fromFiles.map(([name]) => name).sort(),
    )
    for (const [name, tree] of fromFiles) expect(ukParts[name]).toBe(tree)
  })

  it("називає частину й її файл, раз на ключ", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    function Title() {
      const t = useErpUiT()
      return <h2>{t("periodLock.title")}</h2>
    }
    render(
      <I18nextProvider i18n={createI18n()}>
        <Title />
        <Title />
      </I18nextProvider>,
    )
    // Без частини людина бачить ключ: так виглядає сторінка, відкрита першою.
    expect(
      screen.getAllByRole("heading", { name: "periodLock.title" }),
    ).toHaveLength(2)
    await vi.waitFor(() => {
      expect(kitWarnings(warn)).toHaveLength(1)
    })
    expect(kitWarnings(warn)[0]).toMatch(
      /«periodLock\.title».*useErpUiT\(ukPeriodLock\) з @\/lib\/i18n-uk-period-lock/,
    )
  })

  it("ключа немає в кіті — радить перевірити ключ", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    untypedT(createI18n())("periodLock.noSuchString", { ns: ERP_UI_NAMESPACE })
    await vi.waitFor(() => {
      expect(kitWarnings(warn)).toEqual([
        expect.stringMatching(/«periodLock\.noSuchString».*перевірте ключ/),
      ])
    })
  })

  it("кожен екземпляр попереджає сам: другий createI18n не мовчить про той самий ключ", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    const t = (i18n: ReturnType<typeof createI18n>) =>
      i18n.t("periodLock.description", { ns: ERP_UI_NAMESPACE })
    t(createI18n())
    t(createI18n())
    await vi.waitFor(() => {
      expect(kitWarnings(warn)).toHaveLength(2)
    })
  })

  it("без попередження: рядок є, запасний текст defaultValue чи defaultValue_one, інший простір імен", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    const i18n = createI18n({ resources: { uk: { app: {} } } })
    i18n.t("common.close", { ns: ERP_UI_NAMESPACE })
    i18n.t("periodLock.statusOpen", {
      ns: ERP_UI_NAMESPACE,
      defaultValue: "Закритих періодів немає.",
    })
    untypedT(i18n)("periodLock.noSuchCount", {
      ns: ERP_UI_NAMESPACE,
      count: 2,
      defaultValue_one: "один",
      defaultValue_other: "кілька",
    })
    untypedT(i18n)("orders.title", { ns: "app" })
    // Контроль: рядок без частини в тому самому екземплярі попереджає, отже обробник увімкнено.
    i18n.t("periodLock.statusClosed", { ns: ERP_UI_NAMESPACE, date: "1" })
    await vi.waitFor(() => {
      expect(kitWarnings(warn)).toEqual([
        expect.stringMatching(/«periodLock\.statusClosed»/),
      ])
    })
  })

  it("частина за ключем: форми множини так, схожий ключ ні; файл за ім'ям частини", () => {
    expect(kitStringPart("documentGenerator.title")).toEqual({
      name: "ukDocumentGenerator",
      file: "@/lib/i18n-uk-document-generator",
    })
    expect(kitStringPart("board.cards")?.name).toBe("ukBoard")
    expect(kitStringPart("periodLock.tit")).toBeUndefined()
    expect(kitStringPart("periodLock.title_all")).toBeUndefined()
  })
})
