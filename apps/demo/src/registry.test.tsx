import { act, render, renderHook, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { useResolvedTheme } from "@/registry/hooks/use-resolved-theme"
import { cn } from "@/registry/lib/utils"
import { Badge } from "@/registry/ui/badge"
import { Button } from "@/registry/ui/button"
import { Spinner } from "@/registry/ui/spinner"

describe("cn реєстру", () => {
  it("зливає утиліти щільності з класами шкали", () => {
    expect(cn("h-control w-full", "h-10")).toBe("w-full h-10")
    expect(cn("h-8", "h-control")).toBe("h-control")
    expect(cn("size-control", "size-6")).toBe("size-6")
    expect(cn("h-row border-b", "h-12")).toBe("border-b h-12")
  })

  it("className перемагає позицію з базових класів", () => {
    expect(cn("touch-target relative", "absolute top-2")).toBe(
      "touch-target absolute top-2",
    )
  })
})

describe("примітиви", () => {
  it("кнопка бере висоту з токена щільності й має зону натиску", () => {
    render(<Button>Зберегти</Button>)
    const button = screen.getByRole("button", { name: "Зберегти" })
    expect(button).toHaveClass("h-control", "touch-target")
  })

  it("статусні бейджі — soft-тло й *-foreground", () => {
    render(<Badge variant="warning">Частково</Badge>)
    expect(screen.getByText("Частково")).toHaveClass(
      "bg-warning-soft",
      "text-warning-foreground",
    )
  })

  it("спінер має український підпис за замовчуванням", () => {
    render(<Spinner />)
    expect(
      screen.getByRole("status", { name: "Завантаження" }),
    ).toBeInTheDocument()
  })
})

describe("useResolvedTheme", () => {
  it("стежить за класом dark на <html>", async () => {
    const { result } = renderHook(() => useResolvedTheme())
    expect(result.current).toBe("light")
    await act(async () => {
      document.documentElement.classList.add("dark")
      await Promise.resolve()
    })
    expect(result.current).toBe("dark")
    document.documentElement.classList.remove("dark")
  })
})
