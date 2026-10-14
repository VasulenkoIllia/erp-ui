import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useRef } from "react"
import { beforeAll, describe, expect, it, vi } from "vitest"

import { useGridKeyboard } from "@/registry/hooks/use-grid-keyboard"

/** Грід 2 × 2: у шапці — кнопка сортування, у другій колонці рядків — дві кнопки. */
function Grid() {
  const ref = useRef<HTMLDivElement>(null)
  const focus = useGridKeyboard({
    gridRef: ref,
    listKey: "list",
    rowCount: 2,
    colCount: 2,
    headerColCount: 2,
    pageRows: () => 1,
  })
  return (
    <>
      <button type="button">До гріда</button>
      <div
        ref={ref}
        role="grid"
        tabIndex={-1}
        onKeyDown={focus.onKeyDown}
        onFocus={focus.onFocus}
        onBlur={focus.onBlur}
      >
        <div role="row">
          <div role="columnheader" data-cell="" data-row={-1} data-col={0}>
            <button type="button">Номер</button>
          </div>
          <div role="columnheader" data-cell="" data-row={-1} data-col={1}>
            Дії
          </div>
        </div>
        {[0, 1].map((row) => (
          <div role="row" key={row}>
            <div role="gridcell" data-cell="" data-row={row} data-col={0}>
              {`Рахунок ${String(row)}`}
            </div>
            <div role="gridcell" data-cell="" data-row={row} data-col={1}>
              <button type="button">{`Змінити ${String(row)}`}</button>
              <button type="button">{`Видалити ${String(row)}`}</button>
            </div>
          </div>
        ))}
      </div>
      <button type="button">Після гріда</button>
    </>
  )
}

beforeAll(() => {
  // jsdom не прокручує.
  Element.prototype.scrollIntoView = vi.fn()
  Element.prototype.scrollTo = vi.fn()
})

describe("useGridKeyboard", () => {
  it("одна зупинка Tab; клітинки фокусуються кліком", async () => {
    const user = userEvent.setup()
    render(<Grid />)
    await user.tab()
    await user.tab()
    expect(screen.getByRole("button", { name: "Номер" })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole("button", { name: "Після гріда" })).toHaveFocus()

    const cell = screen.getByText("Рахунок 1")
    expect(cell).toHaveAttribute("tabindex", "-1")
    await user.click(cell)
    expect(cell).toHaveFocus()
    await user.keyboard("{ArrowUp}")
    expect(screen.getByText("Рахунок 0")).toHaveFocus()
  })

  it("клітинка з кількома елементами: Enter — усередину, Tab між ними, Esc — назад", async () => {
    const user = userEvent.setup()
    render(<Grid />)
    await user.click(screen.getByText("Рахунок 0"))
    await user.keyboard("{ArrowRight}")
    const cell = screen.getByRole("button", { name: "Змінити 0" }).parentElement
    expect(cell).toHaveFocus()

    await user.keyboard("{Enter}")
    expect(screen.getByRole("button", { name: "Змінити 0" })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole("button", { name: "Видалити 0" })).toHaveFocus()

    await user.keyboard("{Escape}")
    expect(cell).toHaveFocus()
    expect(screen.getByRole("button", { name: "Змінити 0" })).toHaveAttribute(
      "tabindex",
      "-1",
    )
    // Знову одна зупинка: Tab із клітинки виходить із гріда.
    await user.tab()
    expect(screen.getByRole("button", { name: "Після гріда" })).toHaveFocus()
  })
})
