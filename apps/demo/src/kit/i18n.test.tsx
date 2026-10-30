import { act, render, screen } from "@testing-library/react"
import type { i18n as I18n } from "i18next"
import { Suspense } from "react"
import { describe, expect, it, vi } from "vitest"

import {
  initAppearance,
  setAppearance,
  syncLanguage,
} from "@/registry/lib/appearance"
import {
  createI18n,
  LANGUAGES,
  whenI18nReady,
  type Language,
} from "@/registry/lib/i18n"
import {
  useNamespaceResources,
  useNamespaceT,
  type NamespaceResources,
} from "@/registry/lib/i18n-namespaces"
import { en as kitEn } from "@/registry/lib/i18n-en"
import { uk as kitUk } from "@/registry/lib/i18n-uk"
import companyEn from "@/registry/modules/A1-company/i18n/en.json"
import companyUk from "@/registry/modules/A1-company/i18n/uk.json"
import contactsEn from "@/registry/modules/B1-contacts/i18n/en.json"
import contactsUk from "@/registry/modules/B1-contacts/i18n/uk.json"
import usersEn from "@/registry/modules/A2-users/i18n/en.json"
import usersUk from "@/registry/modules/A2-users/i18n/uk.json"
import { Spinner } from "@/registry/ui/spinner"

import { createDemoI18n } from "@/i18n"
import demoEn from "@/i18n/en.json"
import demoUk from "@/i18n/uk.json"

type Tree = { [key: string]: string | Tree }

function leaves(tree: Tree, prefix = ""): string[] {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === "string"
      ? [`${prefix}${key}`]
      : leaves(value, `${prefix}${key}.`),
  )
}

const SUFFIX = /_(zero|one|two|few|many|other)$/

/**
 * Ключі без форм множини мають збігатися між мовами, а кожен ключ із множиною —
 * мати рівно ті форми, яких вимагає Intl.PluralRules мови (uk: one/few/many/other, en: one/other).
 */
function checkParity(byLanguage: Record<Language, Tree>) {
  const problems: string[] = []
  const bases = (lng: Language) =>
    new Set(leaves(byLanguage[lng]).map((k) => k.replace(SUFFIX, "")))
  const reference = bases("uk")
  for (const lng of LANGUAGES) {
    const own = bases(lng)
    for (const k of reference)
      if (!own.has(k)) problems.push(`${lng}: немає ${k}`)
    for (const k of own)
      if (!reference.has(k)) problems.push(`${lng}: зайвий ${k}`)
    const required = new Intl.PluralRules(lng).resolvedOptions()
      .pluralCategories
    const plural = new Map<string, Set<string>>()
    for (const key of leaves(byLanguage[lng])) {
      const m = SUFFIX.exec(key)
      if (!m?.[1]) continue
      const base = key.replace(SUFFIX, "")
      plural.set(base, (plural.get(base) ?? new Set()).add(m[1]))
    }
    for (const [base, forms] of plural) {
      const missing = required.filter((f) => !forms.has(f))
      const extra = [...forms].filter(
        (f) => !required.includes(f as Intl.LDMLPluralRule),
      )
      if (missing.length)
        problems.push(`${lng}: ${base} без _${missing.join(", _")}`)
      if (extra.length)
        problems.push(`${lng}: ${base} із зайвими _${extra.join(", _")}`)
    }
  }
  return problems
}

describe("паритет рядків uk/en", () => {
  it("рядки кіта", () => {
    expect(checkParity({ uk: kitUk, en: kitEn })).toEqual([])
  })

  it("рядки демо", () => {
    expect(checkParity({ uk: demoUk, en: demoEn })).toEqual([])
  })

  it("рядки модуля B1", () => {
    expect(checkParity({ uk: contactsUk, en: contactsEn })).toEqual([])
  })

  it("рядки модуля A2", () => {
    expect(checkParity({ uk: usersUk, en: usersEn })).toEqual([])
  })

  it("рядки модуля A1", () => {
    expect(checkParity({ uk: companyUk, en: companyEn })).toEqual([])
  })

  it("перевірка ловить пропущену форму множини", () => {
    expect(
      checkParity({
        uk: { files_one: "", files_few: "", files_other: "" },
        en: { files_one: "", files_other: "" },
      }),
    ).toEqual(["uk: files без _many"])
  })
})

