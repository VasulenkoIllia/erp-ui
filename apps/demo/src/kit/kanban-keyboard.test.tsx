import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"

import {
  Kanban,
  type KanbanColumn,
  type KanbanDrag,
  type KanbanLanes,
} from "@/registry/erp/kanban"
import { KanbanCard } from "@/registry/erp/kanban-card"
import { acceptsCard, ANY_LANE } from "@/registry/erp/kanban-drag"

/**
 * Крок UI07b (ADR-0103): стрілки між картками дошки (erp/kanban-keyboard) і картки, які можна тягнути
 * (erp/kanban-drag). Саме перетягування — e2e `board.spec.ts`: jsdom не має перетягування браузера.
 */

interface Card {
  id: string
  lane: string
}

const card = (id: string, lane = "x"): Card => ({ id, lane })

const COLUMNS: KanbanColumn<Card>[] = [
  {
    id: "new",
    label: "Нові",
    cards: [card("n1"), card("n2"), card("n3", "y")],
  },
  { id: "mid", label: "Порожня", cards: [] },
  { id: "won", label: "Виграно", cards: [card("w1"), card("w2", "y")] },
]

const LANES: KanbanLanes<Card> = {
  items: [
    { id: "x", label: "Доріжка X" },
    { id: "y", label: "Доріжка Y" },
  ],
  of: (each) => each.lane,
}

function renderKanban({
  lanes,
  drag,
  narrow = false,
}: {
  lanes?: KanbanLanes<Card>
  drag?: KanbanDrag<Card>
  narrow?: boolean
} = {}) {
  return render(
    <Kanban<Card>
      label="Угоди"
      columns={COLUMNS}
      getCardId={(each) => each.id}
      renderCard={(each) => (
        <div>
          <button type="button">Відкрити {each.id}</button>
          <button type="button">Меню {each.id}</button>
        </div>
      )}
      narrow={narrow}
      {...(lanes ? { lanes } : {})}
      {...(drag ? { drag } : {})}
    />,
  )
}

const button = (name: string) => screen.getByRole("button", { name })

describe("Kanban: стрілки між картками", () => {
  it("↑ ↓ — сусідня картка тієї ж дії, ← → — сусідня колонка на тому ж місці, порожня пропускається", async () => {
    const user = userEvent.setup()
    renderKanban()
    button("Відкрити n1").focus()
    await user.keyboard("{ArrowDown}")
    expect(button("Відкрити n2")).toHaveFocus()
    await user.keyboard("{Tab}")
    expect(button("Меню n2")).toHaveFocus()
    await user.keyboard("{ArrowRight}")
    expect(button("Меню w2")).toHaveFocus()
    await user.keyboard("{ArrowLeft}")
    expect(button("Меню n2")).toHaveFocus()
    // Довша колонка: з третьої картки в колонку на дві — на її останню.
    button("Меню n3").focus()
    await user.keyboard("{ArrowRight}")
    expect(button("Меню w2")).toHaveFocus()
  })

  it("на краю фокус лишається, а сторінка не прокручується; з модифікатором — не перехоплює", () => {
    renderKanban()
    const first = button("Меню n1")
    first.focus()
    expect(fireEvent.keyDown(first, { key: "ArrowUp" })).toBe(false)
    expect(first).toHaveFocus()
    expect(fireEvent.keyDown(first, { key: "ArrowLeft" })).toBe(false)
    expect(first).toHaveFocus()
    expect(fireEvent.keyDown(first, { key: "ArrowDown", altKey: true })).toBe(
      true,
    )
    expect(first).toHaveFocus()
  })

  it("доріжки: ← → лише в межах своєї доріжки", async () => {
    const user = userEvent.setup()
    renderKanban({ lanes: LANES })
    button("Меню n3").focus()
    await user.keyboard("{ArrowRight}")
    expect(button("Меню w2")).toHaveFocus()
    button("Меню n2").focus()
    await user.keyboard("{ArrowRight}")
    expect(button("Меню w1")).toHaveFocus()
  })
})

describe("Kanban: стрілки з кнопки меню картки", () => {
  const MOVE = {
    columns: COLUMNS.map(({ id, label }) => ({ id, label })),
    current: "new",
    onMove: () => undefined,
  }

  it("↓ веде на меню наступної картки, а не відкриває меню; Enter відкриває", async () => {
    const user = userEvent.setup()
    render(
      <Kanban<Card>
        label="Угоди"
        columns={COLUMNS}
        getCardId={(each) => each.id}
        renderCard={(each) => (
          <KanbanCard label={each.id} move={MOVE}>
            <p>{each.id}</p>
          </KanbanCard>
        )}
        narrow={false}
      />,
    )
    button("Дії: n1").focus()
    await user.keyboard("{ArrowDown}")
    expect(button("Дії: n2")).toHaveFocus()
    expect(screen.queryByRole("menu")).toBeNull()
    await user.keyboard("{ArrowRight}")
    expect(button("Дії: w2")).toHaveFocus()
    await user.keyboard("{Enter}")
    expect(await screen.findByRole("menu")).toBeInTheDocument()
  })
})

describe("Kanban: перетягування", () => {
  const drag: KanbanDrag<Card> = {
    canDrag: (each) => each.id !== "n2",
    onDrop: () => undefined,
  }
  const draggable = () =>
    [...document.querySelectorAll("li[draggable='true']")].map(
      (item) => (item as HTMLElement).dataset.kanbanCard,
    )

  it("тягнути можна лише дозволені картки; на вузькому контейнері — жодну", () => {
    const { rerender } = renderKanban({ drag })
    expect(draggable()).toEqual(["n1", "n3", "w1", "w2"])
    rerender(
      <Kanban<Card>
        label="Угоди"
        columns={COLUMNS}
        getCardId={(each) => each.id}
        renderCard={(each) => <p>{each.id}</p>}
        narrow
        drag={drag}
      />,
    )
    expect(draggable()).toEqual([])
  })

  it("без перетягування картки не позначені перетягуваними", () => {
    renderKanban()
    expect(draggable()).toEqual([])
  })
})

describe("acceptsCard", () => {
  const card = { board: "b", id: "n1", column: "new", lane: "x" }

  it("та сама дошка й доріжка, інша колонка; шапка колонки — будь-яка доріжка", () => {
    expect(acceptsCard(card, { board: "b", column: "won", lane: "x" })).toBe(
      true,
    )
    expect(
      acceptsCard(card, { board: "b", column: "won", lane: ANY_LANE }),
    ).toBe(true)
  })

  it("своя колонка, інша доріжка чи інша дошка — ні", () => {
    expect(acceptsCard(card, { board: "b", column: "new", lane: "x" })).toBe(
      false,
    )
    expect(acceptsCard(card, { board: "b", column: "won", lane: "y" })).toBe(
      false,
    )
    expect(acceptsCard(card, { board: "c", column: "won", lane: "x" })).toBe(
      false,
    )
  })
})
