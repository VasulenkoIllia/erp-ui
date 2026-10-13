import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"

import { APPEARANCE_STORAGE_KEY as STORAGE_KEY } from "@/registry/lib/appearance"
import { AppearanceControls } from "./AppearanceControls"

describe("AppearanceControls", () => {
  it("має підписані групи для всіх чотирьох налаштувань", () => {
    render(<AppearanceControls />)
    for (const name of ["Палітра", "Тема", "Щільність", "Сайдбар"]) {
      expect(screen.getByRole("group", { name })).toBeInTheDocument()
    }
    expect(screen.getAllByRole("radio")).toHaveLength(5 + 3 + 2 + 2)
  })

  it("перемикає атрибути на <html> і зберігає вибір", async () => {
    const user = userEvent.setup()
    render(<AppearanceControls />)
    const root = document.documentElement

    await user.click(screen.getByRole("radio", { name: "Графіт" }))
    await user.click(screen.getByRole("radio", { name: "Темна" }))
    await user.click(screen.getByRole("radio", { name: "Компактна" }))
    await user.click(screen.getByRole("radio", { name: "Темний" }))

    expect(root.dataset.palette).toBe("graphite")
    expect(root.classList.contains("dark")).toBe(true)
    expect(root.dataset.density).toBe("compact")
    expect(root.dataset.sidebar).toBe("dark")
    expect(screen.getByRole("radio", { name: "Графіт" })).toBeChecked()
    // Зберігається лише обране користувачем (мова лишилася типовою).
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}")).toEqual({
      palette: "graphite",
      theme: "dark",
      density: "compact",
      sidebar: "dark",
    })
  })
})
