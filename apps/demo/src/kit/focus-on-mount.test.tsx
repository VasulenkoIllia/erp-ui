import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { PageState } from "@/registry/erp/page-state"

/**
 * Крок A2a: стан замість сторінки бере фокус, коли фокус загубився разом зі зниклим вмістом
 * (`useFocusHeadingOnMount`, WCAG 2.4.3). Окремий файл: перший екран сесії — на початку файлу.
 */

function Screen({ failed }: { failed: boolean }) {
  return failed ? (
    <PageState kind="error" headingLevel={1} onRetry={() => undefined} />
  ) : (
    <button type="button">Зберегти</button>
  )
}

describe("useFocusHeadingOnMount через PageState", () => {
  it("перший екран не чіпає; далі h1 стану бере фокус, лише коли фокус загубився", () => {
    // Перший екран сесії — стан помилки одразу: фокус не рухаємо.
    const first = render(<Screen failed />)
    const heading = () =>
      screen.getByRole("heading", {
        level: 1,
        name: "Не вдалося завантажити дані",
      })
    expect(heading()).not.toHaveFocus()
    expect(heading()).toHaveAttribute("tabindex", "-1")
    first.unmount()

    // Кнопка у фокусі зникла разом із вмістом — фокус на h1 стану.
    const view = render(<Screen failed={false} />)
    screen.getByRole("button", { name: "Зберегти" }).focus()
    view.rerender(<Screen failed />)
    expect(heading()).toHaveFocus()
    view.unmount()

    // Людина у фокусі деінде — стан фокус не забирає.
    const elsewhere = render(
      <>
        <input aria-label="Пошук" />
        <Screen failed={false} />
      </>,
    )
    screen.getByRole("textbox", { name: "Пошук" }).focus()
    elsewhere.rerender(
      <>
        <input aria-label="Пошук" />
        <Screen failed />
      </>,
    )
    expect(screen.getByRole("textbox", { name: "Пошук" })).toHaveFocus()
    elsewhere.unmount()
  })

  it("стан частини сторінки (h2) фокус не бере й зупинкою не стає; focusHeading — бере", () => {
    const view = render(<button type="button">Зберегти</button>)
    screen.getByRole("button", { name: "Зберегти" }).focus()
    view.rerender(<PageState kind="empty" />)
    const heading = screen.getByRole("heading", { level: 2 })
    expect(heading).not.toHaveFocus()
    expect(heading).not.toHaveAttribute("tabindex")
    view.unmount()

    const focused = render(<button type="button">Зберегти</button>)
    screen.getByRole("button", { name: "Зберегти" }).focus()
    focused.rerender(<PageState kind="empty" focusHeading />)
    expect(screen.getByRole("heading", { level: 2 })).toHaveFocus()
  })
})
