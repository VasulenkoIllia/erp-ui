import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"

import { ApiError } from "@/registry/lib/api"
import {
  shareCardsById,
  withPendingMoves,
  type BoardColumnData,
} from "@/registry/templates/board-data"
import {
  boardTest,
  cards,
  column,
  columnName,
  fakeServer,
  renderBoard,
  setupBoardTests,
  type Deal,
} from "./board.fixtures"

/**
 * Крок UI07b (ADR-0103): перенесення оптимістичне — картка одразу на новому місці, відмова сервера повертає її з
 * поясненням; кілька вибраних карток — панель вибраного з підсумком «Перенесено N з M».
 */

setupBoardTests()

/** Відповідь сервера, яку тест відпускає сам. */
function deferred<T>() {
  let resolve: (value: T) => void = () => undefined
  let reject: (reason: unknown) => void = () => undefined
  const promise = new Promise<T>((ok, fail) => {
    resolve = ok
    reject = fail
  })
  return { promise, resolve, reject }
}

const conflict = () =>
  new ApiError(409, { code: "conflict", message: "Conflict" })

async function moveWithMenu(
  user: ReturnType<typeof userEvent.setup>,
  card: string,
  to: string,
) {
  await user.click(await screen.findByRole("button", { name: `Дії: ${card}` }))
  await user.click(await screen.findByRole("menuitemradio", { name: to }))
}

describe("Board: оптимістичне перенесення", () => {
  it("картка одразу в новій колонці зі спінером, кількість зсунута; після відповіді — там само", async () => {
    const user = userEvent.setup()
    const server = fakeServer()
    const reply = deferred<undefined>()
    const save = server.update.getMockImplementation()
    server.update.mockImplementationOnce(async (...args) => {
      await reply.promise
      if (!save) throw new Error("немає збереження")
      return save(...args)
    })
    renderBoard(server)
    await moveWithMenu(user, "Угода 26", "Нові")

    expect(cards("new")[0]).toBe("Угода 26")
    expect(cards("won")).not.toContain("Угода 26")
    expect(column(columnName("Нові", 26))).toBeInTheDocument()
    expect(column(columnName("Виграно", 1))).toBeInTheDocument()
    const card = screen
      .getByRole("button", { name: "Дії: Угода 26" })
      .closest("[data-slot='kanban-card']")
    expect(card).toHaveAttribute("aria-busy", "true")

    reply.resolve(undefined)
    await waitFor(() => {
      expect(document.getElementById("erp-ui-announcer")).toHaveTextContent(
        "«Угода 26» тепер у колонці «Нові»",
      )
    })
    expect(cards("new")).toContain("Угода 26")
    expect(column(columnName("Нові", 26))).toBeInTheDocument()
    expect(
      screen
        .getByRole("button", { name: "Дії: Угода 26" })
        .closest("[data-slot='kanban-card']"),
    ).not.toHaveAttribute("aria-busy", "true")
  })

  it("409: картка повертається на місце з поясненням, дошка оновлюється", async () => {
    const user = userEvent.setup()
    const server = fakeServer()
    const reply = deferred<never>()
    server.update.mockImplementationOnce(() => reply.promise)
    renderBoard(server)
    await moveWithMenu(user, "Угода 27", "Нові")
    expect(cards("new")).toContain("Угода 27")

    reply.reject(conflict())
    expect(
      await screen.findByText(
        "Картку «Угода 27» щойно змінив інший користувач, тому її повернуто на місце. Дошку оновлено, спробуйте ще раз.",
      ),
    ).toBeInTheDocument()
    expect(cards("won")).toContain("Угода 27")
    expect(cards("new")).not.toContain("Угода 27")
    expect(server.columnRequests("won").length).toBeGreaterThan(1)
  })

  it("інша помилка: картка повертається без оновлення дошки, фокус на її меню", async () => {
    const user = userEvent.setup()
    const server = fakeServer()
    server.update.mockRejectedValueOnce(
      new ApiError(500, { code: "server", message: "Сервер недоступний" }),
    )
    renderBoard(server)
    await moveWithMenu(user, "Угода 27", "Нові")
    expect(
      await screen.findByText(/Не вдалося перемістити «Угода 27»/),
    ).toBeInTheDocument()
    expect(cards("won")).toContain("Угода 27")
    expect(server.columnRequests("won")).toHaveLength(1)
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Дії: Угода 27" }),
      ).toHaveFocus()
    })
  })
})