describe("множина через i18next (SPEC §11)", () => {
  const cases: Record<Language, [number, string][]> = {
    uk: [
      [1, "1 рахунок"],
      [2, "2 рахунки"],
      [5, "5 рахунків"],
      [11, "11 рахунків"],
      [21, "21 рахунок"],
      [22, "22 рахунки"],
      [25, "25 рахунків"],
      [101, "101 рахунок"],
      [1.5, "1,5 рахунку"],
      [1234, "1 234 рахунки"],
    ],
    en: [
      [1, "1 invoice"],
      [2, "2 invoices"],
      [5, "5 invoices"],
      [11, "11 invoices"],
      [21, "21 invoices"],
      [101, "101 invoices"],
      [1234, "1,234 invoices"],
    ],
  }
  for (const lng of LANGUAGES) {
    it(lng, async () => {
      const i18n = createDemoI18n(lng)
      await whenI18nReady(i18n)
      for (const [count, text] of cases[lng]) {
        expect(i18n.t("formatsPage.plurals.invoices", { count })).toBe(text)
      }
    })
  }
})

describe("мова інтерфейсу", () => {
  it("за замовчуванням українська; <html lang> слідує за мовою", async () => {
    const i18n = createI18n()
    expect(i18n.language).toBe("uk")
    expect(document.documentElement.lang).toBe("uk")
    await i18n.changeLanguage("en")
    expect(document.documentElement.lang).toBe("en")
  })

  it("непідтримувана мова падає на українську", () => {
    const i18n = createI18n({ language: "pl" as Language })
    expect(i18n.t("common.close", { ns: "erp-ui" })).toBe("Закрити")
  })

  it("стандартні підписи компонентів кіта перекладаються", async () => {
    const i18n = createI18n()
    render(<Spinner />)
    expect(screen.getByRole("status", { name: "Завантаження" })).toBeVisible()
    await act(async () => {
      await i18n.changeLanguage("en")
    })
    expect(screen.getByRole("status", { name: "Loading" })).toBeVisible()
  })
})

