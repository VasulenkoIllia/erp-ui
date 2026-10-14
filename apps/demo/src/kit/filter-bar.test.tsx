import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { describe, expect, it } from "vitest"

import { FilterBar } from "@/registry/erp/filter-bar"
import type { ListFilter } from "@/registry/lib/list-state"

/** Значення ззовні — як адреса: «Стандартний» і «Назад» міняють його повз поле. */
function SearchHarness() {
  const [value, setValue] = useState<ListFilter>({})
  return (
    <>
      <FilterBar
        filters={[]}
        value={value}
        onValueChange={setValue}
        searchPlaceholder="Пошук"
      />
      <button
        type="button"
        onClick={() => {
          setValue({})
        }}
      >
        Стандартний
      </button>
      <button
        type="button"
        onClick={() => {
          setValue({ q: "abc" })
        }}
      >
        Назад
      </button>
      <output>{JSON.stringify(value)}</output>
    </>
  )
}

const pause = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

describe("erp/filter-bar — пошук", () => {
  it("«Назад» на той самий запит повертає його в поле й не стирає з адреси", async () => {
    const user = userEvent.setup()
    render(<SearchHarness />)
    const box = screen.getByRole("searchbox", { name: "Пошук" })
    await user.type(box, "abc")
    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent('{"q":"abc"}')
    })
    await user.click(screen.getByRole("button", { name: "Стандартний" }))
    expect(box).toHaveValue("")
    await user.click(screen.getByRole("button", { name: "Назад" }))
    expect(box).toHaveValue("abc")
    // Пауза пошуку минула: поле не застосувало порожній рядок замість «abc».
    await pause(400)
    expect(screen.getByRole("status")).toHaveTextContent('{"q":"abc"}')
  })
})
