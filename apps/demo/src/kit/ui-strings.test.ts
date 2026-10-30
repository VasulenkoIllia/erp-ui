import { describe, expect, it } from "vitest"

import { en as kitEn } from "@/registry/lib/i18n-en"
import { uk as kitUk } from "@/registry/lib/i18n-uk"

import demoEn from "@/i18n/en.json"
import demoUk from "@/i18n/uk.json"

// Glob, а не перелік: рядки нового модуля потрапляють у перевірку самі.
const moduleBundles = import.meta.glob<{ default: unknown }>(
  "../../../../registry/modules/*/i18n/*.json",
  { eager: true },
)

const bundles: [string, unknown][] = [
  ["кіт, uk", kitUk],
  ["кіт, en", kitEn],
  ["демо, uk", demoUk],
  ["демо, en", demoEn],
  ...Object.entries(moduleBundles).map(([file, bundle]): [string, unknown] => [
    file.replace(/^.*\/modules\//, ""),
    bundle.default,
  ]),
]

/** Ключі рядків із довгим тире. Прочерк порожнього значення не текст: він дозволений. */
function dashedStrings(value: unknown, key = ""): string[] {
  if (typeof value === "string")
    return /[—–]/.test(value) && value.trim() !== "—"
      ? [`${key}: ${value}`]
      : []
  if (typeof value !== "object" || value === null) return []
  return Object.entries(value).flatMap(([childKey, child]) =>
    dashedStrings(child, key ? `${key}.${childKey}` : childKey),
  )
}

describe("тексти інтерфейсу без довгих тире", () => {
  it.each(bundles)("%s", (_name, bundle) => {
    expect(dashedStrings(bundle)).toEqual([])
  })

  it("перевірка бачить рядки обох модулів", () => {
    expect(bundles.map(([name]) => name)).toEqual(
      expect.arrayContaining([
        "A2-users/i18n/uk.json",
        "A2-users/i18n/en.json",
        "B1-contacts/i18n/uk.json",
        "B1-contacts/i18n/en.json",
      ]),
    )
  })

  it("ловить тире у вкладеному рядку, пропускає прочерк і дефіс", () => {
    expect(
      dashedStrings({
        form: { hint: "Перше — друге", range: "1–5" },
        empty: "—",
        phone: "+380-44",
        count: 3,
      }),
    ).toEqual(["form.hint: Перше — друге", "form.range: 1–5"])
  })
})
