import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { I18nextProvider } from "react-i18next"
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"

import { PrintButton } from "@/registry/erp/print-button"
import { PrintDocumentTitle } from "@/registry/erp/print-document"
import { PrintPreview } from "@/registry/erp/print-preview"
import { createI18n } from "@/registry/lib/i18n"
import { printFileName, printPage, usePrintTitle } from "@/registry/lib/print"

/**
 * Крок PF08a (ADR-0062): друк — назва файла, очікування зображень аркуша, заголовок сторінки на час
 * друку, скасування; перегляд A4 зі станами SPEC §8 і мова аркуша окремо від інтерфейсу. Блоки аркуша —
 * `print-sheet.test.tsx`.
 */

const print = vi.fn()

beforeAll(() => {
  // jsdom не має шрифтів сторінки й декодування зображень.
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: { ready: Promise.resolve() },
  })
  HTMLImageElement.prototype.decode = () => Promise.resolve()
})

beforeEach(() => {
  print.mockReset()
  window.print = print
  document.title = "Демо"
})

afterEach(() => {
  vi.useRealTimers()
})

describe("lib/print", () => {
  it("назва файла без символів, яких не буває в назві файла", () => {
    expect(printFileName('Рахунок № 2026/0001: "ТОВ"')).toBe(
      "Рахунок № 2026-0001- -ТОВ-",
    )
  })

  it("друк чекає зображень аркуша, а на час друку заголовок — назва документа", async () => {
    let decoded = false
    const image = document.createElement("img")
    image.decode = () =>
      new Promise((resolve) => {
        setTimeout(() => {
          decoded = true
          resolve()
        }, 10)
      })
    document.body.append(image)
    print.mockImplementation(() => {
      expect(decoded).toBe(true)
      expect(document.title).toBe("Рахунок № 2026-0001")
    })
    await printPage({ title: "Рахунок № 2026/0001" })
    expect(print).toHaveBeenCalledOnce()
    window.dispatchEvent(new Event("afterprint"))
    expect(document.title).toBe("Демо")
    image.remove()
  })

  it("зіпсоване зображення не зупиняє друк, а зависле — не довше тайм-ауту", async () => {
    vi.useFakeTimers()
    const broken = document.createElement("img")
    broken.decode = () => Promise.reject(new Error("broken"))
    const hanging = document.createElement("img")
    hanging.decode = () => new Promise(() => undefined)
    document.body.append(broken, hanging)
    const done = printPage({ timeoutMs: 100 })
    await vi.advanceTimersByTimeAsync(100)
    await done
    expect(print).toHaveBeenCalledOnce()
    broken.remove()
    hanging.remove()
  })

  it("друк з меню браузера теж бере назву документа", () => {
    const { unmount } = renderHook(() => {
      usePrintTitle("Рахунок № 7")
    })
    window.dispatchEvent(new Event("beforeprint"))
    expect(document.title).toBe("Рахунок № 7")
    window.dispatchEvent(new Event("afterprint"))
    expect(document.title).toBe("Демо")
    window.dispatchEvent(new Event("beforeprint"))
    unmount()
    expect(document.title).toBe("Демо")
  })

  it("друк без `afterprint` двічі поспіль: заголовок сторінки все одно повертається початковий", async () => {
    await printPage({ title: "Рахунок 1" })
    await printPage({ title: "Рахунок 2" })
    expect(document.title).toBe("Рахунок 2")
    window.dispatchEvent(new Event("afterprint"))
    expect(document.title).toBe("Демо")
  })

  it("чекає лише зображень аркуша: зависле зображення поза ним друк не тримає", async () => {
    vi.useFakeTimers()
    const sheet = document.createElement("div")
    sheet.setAttribute("data-print-root", "")
    const outside = document.createElement("img")
    outside.decode = () => new Promise(() => undefined)
    document.body.append(sheet, outside)
    const done = printPage()
    await vi.advanceTimersByTimeAsync(0)
    expect(print).toHaveBeenCalledOnce()
    await done
    sheet.remove()
    outside.remove()
  })

  it("без Font Loading API (старий WebView) друк не падає", async () => {
    const fonts = Object.getOwnPropertyDescriptor(document, "fonts")
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: undefined,
    })
    try {
      await printPage({ title: "Рахунок 1" })
      expect(print).toHaveBeenCalledOnce()
    } finally {
      if (fonts) Object.defineProperty(document, "fonts", fonts)
      window.dispatchEvent(new Event("afterprint"))
    }
  })

  it("кнопку прибрали, поки чекали зображень: діалог друку не відкривається", async () => {
    vi.useFakeTimers()
    const hanging = document.createElement("img")
    hanging.decode = () => new Promise(() => undefined)
    document.body.append(hanging)
    const { unmount } = render(<PrintButton title="Рахунок 1" />)
    fireEvent.click(screen.getByRole("button", { name: "Друкувати" }))
    unmount()
    await act(() => vi.advanceTimersByTimeAsync(3000))
    expect(print).not.toHaveBeenCalled()
    expect(document.title).toBe("Демо")
    hanging.remove()
  })
})

