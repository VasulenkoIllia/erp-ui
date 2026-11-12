import { afterEach, describe, expect, it, vi } from "vitest"

const STORAGE_KEY = "erp-ui:mock-scenarios"

describe("lib/mock-scenarios", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it("читає сховище за першим зверненням, а не під час завантаження модуля (ADR-0079)", async () => {
    // Без побічних дій під час завантаження збирач викидає модуль разом із панеллю розробника там,
    // де моки вимкнено; consumer-smoke шукає ключ сховища в збірці проекту з бекендом.
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ global: "slow", resources: { invoices: "error" } }),
    )
    const getItem = vi.spyOn(Storage.prototype, "getItem")
    vi.resetModules()
    const scenarios = await import("@/registry/lib/mock-scenarios")
    expect(getItem).not.toHaveBeenCalled()

    expect(scenarios.scenarioFor("invoices")).toBe("error")
    expect(scenarios.scenarioFor("contacts")).toBe("slow")
    expect(scenarios.getScenarioState().global).toBe("slow")
    expect(getItem).toHaveBeenCalledTimes(1)
  })

  it("зміна до першого читання бере збережений стан і зберігає новий", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ global: "empty", resources: {} }),
    )
    vi.resetModules()
    const scenarios = await import("@/registry/lib/mock-scenarios")

    scenarios.setScenario("conflict", "invoices")
    expect(scenarios.getScenarioState()).toEqual({
      global: "empty",
      resources: { invoices: "conflict" },
    })
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}")).toEqual({
      global: "empty",
      resources: { invoices: "conflict" },
    })
  })
})
