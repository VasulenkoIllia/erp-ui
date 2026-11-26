import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"

import { ApiError } from "@/registry/lib/api"
import {
  cards,
  fakeServer,
  renderBoard,
  setupBoardTests,
} from "./board.fixtures"

/** Крок UI07a (ADR-0100): дошка — перенесення, конфлікт, швидке створення, згортання з клавіатури. */

setupBoardTests()

describe("Board: дії з клавіатури", () => {
  it("«Перемістити в…»: зміна поля з версією, оголошення, фокус на картку в новій колонці", async () => {
    const user = userEvent.setup()
    const server = fakeServer()
    renderBoard(server)
    const menu = await screen.findByRole("button", { name: "Дії: Угода 26" })
    menu.focus()
    await user.keyboard("{Enter}")
    const won = await screen.findByRole("menuitemradio", { name: "Виграно" })
    expect(won).toHaveAttribute("aria-checked", "true")
    expect(won).toHaveAttribute("aria-disabled", "true")
    screen.getByRole("menuitemradio", { name: "Нові" }).focus()
    await user.keyboard("{Enter}")

    await waitFor(() => {
      expect(cards("new")).toContain("Угода 26")
    })
    expect(server.update).toHaveBeenCalledWith(
      "deals",
      expect.objectContaining({
        id: "d-26",
        data: { stage: "new" },
      }),
    )
    expect(server.update.mock.lastCall?.[1].previousData?.version).toBe(1)
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Дії: Угода 26" }),
      ).toHaveFocus()
    })
    await waitFor(() => {
      expect(document.getElementById("erp-ui-announcer")).toHaveTextContent(
        "«Угода 26» тепер у колонці «Нові»",
      )
    })
  })

  it("409: картку змінив інший — повідомлення, дошка оновлюється", async () => {
    const user = userEvent.setup()
    const server = fakeServer()
    server.update.mockRejectedValueOnce(
      new ApiError(409, { code: "conflict", message: "Conflict" }),
    )
    renderBoard(server)
    await user.click(
      await screen.findByRole("button", { name: "Дії: Угода 27" }),
    )
    await user.click(await screen.findByRole("menuitemradio", { name: "Нові" }))
    expect(
      await screen.findByText(/щойно змінив інший користувач/),
    ).toBeInTheDocument()
    expect(cards("won")).toContain("Угода 27")
    expect(server.columnRequests("won").length).toBeGreaterThan(1)
  })

  it("у згорнуту колонку: фокус на її кнопку «розгорнути», а не на колонку, звідки картка пішла", async () => {
    const user = userEvent.setup()
    renderBoard(fakeServer())
    const menu = await screen.findByRole("button", { name: "Дії: Угода 26" })
    menu.focus()
    await user.keyboard("{Enter}")
    screen.getByRole("menuitemradio", { name: "Програно" }).focus()
    await user.keyboard("{Enter}")
    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: "Програно, 2 картки, розгорнути колонку",
        }),
      ).toHaveFocus()
    })
  })

  it("швидке створення: назва й колонка; помилка поля — під полем; порожня назва — без запиту", async () => {
    const user = userEvent.setup()
    const server = fakeServer()
    renderBoard(server)
    await user.click(
      await screen.findByRole("button", {
        name: "Додати картку в колонку «Виграно»",
      }),
    )
    const name = screen.getByRole("textbox", { name: "Назва угоди" })
    expect(name).toHaveFocus()
    await user.keyboard("{Enter}")
    expect(name).toHaveAccessibleDescription("Заповніть це поле")
    expect(server.create).not.toHaveBeenCalled()

    await user.type(name, "Дубль{Enter}")
    await waitFor(() => {
      expect(name).toHaveAccessibleDescription("Така угода вже є")
    })
    // Фокус лишився в полі — помилку оголошує role="alert".
    expect(screen.getByText("Така угода вже є")).toHaveAttribute(
      "role",
      "alert",
    )
    expect(name).toHaveValue("Дубль")

    await user.clear(name)
    await user.type(name, "Нова угода{Enter}")
    await waitFor(() => {
      expect(cards("won")).toContain("Нова угода")
    })
    expect(server.create).toHaveBeenLastCalledWith("deals", {
      data: { title: "Нова угода", stage: "won" },
    })
    expect(name).toHaveValue("")
    await user.keyboard("{Escape}")
    expect(
      screen.getByRole("button", { name: "Додати картку в колонку «Виграно»" }),
    ).toHaveFocus()
  })

  it("згортання: набір у налаштуваннях списку, фокус на кнопку-пару", async () => {
    const user = userEvent.setup()
    const server = fakeServer()
    renderBoard(server)
    await user.click(
      await screen.findByRole("button", { name: "Згорнути колонку «Нові»" }),
    )
    await waitFor(() => {
      expect(server.saveListSettings).toHaveBeenCalledWith("deals", {
        collapsedColumns: ["lost", "new"],
      })
    })
    const expand = screen.getByRole("button", {
      name: "Нові, 25 карток, розгорнути колонку",
    })
    expect(expand).toHaveFocus()
    await user.click(expand)
    await waitFor(() => {
      expect(server.saveListSettings).toHaveBeenLastCalledWith("deals", {
        collapsedColumns: ["lost"],
      })
    })
    expect(
      screen.getByRole("button", { name: "Згорнути колонку «Нові»" }),
    ).toHaveFocus()
  })
})
