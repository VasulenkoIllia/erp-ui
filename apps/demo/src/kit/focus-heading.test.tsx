import { act, render, screen } from "@testing-library/react"
import { StrictMode, useRef, useState } from "react"
import { describe, expect, it } from "vitest"

import { useFocusHeadingOnNavigation } from "@/registry/hooks/use-focus-heading"

/** Крок 1.2: фокус на h1 після переходу (hooks/use-focus-heading). */

function FocusPage({ ready }: { ready: boolean }) {
  const [location, setLocation] = useState("/a")
  const heading = useRef<HTMLHeadingElement>(null)
  useFocusHeadingOnNavigation(heading, location, ready)
  return (
    <>
      <h1 ref={heading} tabIndex={-1}>
        {location}
      </h1>
      <button
        type="button"
        onClick={() => {
          setLocation("/b")
        }}
      >
        Далі
      </button>
      <input aria-label="Пошук" />
    </>
  )
}

describe("useFocusHeadingOnNavigation", () => {
  it("перший екран не чіпає; після переходу — на h1, один раз і лише коли заголовок є", () => {
    // StrictMode запускає ефекти двічі — перший екран так само не чіпається.
    const page = (ready: boolean) => (
      <StrictMode>
        <FocusPage ready={ready} />
      </StrictMode>
    )
    const view = render(page(true))
    const heading = screen.getByRole("heading", { level: 1 })
    expect(heading).not.toHaveFocus()

    const next = screen.getByRole("button", { name: "Далі" })
    next.focus()
    view.rerender(page(false))
    act(() => {
      next.click()
    })
    expect(heading).not.toHaveFocus()
    view.rerender(page(true))
    expect(heading).toHaveFocus()

    // Повторне `ready` на тій самій адресі фокус не забирає.
    const search = screen.getByRole("textbox", { name: "Пошук" })
    search.focus()
    view.rerender(page(false))
    view.rerender(page(true))
    expect(search).toHaveFocus()
  })

  it("людина пішла деінде, поки вантажилось, — фокус лишається в неї", () => {
    const view = render(<FocusPage ready={false} />)
    const next = screen.getByRole("button", { name: "Далі" })
    next.focus()
    act(() => {
      next.click()
    })
    screen.getByRole("textbox", { name: "Пошук" }).focus()
    view.rerender(<FocusPage ready />)
    expect(screen.getByRole("textbox", { name: "Пошук" })).toHaveFocus()
  })
})
