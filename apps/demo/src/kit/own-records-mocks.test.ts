import { describe, expect, it } from "vitest"
import { z } from "zod"

import { setMockBlocked } from "@/registry/lib/mock-account"
import { signInMock } from "@/registry/lib/mocks"

import {
  blocked,
  client,
  listNotes,
  notes,
  noteRow,
  people,
  statusOf,
  useOwnRecordsServer,
} from "./own-records-fixture"

/**
 * Крок A2c2b2 (ADR-0039): «свої» записи в моках — відповідальний у записі, автор під час створення,
 * передача колезі, правило `own` на всіх шляхах читання й дій, свій код проекту.
 */

describe("моки: «свої» записи", () => {
  useOwnRecordsServer()

  it("read:own: список, total, пошук і запит за id — лише свої записи", async () => {
    signInMock("m1")
    const all = await listNotes()
    // Спільна n4 своя за відповідальним, але не належить компанії — бачить, як і решту спільних.
    expect(all.data.map((note) => note.id).sort()).toEqual(["n1", "n4", "n5"])
    expect(all.total).toBe(3)
    expect((await listNotes("?q=%D0%A7%D1%83%D0%B6%D0%B0")).total).toBe(0)
    expect((await listNotes("?id=n2&id=n1")).data.map((n) => n.id)).toEqual([
      "n1",
    ])
  })

  it("read:own: чужий запис — 404 на картку, закріплення, зміну й видалення", async () => {
    signInMock("m1")
    expect(await statusOf(client.get("/notes/n2"))).toBe(404)
    expect(await statusOf(client.put("/notes/n2/pin"))).toBe(404)
    expect(
      await statusOf(client.patch("/notes/n2", { title: "Х", version: 1 })),
    ).toBe(404)
    expect(await statusOf(client.delete("/notes/n2"))).toBe(404)
    expect(await statusOf(client.get("/notes/n1"))).toBe(200)
    expect(await statusOf(client.put("/notes/n1/pin"))).toBe(200)
  })

  it("update:own: чужий запис видно з позначкою own, дія — 403 раніше за 409 і 422", async () => {
    signInMock("s1")
    const { data } = await listNotes()
    const byId = new Map(data.map((note) => [note.id, note.deniedActions]))
    expect(byId.get("n2")).toEqual({ update: "own", delete: "own" })
    expect(byId.get("n3")).toEqual({ update: "own", delete: "own" })
    expect(await statusOf(client.get("/notes/n2"))).toBe(200)
    // Стара версія й значення не за схемою: 403 раніше за 409 і 422.
    expect(
      await statusOf(client.patch("/notes/n2", { title: 1, version: 99 })),
    ).toBe(403)
    expect(await statusOf(client.delete("/notes/n2"))).toBe(403)
  })

  it("свій запис дії не забороняє; спільний — код shared, а не own", async () => {
    notes.db.patch("n1", { responsibleId: "s1" })
    signInMock("s1")
    const { data } = await listNotes()
    const byId = new Map(data.map((note) => [note.id, note.deniedActions]))
    expect(byId.get("n1")).toBeUndefined()
    expect(byId.get("n4")).toEqual({ update: "shared", delete: "shared" })
    expect(
      await statusOf(client.patch("/notes/n1", { title: "Нова", version: 2 })),
    ).toBe(200)
  })

  it("створення: відповідальний — автор, колега компанії — можна", async () => {
    signInMock("m1")
    const noteOf = z.object({ responsibleId: z.string().nullable() })
    const mine = await client.post(
      "/notes",
      { title: "Нова" },
      { schema: noteOf },
    )
    expect(mine.responsibleId).toBe("m1")
    const empty = await client.post(
      "/notes",
      { title: "Порожньо", responsibleId: null },
      { schema: noteOf },
    )
    expect(empty.responsibleId).toBe("m1")
    const given = await client.post(
      "/notes",
      { title: "Колезі", responsibleId: "m2" },
      { schema: noteOf },
    )
    expect(given.responsibleId).toBe("m2")
  })

  it.each([
    ["іншої компанії", "x1"],
    ["заблокована", "b1"],
    ["без права бачити ресурс", "n1"],
    ["невідома", "nobody"],
  ])("передати не можна: %s", async (_name, id) => {
    setMockBlocked(blocked, { by: "a1", reason: "test" })
    const invalid = '422 {"responsibleId":"invalid"}'
    signInMock("m1")
    expect(
      await statusOf(
        client.post("/notes", { title: "Нова", responsibleId: id }),
      ),
    ).toBe(invalid)
    expect(
      await statusOf(
        client.patch("/notes/n1", { responsibleId: id, version: 1 }),
      ),
    ).toBe(invalid)
  })

  it("передача: 409 раніше за 422, після передачі автор втрачає доступ", async () => {
    signInMock("m1")
    expect(
      await statusOf(
        client.patch("/notes/n1", { responsibleId: "x1", version: 99 }),
      ),
    ).toBe(409)
    const saved = await client.patch(
      "/notes/n1",
      { responsibleId: "m2", version: 1 },
      { schema: noteRow },
    )
    expect(saved.responsibleId).toBe("m2")
    expect(await statusOf(client.get("/notes/n1"))).toBe(404)
    signInMock("m2")
    expect(await statusOf(client.get("/notes/n1"))).toBe(200)
  })

  it("колега, що вже пішов, не заважає зберегти інші поля; null знімає відповідального", async () => {
    // Пряма зміна даних: `db.patch` такого відповідального не пропустить.
    const stale = notes.db.all().find((note) => note.id === "n3")
    if (stale) stale.responsibleId = "x1"
    signInMock("a1")
    expect(
      await statusOf(client.patch("/notes/n3", { title: "Інша", version: 1 })),
    ).toBe(200)
    const cleared = await client.patch(
      "/notes/n3",
      { responsibleId: null, version: 2 },
      { schema: noteRow },
    )
    expect(cleared.responsibleId).toBeNull()
  })

  it("без права перегляду запис прихований: 404 на зміну й видалення, без `current`", async () => {
    signInMock("w1")
    expect(
      await statusOf(client.patch("/notes/n2", { title: "Х", version: 0 })),
    ).toBe(404)
    expect(await statusOf(client.delete("/notes/n2"))).toBe(404)
  })

  it("спільний запис платформа передає людині будь-якої компанії, що бачить ресурс", async () => {
    signInMock("pa")
    expect(
      await statusOf(
        client.patch("/notes/n4", { responsibleId: "m2", version: 1 }),
      ),
    ).toBe(200)
    expect(
      await statusOf(
        client.patch("/notes/n4", { responsibleId: "n1", version: 2 }),
      ),
    ).toBe('422 {"responsibleId":"invalid"}')
  })

  it("правило проекту бачить запис, як у картці: позначка в списку й перевірка дії збігаються", async () => {
    signInMock("a1")
    const { data } = await listNotes()
    const row = data.find((note) => note.id === "n3")
    expect(row?.deniedActions).toEqual({
      update: "computed",
      delete: "has_lines",
    })
    expect(
      await statusOf(client.patch("/notes/n3", { title: "Х", version: 1 })),
    ).toBe(403)
    expect(await statusOf(client.delete("/notes/n3"))).toBe(403)
  })

  it("db.select: без `rules` — усі записи компанії, з `rules` — лише видимі", () => {
    const ids = (rows: readonly { id: string }[]) =>
      rows.map((row) => row.id).sort()
    expect(ids(notes.db.select({}, "c1"))).toEqual([
      "n1",
      "n2",
      "n3",
      "n4",
      "n5",
    ])
    const manager = people.find((user) => user.id === "m1")
    if (!manager) throw new Error("no manager")
    const rules = notes.db.accessOf(manager, ["notes:read:own"])
    expect(ids(notes.db.select({}, "c1", rules))).toEqual(["n1", "n4", "n5"])
  })

  it("свій код проекту: позначка в записі, 403 на дію, інші дії вільні", async () => {
    signInMock("m1")
    const closed = await client.get("/notes/n5", { schema: noteRow })
    expect(closed.deniedActions).toEqual({ update: "closed_period" })
    expect(
      await statusOf(client.patch("/notes/n5", { title: "Х", version: 1 })),
    ).toBe(403)
    expect(await statusOf(client.delete("/notes/n5"))).toBe(200)
  })
})
