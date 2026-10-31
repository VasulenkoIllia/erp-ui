import * as React from "react"

import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { FileDrop, matchesAccept } from "@/registry/erp/file-drop"

const csv = new File(["a"], "дані.csv", { type: "text/csv" })
const png = new File(["a"], "фото.png", { type: "image/png" })

function renderDrop(props: Partial<Parameters<typeof FileDrop>[0]> = {}) {
  const onFileChange = vi.fn()
  render(
    <FileDrop
      label="Файл"
      file={null}
      accept=".csv,text/csv"
      onFileChange={onFileChange}
      {...props}
    />,
  )
  return { onFileChange, zone: screen.getByRole("group", { name: "Файл" }) }
}

describe("matchesAccept", () => {
  it("за розширенням, типом і маскою", () => {
    expect(matchesAccept(csv, ".CSV")).toBe(true)
    expect(matchesAccept(csv, "text/csv")).toBe(true)
    expect(matchesAccept(png, "image/*")).toBe(true)
    expect(matchesAccept(png, ".csv, text/csv")).toBe(false)
  })
})

describe("FileDrop", () => {
  it("приймає файл кнопкою", async () => {
    const { onFileChange } = renderDrop()
    await userEvent.upload(screen.getByTestId("file-drop-input"), csv)
    expect(onFileChange).toHaveBeenCalledWith(csv)
  })

  it("приймає перетягнутий файл і показує, що тягнуть над полем", () => {
    const { onFileChange, zone } = renderDrop()
    fireEvent.dragOver(zone)
    expect(zone).toHaveAttribute("data-dragging")
    fireEvent.drop(zone, { dataTransfer: { files: [csv] } })
    expect(zone).not.toHaveAttribute("data-dragging")
    expect(onFileChange).toHaveBeenCalledWith(csv)
  })

  it("не приймає чужий тип: помилка біля поля", () => {
    const { onFileChange, zone } = renderDrop()
    fireEvent.drop(zone, { dataTransfer: { files: [png] } })
    expect(onFileChange).not.toHaveBeenCalled()
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Цей тип файла не підходить",
    )
    expect(zone).toHaveAccessibleDescription("Цей тип файла не підходить")
  })

  it("не приймає завеликий файл і каже межу", () => {
    const { onFileChange, zone } = renderDrop({ maxBytes: 0 })
    fireEvent.drop(zone, { dataTransfer: { files: [csv] } })
    expect(onFileChange).not.toHaveBeenCalled()
    expect(screen.getByRole("alert")).toHaveTextContent("Файл завеликий")
  })

  it("наступний вдалий вибір знімає помилку", () => {
    const { zone } = renderDrop()
    fireEvent.drop(zone, { dataTransfer: { files: [png] } })
    fireEvent.drop(zone, { dataTransfer: { files: [csv] } })
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })

  it("вимкнене поле не приймає перетягнутий файл", () => {
    const { onFileChange, zone } = renderDrop({ disabled: true })
    fireEvent.drop(zone, { dataTransfer: { files: [csv] } })
    expect(onFileChange).not.toHaveBeenCalled()
  })

  it("«Прибрати» повертає фокус на вибір файла", async () => {
    function Host() {
      const [file, setFile] = React.useState<File | null>(csv)
      return <FileDrop label="Файл" file={file} onFileChange={setFile} />
    }
    render(<Host />)
    await userEvent.click(
      screen.getByRole("button", { name: "Прибрати файл дані.csv" }),
    )
    const choose = screen.getByRole("button", { name: "Вибрати файл" })
    await waitFor(() => {
      expect(choose).toHaveFocus()
    })
  })
})