describe("PrintPreview", () => {
  it("аркуш світлий, мовою документа, друкується лише він; кнопка друкує з назвою документа", async () => {
    const user = userEvent.setup()
    print.mockImplementation(() => {
      expect(document.title).toBe("Рахунок 1")
    })
    render(
      <PrintPreview title="Рахунок 1">
        <p>Вміст</p>
      </PrintPreview>,
    )
    const sheet = screen.getByText("Вміст").closest("[data-print-root]")
    expect(sheet).toHaveAttribute("data-theme", "light")
    expect(sheet).toHaveAttribute("lang", "uk")
    await user.click(screen.getByRole("button", { name: "Друкувати" }))
    expect(print).toHaveBeenCalledOnce()
  })

  it("завантаження: скелет аркуша й «Друкувати» недоступна з поясненням", () => {
    render(
      <PrintPreview title="Рахунок 1" state="loading">
        <p>Вміст</p>
      </PrintPreview>,
    )
    expect(
      screen.getByRole("status", { name: "Завантажуємо аркуш" }),
    ).toBeInTheDocument()
    const button = screen.getByRole("button", { name: "Друкувати" })
    expect(button).toHaveAttribute("aria-disabled", "true")
    expect(button).toHaveAccessibleDescription("Аркуш ще завантажується")
    expect(screen.queryByText("Вміст")).toBeNull()
  })

  it("помилка: стан сторінки з повтором замість аркуша, без кнопки друку", async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    render(
      <PrintPreview title="Рахунок 1" state="error" onRetry={onRetry}>
        <p>Вміст</p>
      </PrintPreview>,
    )
    expect(screen.queryByRole("button", { name: "Друкувати" })).toBeNull()
    await user.click(screen.getByRole("button", { name: /Спробувати ще/ }))
    expect(onRetry).toHaveBeenCalledOnce()
    expect(document.querySelector("[data-print-root]")).toBeNull()
  })

  it.each(["forbidden", "offline", "not-found"] as const)(
    "стан %s замість аркуша",
    (state) => {
      render(
        <PrintPreview title="Рахунок 1" state={state}>
          <p>Вміст</p>
        </PrintPreview>,
      )
      expect(
        document.querySelector('[data-slot="page-state"]'),
      ).toHaveAttribute("data-kind", state)
      expect(screen.queryByText("Вміст")).toBeNull()
    },
  )

  it("англійський аркуш в українському інтерфейсі: спершу довантажує англійську", async () => {
    render(
      <PrintPreview title="Invoice 1" language="en">
        <PrintDocumentTitle title="Invoice" number="1" date="2026-11-04" />
      </PrintPreview>,
    )
    expect(
      screen.getByRole("status", { name: "Завантажуємо аркуш" }),
    ).toBeInTheDocument()
    const heading = await screen.findByRole("heading", { level: 2 })
    expect(heading).toHaveTextContent("Invoice No. 1 dated 4 November 2026")
    expect(heading.closest("[data-print-root]")).toHaveAttribute("lang", "en")
    // Інтерфейс перегляду лишається українським.
    expect(
      screen.getByRole("button", { name: "Справжній розмір" }),
    ).toBeInTheDocument()
  })

  it("англійський аркуш і в StrictMode: повторне довантаження мови не лишає аркуш українським", async () => {
    render(
      <PrintPreview title="Invoice 1" language="en">
        <PrintDocumentTitle title="Invoice" number="1" date="2026-11-04" />
      </PrintPreview>,
      { reactStrictMode: true },
    )
    expect(await screen.findByRole("heading", { level: 2 })).toHaveTextContent(
      "Invoice No. 1 dated 4 November 2026",
    )
  })

  it("англійська не довантажилась: аркуш запасною українською, і `lang` теж", async () => {
    const i18n = createI18n({
      resources: { en: () => Promise.reject(new Error("offline")) },
    })
    render(
      <I18nextProvider i18n={i18n}>
        <PrintPreview title="Рахунок 1" language="en">
          <PrintDocumentTitle title="Рахунок" number="1" date="2026-11-04" />
        </PrintPreview>
      </I18nextProvider>,
    )
    const heading = await screen.findByRole(
      "heading",
      { level: 2 },
      { timeout: 3000 },
    )
    expect(heading).toHaveTextContent("Рахунок № 1 від 4 листопада 2026")
    expect(heading.closest("[data-print-root]")).toHaveAttribute("lang", "uk")
  })

  it("«Справжній розмір» — область прокрутки з клавіатури", async () => {
    const user = userEvent.setup()
    render(
      <PrintPreview title="Рахунок 1">
        <p>Вміст</p>
      </PrintPreview>,
    )
    const toggle = screen.getByRole("button", { name: "Справжній розмір" })
    expect(toggle).toHaveAttribute("aria-pressed", "false")
    await user.click(toggle)
    expect(toggle).toHaveAttribute("aria-pressed", "true")
    expect(
      screen.getByRole("region", { name: "Аркуш для друку" }),
    ).toHaveAttribute("tabindex", "0")
  })
})