describe("Board: своє перенесення модуля кидає одразу", () => {
  it("картка повертається, не лишається зайнятою, причина в повідомленні", async () => {
    const user = userEvent.setup()
    boardTest.options = {
      move: () => {
        throw new Error("Перехід заборонено")
      },
    }
    renderBoard(fakeServer())
    await moveWithMenu(user, "Угода 27", "Нові")
    expect(
      await screen.findByText(/Не вдалося перемістити «Угода 27»/),
    ).toBeInTheDocument()
    expect(cards("won")).toContain("Угода 27")
    expect(
      screen
        .getByRole("button", { name: "Дії: Угода 27" })
        .closest("[data-slot='kanban-card']"),
    ).not.toHaveAttribute("aria-busy", "true")
  })
})

describe("Board: колонка не перемальовується вся", () => {
  it("перенесення й вибір перемальовують лише свою картку", async () => {
    const user = userEvent.setup()
    const rendered: string[] = []
    boardTest.options = {
      renderCard: (deal) => {
        rendered.push(deal.id)
        return <p>{deal.title}</p>
      },
    }
    const server = fakeServer()
    const reply = deferred<undefined>()
    const save = server.update.getMockImplementation()
    server.update.mockImplementationOnce(async (...args) => {
      await reply.promise
      if (!save) throw new Error("немає збереження")
      return save(...args)
    })
    renderBoard(server)
    await screen.findByRole("button", { name: "Дії: Угода 26" })
    await waitFor(() => {
      expect(cards("new")).toHaveLength(20)
    })
    rendered.length = 0
    await user.click(screen.getByRole("checkbox", { name: "Вибрати Угода 03" }))
    expect(rendered).toEqual(["d-3"])
    rendered.length = 0
    await moveWithMenu(user, "Угода 26", "Нові")
    expect(rendered).toEqual(["d-26"])
    rendered.length = 0
    reply.resolve(undefined)
    await waitFor(() => {
      expect(document.getElementById("erp-ui-announcer")).toHaveTextContent(
        "«Угода 26» тепер у колонці «Нові»",
      )
    })
    // Відповідь сервера зсунула колонку, але незмінені картки — ті самі об'єкти (shareCardsById).
    expect(new Set(rendered)).toEqual(new Set(["d-26"]))
  })
})

describe("Board: кілька карток", () => {
  async function select(
    user: ReturnType<typeof userEvent.setup>,
    ...names: string[]
  ) {
    for (const name of names)
      await user.click(
        await screen.findByRole("checkbox", { name: `Вибрати ${name}` }),
      )
  }

  async function moveSelected(
    user: ReturnType<typeof userEvent.setup>,
    to: string,
  ) {
    await user.click(screen.getByRole("button", { name: "Перемістити в…" }))
    await user.click(await screen.findByRole("menuitem", { name: to }))
  }

  it("панель вибраного: усі вибрані в колонці, підсумок; без масових дій модуля вибір теж є", async () => {
    const user = userEvent.setup()
    const server = fakeServer()
    renderBoard(server)
    await select(user, "Угода 01", "Угода 02")
    await moveSelected(user, "Виграно")
    expect(
      await screen.findByText("Перенесено 2 картки в колонку «Виграно»"),
    ).toBeInTheDocument()
    expect(cards("won")).toEqual(
      expect.arrayContaining(["Угода 01", "Угода 02"]),
    )
    expect(server.update).toHaveBeenCalledTimes(2)
  })

  it("частина не перенеслась: «Перенесено 1 з 3», перша причина; заблоковану не надсилаємо", async () => {
    const user = userEvent.setup()
    const server = fakeServer()
    boardTest.options = {
      lockedBy: (deal) => (deal.id === "d-3" ? "Тарас" : undefined),
    }
    const save = server.update.getMockImplementation()
    server.update.mockImplementation((resource, params) =>
      params.id === "d-2" || !save
        ? Promise.reject(conflict())
        : save(resource, params),
    )
    renderBoard(server)
    await select(user, "Угода 01", "Угода 02", "Угода 03")
    await moveSelected(user, "Виграно")
    expect(
      await screen.findByText(
        "Перенесено 1 з 3 у колонку «Виграно». Решту не перенесено. «Угода 03»: Картку зараз редагує Тарас",
      ),
    ).toBeInTheDocument()
    expect(server.update).toHaveBeenCalledTimes(2)
    // Заблокована картка має ще й «Редагує Тарас».
    expect(cards("new")).toEqual(
      expect.arrayContaining(["Угода 02", "Угода 03Редагує Тарас"]),
    )
    expect(cards("won")).toContain("Угода 01")
  })

  it("«усі за фільтром»: замість колонок причина", async () => {
    const user = userEvent.setup()
    renderBoard(fakeServer())
    await user.click(
      await screen.findByRole("checkbox", { name: /Вибрати всі/ }),
    )
    await user.click(screen.getByRole("button", { name: "Перемістити в…" }))
    const menu = await screen.findByRole("menu")
    expect(
      within(menu).getByRole("menuitem", {
        name: "Переносити можна лише картки, вибрані на дошці, а не всі за фільтром",
      }),
    ).toHaveAttribute("aria-disabled", "true")
    expect(within(menu).queryByRole("menuitem", { name: "Нові" })).toBeNull()
  })
})

