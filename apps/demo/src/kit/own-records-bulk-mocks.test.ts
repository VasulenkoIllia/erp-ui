import { describe, expect, it, vi } from "vitest"
import { z } from "zod"

import { warnOutsideMockCatalog } from "@/registry/lib/mock-catalog-check"
import { mockGrantsService } from "@/registry/lib/mock-scope"
import { signInMock } from "@/registry/lib/mocks"

import {
  advanceJobClock,
  client,
  jobSchema,
  lockedOnce,
  notes,
  runBulk,
  useOwnRecordsServer,
} from "./own-records-fixture"

/**
 * Крок A2c2b2 (ADR-0039): масові дії, повтор, токени API й службові права на «своїх» записах.
 */

describe("моки: «свої» записи поза карткою", () => {
  useOwnRecordsServer()

  it("масова дія: чужий — forbidden, невидимий — not_found, вибір «усе» — лише видимі", async () => {
    signInMock("s1")
    expect(await runBulk({ ids: ["n2"] })).toEqual({
      succeeded: 0,
      failed: { forbidden: ["n2"] },
    })
    signInMock("m1")
    expect(await runBulk({ ids: ["n1", "n2"] })).toEqual({
      succeeded: 1,
      failed: { not_found: ["n2"] },
    })
    const all = await runBulk({ filter: {}, exclude: ["n4", "n5"] })
    expect(all).toEqual({ succeeded: 1, failed: {} })
  })

  it("масова дія й правило проекту: запис, як у картці, — forbidden", async () => {
    signInMock("a1")
    expect(await runBulk({ ids: ["n3"] })).toEqual({
      succeeded: 0,
      failed: { forbidden: ["n3"] },
    })
  })

  it("масова дія без права перегляду: not_found, назви чужого запису немає", async () => {
    signInMock("w1")
    expect(await runBulk({ ids: ["n2"] })).toEqual({
      succeeded: 0,
      failed: { not_found: ["n2"] },
    })
  })

  it("повтор бере права на момент повтору: зниження до «Свої» лишає лише свої записи", async () => {
    notes.db.patch("n1", { responsibleId: "s1" })
    lockedOnce.add("n1")
    signInMock("s1")
    const { jobId } = await client.post(
      "/notes/bulk/delete",
      { ids: ["n1"] },
      { schema: z.object({ jobId: z.string() }) },
    )
    advanceJobClock()
    await client.get(`/jobs/${jobId}`, { schema: jobSchema })
    // n1 тепер чужий: людина бачить хід своєї задачі, а повтор дає невдачу `forbidden`, не дію.
    const row = notes.db.all().find((note) => note.id === "n1")
    if (row) row.responsibleId = "m2"
    const retried = await client.post(`/jobs/${jobId}/retry`, undefined, {
      schema: z.object({ jobId: z.string() }),
    })
    advanceJobClock()
    const job = await client.get(`/jobs/${retried.jobId}`, {
      schema: jobSchema,
    })
    expect(job.succeeded).toBe(0)
    expect(job.failures.map((group) => group.code)).toEqual(["forbidden"])
  })

  it("токен API: на «Свої» — дія лише над своїми, на «Усі» — над усіма", async () => {
    signInMock("s1")
    const { scopes } = await client.get("/me/api-tokens", {
      schema: z.object({
        scopes: z.array(
          z.object({ id: z.string(), label: z.string(), group: z.string() }),
        ),
      }),
    })
    expect(scopes).toEqual([
      { id: "notes:read", label: "Перегляд", group: "Нотатки" },
      {
        id: "notes:update:own",
        label: "Зміна (лише свої)",
        group: "Нотатки",
      },
      {
        id: "notes:delete:own",
        label: "Видалення (лише свої)",
        group: "Нотатки",
      },
    ])
  })

  it("службове право: рядок :own нічого не дає", () => {
    expect(mockGrantsService(["users:read:own"], "users", "read")).toBe(false)
    expect(mockGrantsService(["users:read"], "users", "read")).toBe(true)
    expect(mockGrantsService(["users:*"], "users", "edit")).toBe(true)
  })

  it("права поза каталогом: попередження один раз, зайвого не чіпає", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    localStorage.setItem(
      "erp-ui:mock-company-roles",
      JSON.stringify({
        c1: {
          roles: [{ id: "stored", permissions: ["users:read:own"] }],
          removed: [],
        },
      }),
    )
    const catalog = [
      {
        id: "users",
        label: "Користувачі",
        actions: [{ id: "read", label: "Перегляд" }],
      },
    ]
    warnOutsideMockCatalog(catalog)
    warnOutsideMockCatalog(catalog)
    const stored = warn.mock.calls.filter(([message]) =>
      String(message).includes('role "stored"'),
    )
    expect(stored).toHaveLength(1)
    expect(stored[0]?.[0]).toContain("users:read:own")
    warn.mockRestore()
  })
})
