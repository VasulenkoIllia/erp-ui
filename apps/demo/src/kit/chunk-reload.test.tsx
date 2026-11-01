import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ErrorBoundary, ReloadPageAction } from "@/registry/erp/error-boundary"
import { ChunkLoadError } from "@/registry/lib/lazy"
import {
  hasUnsavedChanges,
  holdUnsavedChanges,
  isPageReloading,
  reloadDidNotHelp,
  reloadPage,
} from "@/registry/lib/page-reload"

const ADDRESS = "https://app.example/#/invoices"
const MINUTE_MS = 60_000

const FailedChunk = (): never => {
  throw new ChunkLoadError(new Error("404"), () => undefined)
}
const BrokenRender = (): never => {
  throw new Error("render")
}

const reloadButton = () =>
  screen.queryByRole("button", { name: "Оновити сторінку" })
const retryButton = () =>
  screen.queryByRole("button", { name: "Спробувати ще" })

describe("оновлення сторінки після збою чанка (ADR-0055)", () => {
  const reload = vi.fn()
  let isOnline = true

  beforeEach(() => {
    isOnline = true
    reload.mockClear()
    sessionStorage.clear()
    vi.stubGlobal("location", { href: ADDRESS, reload })
    vi.spyOn(navigator, "onLine", "get").mockImplementation(() => isOnline)
    // React пише перехоплену помилку в консоль — у тесті це шум.
    vi.spyOn(console, "error").mockImplementation(() => undefined)
  })

  afterEach(() => {
    window.dispatchEvent(new Event("beforeunload"))
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("збій чанка: свій текст, «Оновити сторінку» й повтор; кнопка оновлює одразу", async () => {
    render(
      <ErrorBoundary>
        <FailedChunk />
      </ErrorBoundary>,
    )
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Потрібно оновити сторінку",
    )
    expect(retryButton()).toBeVisible()
    await userEvent.click(reloadButton() as HTMLElement)
    expect(reload).toHaveBeenCalledOnce()
  })

  it("помилка рендеру: оновлення не пропонуємо", () => {
    render(
      <ErrorBoundary>
        <BrokenRender />
      </ErrorBoundary>,
    )
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Не вдалося завантажити дані",
    )
    expect(reloadButton()).toBeNull()
  })

  it("без мережі: стан офлайн без оновлення, бо сторінка б не відкрилась", () => {
    isOnline = false
    render(
      <ErrorBoundary>
        <FailedChunk />
      </ErrorBoundary>,
    )
    expect(screen.getByRole("alert")).toHaveTextContent("Немає з'єднання")
    expect(reloadButton()).toBeNull()
  })

  it("оновлення щойно не допомогло: кнопки немає, чесний текст, повтор лишається", () => {
    reloadPage()
    render(
      <ErrorBoundary>
        <FailedChunk />
      </ErrorBoundary>,
    )
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Оновлення не допомогло",
    )
    expect(reloadButton()).toBeNull()
    expect(retryButton()).toBeVisible()
  })

  it("мітка діє лише для тієї самої адреси й лише хвилину", () => {
    vi.useFakeTimers({ now: new Date(2026, 10, 1, 12) })
    reloadPage()
    expect(reloadDidNotHelp()).toBe(true)
    vi.stubGlobal("location", { href: `${ADDRESS}/2`, reload })
    expect(reloadDidNotHelp()).toBe(false)
    vi.stubGlobal("location", { href: ADDRESS, reload })
    vi.setSystemTime(Date.now() + MINUTE_MS)
    expect(reloadDidNotHelp()).toBe(false)
  })

  it("сховище недоступне: кнопка лишається, оновлення працює", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied")
    })
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied")
    })
    render(
      <ErrorBoundary>
        <FailedChunk />
      </ErrorBoundary>,
    )
    await userEvent.click(reloadButton() as HTMLElement)
    expect(reload).toHaveBeenCalledOnce()
    expect(reloadDidNotHelp()).toBe(false)
  })

  it("зіпсована мітка не ламає межу", () => {
    sessionStorage.setItem("erp-ui:page-reload", "{")
    expect(reloadDidNotHelp()).toBe(false)
    sessionStorage.setItem("erp-ui:page-reload", '{"at":"0"}')
    expect(reloadDidNotHelp()).toBe(false)
  })

  it("незбережені зміни: спершу питає на місці, відмова повертає фокус", async () => {
    const release = holdUnsavedChanges()
    render(
      <ErrorBoundary>
        <FailedChunk />
      </ErrorBoundary>,
    )
    await userEvent.click(reloadButton() as HTMLElement)
    expect(reload).not.toHaveBeenCalled()
    const keep = screen.getByRole("button", { name: "Не оновлювати" })
    expect(keep).toHaveFocus()
    expect(keep).toHaveAccessibleDescription(/незбережені зміни/i)

    await userEvent.click(keep)
    expect(reloadButton()).toHaveFocus()

    await userEvent.click(reloadButton() as HTMLElement)
    await userEvent.click(
      screen.getByRole("button", { name: "Усе одно оновити" }),
    )
    expect(reload).toHaveBeenCalledOnce()
    release()
  })

  it("захисти рахуються: зміни є, поки живий хоч один", () => {
    const first = holdUnsavedChanges()
    const second = holdUnsavedChanges()
    first()
    expect(hasUnsavedChanges()).toBe(true)
    second()
    expect(hasUnsavedChanges()).toBe(false)
  })

  it("мітка підтвердженого оновлення живе до першого beforeunload", () => {
    reloadPage()
    expect(isPageReloading()).toBe(true)
    window.dispatchEvent(new Event("beforeunload"))
    expect(isPageReloading()).toBe(false)
  })

  it("ReloadPageAction у власному fallback теж ховається після марного оновлення", () => {
    reloadPage()
    render(<ReloadPageAction />)
    expect(reloadButton()).toBeNull()
  })
})
