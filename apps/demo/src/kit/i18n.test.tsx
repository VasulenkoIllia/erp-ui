import { act, render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { createI18n, LANGUAGES, type Language } from "@/registry/lib/i18n"
import { en as kitEn } from "@/registry/lib/i18n-en"
import { uk as kitUk } from "@/registry/lib/i18n-uk"
import { Spinner } from "@/registry/ui/spinner"

import { createDemoI18n, demoResources, DEMO_NAMESPACE } from "@/i18n"

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
    expect(
      checkParity({
        uk: demoResources.uk[DEMO_NAMESPACE],
        en: demoResources.en[DEMO_NAMESPACE],
      }),
    ).toEqual([])
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
    it(lng, () => {
      const i18n = createDemoI18n(lng)
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
