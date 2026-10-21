import { describe, expect, it } from "vitest"

import { APPEARANCE_STORAGE_KEY } from "@/registry/lib/appearance"
import mockServerSource from "@/registry/lib/mock-server.ts?raw"
import e2eSource from "@/registry/tools/e2e.ts?raw"

/**
 * Помічники e2e (tools/e2e) працюють у Node Playwright і не імпортують код застосунку, тож ключі
 * сховища в них — копії. Тест не дає копіям розійтися з кітом.
 */
describe("tools/e2e: ключі сховища збігаються з кітом", () => {
  it("вигляд — як у lib/appearance", () => {
    expect(e2eSource).toContain(
      `export const APPEARANCE_STORAGE_KEY = "${APPEARANCE_STORAGE_KEY}"`,
    )
  })

  it("сесія моків — як у lib/mock-server", () => {
    const key = /const SESSION_KEY = "([^"]+)"/.exec(mockServerSource)?.[1]
    expect(key).toBeTruthy()
    expect(e2eSource).toContain(
      `export const MOCK_SESSION_STORAGE_KEY = "${String(key)}"`,
    )
  })
})