describe("withPendingMoves", () => {
  const deal = (id: string, stage: string, amount = 100): Deal => ({
    id,
    version: 1,
    title: id,
    stage,
    amount,
    owner: "u-1",
  })
  const columnOf = (
    id: string,
    list: Deal[],
    total = list.length,
  ): BoardColumnData<Deal> => ({
    id,
    cards: list,
    total,
    sum: list.reduce((sum, each) => sum + each.amount, 0),
    perPage: 20,
    error: null,
    isFetching: false,
    updatedAt: 1,
    failedAt: 0,
    refetch: () => undefined,
  })

  it("картка вгорі нової колонки, кількість і сума зсунуті, поки сервер її не переніс", () => {
    const a = deal("a", "new", 300)
    const columns = [
      columnOf("new", [a, deal("b", "new")]),
      columnOf("won", [deal("c", "won")]),
    ]
    const pending = new Map([["a", { record: a, from: "new", to: "won" }]])
    const [fresh, won] = withPendingMoves(columns, pending, "stage", "amount")
    expect(fresh?.cards?.map((card) => card.id)).toEqual(["b"])
    expect(fresh?.total).toBe(1)
    expect(fresh?.sum).toBe(100)
    expect(won?.cards?.map((card) => card.id)).toEqual(["a", "c"])
    expect(won?.cards?.[0]?.stage).toBe("won")
    expect(won?.total).toBe(2)
    expect(won?.sum).toBe(400)
  })

  it("свіжа відповідь уже з перенесенням: без подвійного зсуву", () => {
    const a = deal("a", "new", 300)
    const columns = [
      columnOf("new", [deal("b", "new")]),
      columnOf("won", [{ ...a, stage: "won" }, deal("c", "won")]),
    ]
    const pending = new Map([["a", { record: a, from: "new", to: "won" }]])
    const [fresh, won] = withPendingMoves(columns, pending, "stage", "amount")
    expect(fresh).toBe(columns[0])
    expect(won?.cards?.map((card) => card.id)).toEqual(["a", "c"])
    expect(won?.total).toBe(2)
    expect(won?.sum).toBe(400)
    expect(withPendingMoves(columns, new Map(), "stage", "amount")).toBe(
      columns,
    )
  })

  it("одна колонка вже оновилась, друга ні: кожна зсувається за своєю відповіддю", () => {
    const a = deal("a", "new", 300)
    const pending = new Map([
      ["a", { record: { ...a, stage: "won" }, from: "new", to: "won" }],
    ])
    // Нова колонка вже з карткою, стара ще з нею: стара зсувається, нова ні.
    const [staleFrom, freshTo] = withPendingMoves(
      [
        columnOf("new", [a, deal("b", "new")]),
        columnOf("won", [{ ...a, stage: "won" }, deal("c", "won")]),
      ],
      pending,
      "stage",
      "amount",
    )
    expect(staleFrom?.total).toBe(1)
    expect(freshTo?.total).toBe(2)
    expect(freshTo?.sum).toBe(400)
    // Стара вже без картки, нова ще без неї: зсувається лише нова.
    const [freshFrom, staleTo] = withPendingMoves(
      [
        columnOf("new", [deal("b", "new")]),
        columnOf("won", [deal("c", "won")]),
      ],
      pending,
      "stage",
      "amount",
    )
    expect(freshFrom?.total).toBe(1)
    expect(staleTo?.total).toBe(2)
    expect(staleTo?.cards?.[0]).toBe(pending.get("a")?.record)
  })
})

describe("shareCardsById", () => {
  const list = (...ids: string[]) => ({
    data: ids.map((id) => ({ id, title: id })),
    total: ids.length,
  })

  it("незмінена картка лишається тим самим об'єктом, навіть коли зсунулась", () => {
    const previous = list("a", "b", "c")
    const shared = shareCardsById(previous, list("b", "c")) as ReturnType<
      typeof list
    >
    expect(shared.data[0]).toBe(previous.data[1])
    expect(shared.data[1]).toBe(previous.data[2])
    expect(shared.total).toBe(2)
  })

  it("змінена картка — новий об'єкт; та сама відповідь — попередня", () => {
    const previous = list("a", "b")
    const next = list("a", "b")
    next.data[1] = { id: "b", title: "нове" }
    const shared = shareCardsById(previous, next) as ReturnType<typeof list>
    expect(shared.data[0]).toBe(previous.data[0])
    expect(shared.data[1]).not.toBe(previous.data[1])
    expect(shared.data[1]).toEqual({ id: "b", title: "нове" })
    expect(shareCardsById(previous, list("a", "b"))).toBe(previous)
  })
})
