import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { GetListParams } from "@/registry/lib/ra-core"
import { describe, expect, it, vi } from "vitest"

import { ApiError, MAX_PER_PAGE } from "@/registry/lib/api"
import type { ListFilter } from "@/registry/lib/list-state"
import { boardColumnsFor } from "@/registry/templates/board-data"
import { ColumnMore } from "@/registry/templates/board-status"
import {
  boardTest,
  cards,
  column,
  columnName,
  fakeServer,
  readOnly,
  renderBoard,
  setupBoardTests,
} from "./board.fixtures"

/** Крок UI07a (ADR-0100): дошка — колонки, суми, «Показати ще», доріжки, права, телефон, стани. */

setupBoardTests()

describe("Board: колонки за полем", () => {
  it("кількість і сума від сервера; «Показати ще»: та сама колонка більшою сторінкою, картки й фокус під час завантаження", async () => {
    const user = userEvent.setup()
    const server = fakeServer()
    renderBoard(server)
    await screen.findByRole("heading", { name: columnName("Нові", 25) })
    expect(column(/^Нові/)).toHaveTextContent("25000 грн")
    await waitFor(() => {
      expect(cards("new")).toHaveLength(20)
    })
    expect(server.columnRequests("new")[0]?.meta).toMatchObject({
      sumOf: ["amount"],
    })
    // Згорнута колонка модуля просить лише кількість і суму.
    expect(server.columnRequests("lost")[0]?.pagination?.perPage).toBe(1)
    expect(
      screen.getByRole("button", {
        name: "Програно, 1 картка, розгорнути колонку",
      }),
    ).toBeInTheDocument()

    // Більша сторінка вантажиться: картки й кнопка з фокусом лишаються (ключ запиту інший).
    const respond = server.getList.getMockImplementation()
    if (!respond) throw new Error("getList без реалізації")
    let release = () => undefined as unknown
    server.getList.mockImplementationOnce(
      (resource: string, params: GetListParams) =>
        new Promise((resolve) => {
          release = () => {
            resolve(respond(resource, params))
          }
        }),
    )
    const more = screen.getByRole("button", { name: "Показати ще" })
    await user.click(more)
    await waitFor(() => {
      expect(more).toHaveAttribute("aria-disabled", "true")
    })
    expect(cards("new")).toHaveLength(20)
    expect(more).toHaveFocus()

    release()
    await waitFor(() => {
      expect(cards("new")).toHaveLength(25)
    })
    expect(server.columnRequests("new").at(-1)?.pagination?.perPage).toBe(40)
    expect(screen.queryByRole("button", { name: "Показати ще" })).toBeNull()
    // Кнопка зникла — фокус на першій новій картці, скрінрідер чує, скільки показано.
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Дії: Угода 21" }),
      ).toHaveFocus()
    })
    await waitFor(() => {
      expect(document.getElementById("erp-ui-announcer")).toHaveTextContent(
        "Показано 25 з 25",
      )
    })
  })

  it("новий пошук — знову перша сторінка колонки", async () => {
    const user = userEvent.setup()
    const server = fakeServer()
    renderBoard(server)
    await user.click(await screen.findByRole("button", { name: "Показати ще" }))
    await waitFor(() => {
      expect(cards("new")).toHaveLength(25)
    })
    await user.type(screen.getByRole("searchbox"), "Угода")
    await waitFor(() => {
      expect(server.columnRequests("new").at(-1)?.filter).toMatchObject({
        q: "Угода",
      })
    })
    expect(server.columnRequests("new").at(-1)?.pagination?.perPage).toBe(20)
  })

  it("на межі сторінки сервера — порада уточнити фільтр замість «Показати ще»", () => {
    render(
      <ColumnMore
        column={{
          id: "new",
          cards: Array.from({ length: MAX_PER_PAGE }, (_, index) => ({
            id: index,
          })),
          total: 812,
          sum: undefined,
          perPage: MAX_PER_PAGE,
          error: null,
          isFetching: false,
          updatedAt: 1,
          failedAt: 0,
          refetch: vi.fn(),
        }}
        onMore={vi.fn()}
      />,
    )
    expect(
      screen.getByText(
        "Показано 500 з 812. Щоб побачити решту, уточніть фільтр.",
      ),
    ).toBeInTheDocument()
    expect(screen.queryByRole("button")).toBeNull()
  })

  it("вкладка, що вже обмежує поле колонок, лишає лише свої колонки", () => {
    const columns = [{ id: "new" }, { id: "won" }, { id: "lost" }]
    const ids = (filter: ListFilter) =>
      boardColumnsFor(columns, filter, "stage").map(({ id }) => id)
    expect(ids({ stage: ["new", "won"] })).toEqual(["new", "won"])
    expect(ids({ stage: "lost" })).toEqual(["lost"])
    expect(ids({ stage: "" })).toEqual(["new", "won", "lost"])
    expect(ids({ q: "Угода" })).toEqual(["new", "won", "lost"])
  })

  it("сервер без сум: сума завантажених карток лише в колонці, завантаженій повністю", async () => {
    renderBoard(fakeServer({ sums: false }))
    await screen.findByRole("heading", { name: columnName("Виграно", 2) })
    expect(column(/^Виграно/)).toHaveTextContent("2000 грн")
    expect(column(/^Нові/)).not.toHaveTextContent("грн")
  })

  it("доріжки: картки за відповідальним, невідомий — «Інше»", async () => {
    boardTest.options = {
      lanes: {
        items: [{ id: "u-1", label: "Олена" }],
        of: (deal) => deal.owner,
      },
    }
    renderBoard(fakeServer())
    expect(
      await screen.findByRole("heading", { level: 3, name: "Олена" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { level: 3, name: "Інше" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("list", { name: "Виграно, Олена" }),
    ).toHaveTextContent("Угода 27")
    expect(
      screen.getByRole("list", { name: "Виграно, Інше" }),
    ).toHaveTextContent("Угода 26")
  })
})

describe("Board: права, телефон, стани", () => {
  it("лише перегляд: причина замість колонок, без швидкого створення; позначки запису й «Редагує …»", async () => {
    const user = userEvent.setup()
    boardTest.options = {
      lockedBy: (deal) => (deal.id === "d-27" ? "Тарас" : undefined),
      moveDenied: "Переносить менеджер",
    }
    renderBoard(fakeServer(), readOnly())
    await user.click(
      await screen.findByRole("button", { name: "Дії: Угода 26" }),
    )
    expect(
      await screen.findByRole("menuitem", { name: "Переносить менеджер" }),
    ).toHaveAttribute("aria-disabled", "true")
    expect(screen.queryByRole("menuitemradio")).toBeNull()
    expect(screen.queryByRole("button", { name: /Додати картку/ })).toBeNull()
    expect(screen.getByText("Редагує Тарас")).toBeInTheDocument()
  })

  it("вузький контейнер: одна колонка й перемикач «Колонка», згортання немає", async () => {
    boardTest.width = 360
    renderBoard(fakeServer())
    expect(
      await screen.findByRole("combobox", { name: "Колонка" }),
    ).toBeInTheDocument()
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(1)
    expect(screen.queryByRole("button", { name: /Згорнути/ })).toBeNull()
  })

  it("помилка всіх колонок — стан із повтором; нічого не знайдено — «Скинути фільтри» з фокусом у пошук", async () => {
    const user = userEvent.setup()
    const server = fakeServer()
    server.getList.mockRejectedValue(
      new ApiError(500, { code: "server", message: "Boom" }),
    )
    const { unmount } = renderBoard(server)
    expect(
      await screen.findByRole("button", { name: "Спробувати ще" }),
    ).toBeInTheDocument()
    unmount()

    // Збій оновлення дошки з картками: картки лишаються, над ними — помилка з повтором.
    const flaky = fakeServer()
    const second = renderBoard(flaky)
    await waitFor(() => {
      expect(cards("new")).toHaveLength(20)
    })
    flaky.getList.mockRejectedValue(
      new ApiError(500, { code: "server", message: "Boom" }),
    )
    await user.click(screen.getByRole("button", { name: "Оновити" }))
    expect(
      (await screen.findAllByRole("button", { name: "Спробувати ще" })).length,
    ).toBeGreaterThan(0)
    expect(cards("new")).toHaveLength(20)
    second.unmount()

    renderBoard(fakeServer())
    await screen.findByRole("heading", { name: columnName("Нові", 25) })
    await user.type(screen.getByRole("searchbox"), "немає такої")
    await waitFor(() => {
      expect(document.querySelector('[data-kind="no-results"]')).not.toBeNull()
    })
    const noResults = document.querySelector(
      '[data-kind="no-results"]',
    ) as HTMLElement
    await user.click(
      within(noResults).getByRole("button", { name: "Скинути фільтри" }),
    )
    expect(screen.getByRole("searchbox")).toHaveFocus()
    await screen.findByRole("heading", { name: columnName("Нові", 25) })
  })
})
