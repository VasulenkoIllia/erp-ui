import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeAll, describe, expect, it, vi } from "vitest"

import {
  RichTextField,
  preloadRichTextEditor,
} from "@/registry/erp/rich-text-field"

import { NOTE } from "@/data/rich-text"

/** Сам чанк, що не завантажився, перевіряє e2e: тут — стан поля після збою. Окремий файл через мок. */
vi.mock("@/registry/erp/rich-text-editor", () => ({
  RichTextEditor: () => {
    throw new Error("editor failed")
  },
}))

beforeAll(preloadRichTextEditor, 30_000)

describe("RichTextField: збій редактора", () => {
  it("видно текст і повтор, а не порожнє поле", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    render(<RichTextField aria-label="Нотатка" value={NOTE} />)
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Не вдалося завантажити редактор",
    )
    expect(screen.getByText("погодив")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Спробувати ще" }))
    expect(await screen.findByRole("alert")).toBeInTheDocument()
  })
})
