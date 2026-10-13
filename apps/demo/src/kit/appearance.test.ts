import { beforeEach, describe, expect, it } from "vitest"

import {
  DEFAULT_APPEARANCE,
  APPEARANCE_STORAGE_KEY as STORAGE_KEY,
  applyAppearance,
  getAppearance,
  initAppearance,
  isDark,
  parseAppearance,
  pickAppearance,
  readStoredAppearance,
  setAppearance,
  setBrandAppearance,
  storeAppearance,
} from "@/registry/lib/appearance"

describe("parseAppearance", () => {
  it("повертає типові значення для порожнього чи зламаного вводу", () => {
    expect(parseAppearance(null)).toEqual(DEFAULT_APPEARANCE)
    expect(parseAppearance("garbage")).toEqual(DEFAULT_APPEARANCE)
  })

  it("відкидає невідомі значення поле за полем", () => {
    expect(
      parseAppearance({
        palette: "graphite",
        theme: "neon",
        density: "compact",
        sidebar: 1,
        language: "pl",
      }),
    ).toEqual({
      palette: "graphite",
      theme: "system",
      density: "compact",
      sidebar: "light",
      language: "uk",
    })
  })

  it("зберігає англійську, якщо її обрано", () => {
    expect(parseAppearance({ language: "en" }).language).toBe("en")
  })
})

describe("isDark", () => {
  it("system слідує за prefers-color-scheme", () => {
    expect(isDark("system", true)).toBe(true)
    expect(isDark("system", false)).toBe(false)
    expect(isDark("light", true)).toBe(false)
    expect(isDark("dark", false)).toBe(true)
  })
})

describe("applyAppearance", () => {
  let root: HTMLElement
  beforeEach(() => {
    root = document.createElement("html")
  })

  it("ставить атрибути за SPEC §6.2", () => {
    applyAppearance(
      root,
      {
        palette: "teal",
        theme: "dark",
        density: "compact",
        sidebar: "dark",
        language: "uk",
      },
      false,
    )
    expect(root.dataset.palette).toBe("teal")
    expect(root.classList.contains("dark")).toBe(true)
    expect(root.dataset.density).toBe("compact")
    expect(root.dataset.sidebar).toBe("dark")
  })

  it("прибирає атрибути для типових значень", () => {
    applyAppearance(
      root,
      { ...DEFAULT_APPEARANCE, density: "compact", sidebar: "dark" },
      true,
    )
    applyAppearance(root, DEFAULT_APPEARANCE, false)
    expect(root.dataset.palette).toBe("sapphire")
    expect(root.classList.contains("dark")).toBe(false)
    expect(root.hasAttribute("data-density")).toBe(false)
    expect(root.hasAttribute("data-sidebar")).toBe(false)
  })
})

describe("сховище", () => {
  it("зберігає й читає вигляд", () => {
    const appearance = { ...DEFAULT_APPEARANCE, palette: "indigo" as const }
    storeAppearance(appearance)
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}")).toEqual(
      appearance,
    )
    expect(readStoredAppearance()).toEqual(appearance)
  })

  it("не падає на зіпсованому JSON", () => {
    localStorage.setItem(STORAGE_KEY, "{oops")
    expect(readStoredAppearance()).toEqual(DEFAULT_APPEARANCE)
  })
})

describe("бренд (white-label, ADR-0011)", () => {
  beforeEach(() => {
    localStorage.clear()
    setBrandAppearance(null)
    initAppearance()
  })

  it("pickAppearance лишає тільки коректні поля", () => {
    expect(pickAppearance({ palette: "teal", theme: "neon", x: 1 })).toEqual({
      palette: "teal",
    })
    expect(pickAppearance(null)).toEqual({})
  })

  it("палітра бренду — типова, доки користувач не обрав свою", () => {
    setBrandAppearance({ palette: "teal" })
    expect(getAppearance().palette).toBe("teal")
    expect(document.documentElement.dataset.palette).toBe("teal")
    // Інша мова не «заморожує» палітру бренду: зберігається лише обране.
    setAppearance({ language: "en" })
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}")).toEqual({
      language: "en",
    })
    setBrandAppearance({ palette: "terracotta" })
    expect(getAppearance().palette).toBe("terracotta")
    setAppearance({ palette: "graphite" })
    setBrandAppearance({ palette: "indigo" })
    expect(getAppearance().palette).toBe("graphite")
  })

  it("без бренду — типові значення компанії", () => {
    setBrandAppearance({ palette: "teal" })
    setBrandAppearance(null)
    expect(getAppearance()).toEqual(DEFAULT_APPEARANCE)
  })
})