describe("довантаження мови (ADR-0009)", () => {
  const english = { app: { hello: "Hello" } }
  const ukrainian = { app: { hello: "Привіт" } }
  // Простір імен `app` тестовий — його немає в типах рядків демо.
  const hello = (i18n: I18n) => (i18n.t as (key: string) => string)("hello")

  /** Рядки проекту англійською, що спершу не вантажаться `failures` разів (офлайн). */
  function flakyEnglish(failures: number) {
    let attempts = 0
    return vi.fn(() => {
      attempts += 1
      return attempts <= failures
        ? Promise.reject(new Error("offline"))
        : Promise.resolve(english)
    })
  }

  it("рядки інших мов не в пам'яті, доки мову не обрали", async () => {
    const load = flakyEnglish(0)
    const i18n = createI18n({
      resources: { uk: ukrainian, en: load },
      defaultNamespace: "app",
    })
    expect(load).not.toHaveBeenCalled()
    expect(i18n.hasResourceBundle("en", "erp-ui")).toBe(false)
    await i18n.changeLanguage("en")
    expect(hello(i18n)).toBe("Hello")
    expect(i18n.t("common.close", { ns: "erp-ui" })).toBe("Close")
  })

  it("збій повторюється сам, і мова приходить", async () => {
    const load = flakyEnglish(1)
    const i18n = createI18n({
      resources: { uk: ukrainian, en: load },
      defaultNamespace: "app",
    })
    await i18n.changeLanguage("en")
    expect(load).toHaveBeenCalledTimes(2)
    expect(hello(i18n)).toBe("Hello")
  })

  it("після всіх повторів — запасна українська, а наступна зміна мови вантажить знову", async () => {
    const load = flakyEnglish(3)
    const i18n = createI18n({
      resources: { uk: ukrainian, en: load },
      defaultNamespace: "app",
    })
    await i18n.changeLanguage("en")
    expect(load).toHaveBeenCalledTimes(3)
    expect(hello(i18n)).toBe("Привіт")

    await i18n.changeLanguage("en")
    expect(load).toHaveBeenCalledTimes(4)
    expect(hello(i18n)).toBe("Hello")
  })

  it("зависла мережа не тримає перший кадр довше за таймаут", async () => {
    const i18n = createI18n({
      language: "en",
      resources: {
        uk: ukrainian,
        en: () => new Promise<never>(() => undefined),
      },
      defaultNamespace: "app",
    })
    await expect(whenI18nReady(i18n, 50)).resolves.toBeUndefined()
    // Рядки ще в дорозі: рендер іде запасною українською, без призупинення useTranslation.
    expect(i18n.isInitialized).toBe(true)
    expect(i18n.language).toBe("uk")
    expect(hello(i18n)).toBe("Привіт")
  })

  it("не прийшла частина мови — уся мова запасна, і <html lang> теж", async () => {
    const i18n = createI18n({
      resources: { uk: ukrainian, en: flakyEnglish(3) },
      defaultNamespace: "app",
    })
    await i18n.changeLanguage("en")
    expect(i18n.resolvedLanguage).toBe("uk")
    expect(document.documentElement.lang).toBe("uk")
    // Рядки кіта прийшли б, але без рядків проекту мова не показується наполовину.
    expect(i18n.t("common.close", { ns: "erp-ui" })).toBe("Закрити")
  })

  it("швидке «English → Українська» лишає українську, хоч англійська прийшла пізніше", async () => {
    initAppearance()
    let release: ((bundle: typeof english) => void) | undefined
    const i18n = createI18n({
      resources: {
        uk: ukrainian,
        en: () =>
          new Promise((resolve) => {
            release = resolve
          }),
      },
      defaultNamespace: "app",
    })
    const stop = syncLanguage(i18n)
    setAppearance({ language: "en" })
    setAppearance({ language: "uk" })
    await vi.waitFor(() => {
      expect(release).toBeDefined()
    })
    release?.(english)
    await vi.waitFor(() => {
      expect(i18n.hasResourceBundle("en", "app")).toBe(true)
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(i18n.language).toBe("uk")
    expect(document.documentElement.lang).toBe("uk")
    stop()
  })
})

describe("рядки модуля у своєму просторі імен (ADR-0025)", () => {
  const NAMESPACE = "test-module"
  const moduleUk = { title: "Контакти" }
  const moduleEn = vi.fn(() => Promise.resolve({ title: "Contacts" }))
  const resources: NamespaceResources = { uk: moduleUk, en: moduleEn }

  function ModuleTitle() {
    useNamespaceResources(NAMESPACE, resources)
    const t = useNamespaceT<typeof moduleUk>(NAMESPACE)
    return <h1>{t("title")}</h1>
  }

  it("сторінка модуля відкрита українською — після «English» приходять його англійські рядки", async () => {
    const i18n = createI18n()
    render(
      <Suspense fallback={<Spinner />}>
        <ModuleTitle />
      </Suspense>,
    )
    expect(screen.getByRole("heading", { name: "Контакти" })).toBeVisible()
    expect(moduleEn).not.toHaveBeenCalled()
    await act(async () => {
      await i18n.changeLanguage("en")
    })
    expect(
      await screen.findByRole("heading", { name: "Contacts" }),
    ).toBeVisible()
    expect(moduleEn).toHaveBeenCalledTimes(1)
  })

  it("застосунок стартує англійською — сторінка модуля одразу з англійськими рядками", async () => {
    const enOnly = vi.fn(() => Promise.resolve({ title: "People" }))
    const own: NamespaceResources = { uk: { title: "Люди" }, en: enOnly }
    function Title() {
      useNamespaceResources("test-module-en", own)
      const t = useNamespaceT<{ title: string }>("test-module-en")
      return <h1>{t("title")}</h1>
    }
    const i18n = createI18n({ language: "en" })
    await whenI18nReady(i18n)
    // React у тестах повторює рендер після `use()` лише в act, який чекають.
    await act(async () => {
      render(
        <Suspense fallback={<Spinner />}>
          <Title />
        </Suspense>,
      )
      await Promise.resolve()
    })
    expect(await screen.findByRole("heading", { name: "People" })).toBeVisible()
  })
})
