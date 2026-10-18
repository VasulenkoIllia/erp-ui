import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  MultiSelect,
  type MultiSelectOption,
  type MultiSelectProps,
} from "@/registry/erp/multi-select"
import { ApiError } from "@/registry/lib/api"
import { Dialog, DialogContent, DialogTitle } from "@/registry/ui/dialog"

/** Крок 1.4b2 (ADR-0027): мультивибір із довідника (UI40). */

const OPTIONS: MultiSelectOption[] = [
  { value: "seg-key", label: "Ключові клієнти" },
  { value: "seg-vip", label: "VIP", description: "Особливі умови" },
  { value: "seg-new", label: "Нові" },
]

/** Ширина вікна для `useBreakpoint`: десктоп — усі `min-width` збігаються, телефон — жоден. */
function mockWindow(isDesktop: boolean) {
  vi.spyOn(window, "matchMedia").mockImplementation((query: string) => ({
    matches: isDesktop && query.includes("min-width"),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

afterEach(() => {
  vi.restoreAllMocks()
})

function renderSelect({
  initial = [],
  ...props
}: Partial<MultiSelectProps> & { initial?: readonly string[] } = {}) {
  const onValueChange = vi.fn()
  const onBlur = vi.fn()
  function Field() {
    const [value, setValue] = useState(initial)
    return (
      <>
        <label htmlFor="segments">Сегменти</label>
        <MultiSelect
          id="segments"
          options={OPTIONS}
          label="Сегменти"
          value={value}
          onValueChange={(next) => {
            onValueChange(next)
            setValue(next)
          }}
          onBlur={onBlur}
          {...props}
        />
      </>
    )
  }
  render(<Field />)
  return { onValueChange, onBlur }
}

const field = () => screen.getByRole("combobox", { name: "Сегменти" })

describe("MultiSelect: вибір кількох значень", () => {
  it("вибір і зняття в списку в порядку вибору; список відкритий; вихід із поля — коли список закрили", async () => {
    mockWindow(true)
    const { onValueChange, onBlur } = renderSelect()
    const user = userEvent.setup()
    expect(field()).toHaveTextContent("Виберіть…")

    await user.click(field())
    expect(onBlur).not.toHaveBeenCalled()
    await user.click(await screen.findByRole("option", { name: /^VIP/ }))
    await user.click(screen.getByRole("option", { name: "Ключові клієнти" }))
    expect(onValueChange).toHaveBeenLastCalledWith(["seg-vip", "seg-key"])
    expect(screen.getByRole("option", { name: /^VIP/ })).toHaveTextContent(
      "Особливі умови",
    )
    await user.click(screen.getByRole("option", { name: /^VIP/ }))
    expect(onValueChange).toHaveBeenLastCalledWith(["seg-key"])
    expect(screen.getByRole("status")).toHaveTextContent(
      "Знайдено 3 варіанти. Вибрано: 1",
    )

    await user.keyboard("{Escape}")
    expect(onBlur).toHaveBeenCalledTimes(1)
    expect(field()).toHaveTextContent("Ключові клієнти")
  })

  it("пошук за підписом без урахування регістру; нічого не знайдено", async () => {
    mockWindow(true)
    renderSelect()
    const user = userEvent.setup()
    await user.click(field())
    const search = await screen.findByRole("combobox", {
      name: "Пошук: Сегменти",
    })
    await user.type(search, "ключ")
    expect(screen.getAllByRole("option")).toHaveLength(1)
    await user.clear(search)
    await user.type(search, "zzz")
    expect(screen.queryAllByRole("option")).toHaveLength(0)
    expect(screen.getByRole("status")).toHaveTextContent(
      "За «zzz» нічого не знайдено",
    )
  })

  it("значення, якого немає в довіднику, — мітка з ключем і варіант угорі з поясненням", async () => {
    mockWindow(true)
    const { onValueChange } = renderSelect({ initial: ["seg-old", "seg-new"] })
    const user = userEvent.setup()
    expect(field()).toHaveTextContent("seg-oldНові")
    await user.click(field())
    const [first] = await screen.findAllByRole("option")
    expect(first).toHaveTextContent("seg-oldНемає в довіднику")
    await user.click(first)
    expect(onValueChange).toHaveBeenLastCalledWith(["seg-new"])
  })

  it("«Очистити» прибирає все, фокус — на полі", async () => {
    mockWindow(true)
    const { onValueChange } = renderSelect({
      initial: ["seg-key", "seg-vip"],
      clearable: true,
    })
    const user = userEvent.setup()
    await user.click(screen.getByRole("button", { name: "Очистити: Сегменти" }))
    expect(onValueChange).toHaveBeenLastCalledWith([])
    expect(field()).toHaveFocus()
    expect(
      screen.queryByRole("button", { name: "Очистити: Сегменти" }),
    ).not.toBeInTheDocument()
  })
})

describe("MultiSelect у діалозі форми", () => {
  function renderInDialog(options: MultiSelectProps["options"]) {
    const onDialogChange = vi.fn()
    render(
      <Dialog open onOpenChange={onDialogChange}>
        <DialogContent>
          <DialogTitle>Змінити організацію</DialogTitle>
          <label htmlFor="segments">Сегменти</label>
          <MultiSelect
            id="segments"
            options={options}
            label="Сегменти"
            value={[]}
            onValueChange={vi.fn()}
          />
        </DialogContent>
      </Dialog>,
    )
    return onDialogChange
  }

  it("Escape у списку без варіантів закриває лише список, а не форму", async () => {
    mockWindow(true)
    const onDialogChange = renderInDialog(OPTIONS)
    const user = userEvent.setup()
    await user.click(field())
    const search = await screen.findByRole("combobox", {
      name: "Пошук: Сегменти",
    })
    await user.type(search, "zzz")
    expect(screen.queryAllByRole("option")).toHaveLength(0)
    await user.keyboard("{Escape}")
    expect(onDialogChange).not.toHaveBeenCalled()
    expect(field()).toHaveAttribute("aria-expanded", "false")
  })

  it("Escape, поки довідник вантажиться, теж не закриває форму", async () => {
    mockWindow(true)
    const onDialogChange = renderInDialog(undefined)
    const user = userEvent.setup()
    await user.click(field())
    expect(await screen.findByRole("status")).toHaveTextContent("Завантаження…")
    // Escape — уже зі списку: фокус переходить у пошук, коли список відкрився.
    await waitFor(() => {
      expect(
        screen.getByRole("combobox", { name: "Пошук: Сегменти" }),
      ).toHaveFocus()
    })
    await user.keyboard("{Escape}")
    expect(onDialogChange).not.toHaveBeenCalled()
  })
})

describe("MultiSelect: стани", () => {
  it("довідник вантажиться: «Завантаження…» у полі й у списку", async () => {
    mockWindow(true)
    renderSelect({ options: undefined, initial: ["seg-key"] })
    const user = userEvent.setup()
    expect(field()).toHaveTextContent("Завантаження…")
    await user.click(field())
    expect(await screen.findByRole("status")).toHaveTextContent("Завантаження…")
  })

  it("довідник не завантажився: причина й «Спробувати ще»; офлайн — своя причина", async () => {
    mockWindow(true)
    const onRetry = vi.fn()
    renderSelect({
      options: undefined,
      error: new ApiError(0, { code: "offline", message: "offline" }),
      onRetry,
    })
    const user = userEvent.setup()
    await user.click(field())
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Немає з'єднання з сервером",
    )
    await user.click(screen.getByRole("button", { name: "Спробувати ще" }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it("довідник порожній", async () => {
    mockWindow(true)
    renderSelect({ options: [] })
    const user = userEvent.setup()
    await user.click(field())
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Довідник порожній",
    )
  })

  it("лише читання — текст у полі, що лишається у фокусі", () => {
    mockWindow(true)
    renderSelect({ initial: ["seg-vip", "seg-new"], readOnly: true })
    const readOnly = screen.getByRole("textbox", { name: "Сегменти" })
    expect(readOnly).toHaveValue("VIP, Нові")
    expect(readOnly).toHaveAttribute("readonly")
    expect(readOnly).toBeEnabled()
  })

  it("вимкнено — кнопка поля неактивна", () => {
    mockWindow(true)
    renderSelect({ initial: ["seg-vip"], disabled: true })
    expect(field()).toBeDisabled()
  })
})

describe("MultiSelect: телефон", () => {
  it("нижня шторка з назвою поля; вибір не закриває її, «Готово» закриває й виходить із поля", async () => {
    mockWindow(false)
    const { onValueChange, onBlur } = renderSelect()
    const user = userEvent.setup()
    await user.click(field())
    const sheet = screen.getByRole("dialog", { name: "Сегменти" })
    await user.click(within(sheet).getByRole("option", { name: "Нові" }))
    expect(onValueChange).toHaveBeenLastCalledWith(["seg-new"])
    expect(sheet).toBeInTheDocument()
    await user.click(within(sheet).getByRole("button", { name: "Готово" }))
    expect(onBlur).toHaveBeenCalledTimes(1)
    expect(field()).toHaveTextContent("Нові")
  })

  it("поворот екрана з відкритим списком: вигляд той самий до закриття, закриття — вихід із поля", async () => {
    let isDesktop = true
    const listeners: EventListener[] = []
    vi.spyOn(window, "matchMedia").mockImplementation((query: string) => ({
      get matches() {
        return isDesktop && query.includes("min-width")
      },
      media: query,
      onchange: null,
      addEventListener: (_type: string, listener: EventListener) => {
        listeners.push(listener)
      },
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
    const { onBlur } = renderSelect()
    const user = userEvent.setup()
    await user.click(field())
    const search = await screen.findByRole("combobox", {
      name: "Пошук: Сегменти",
    })
    act(() => {
      isDesktop = false
      for (const listener of listeners) listener(new Event("change"))
    })
    // Шторка — з «Готово»; список поверх сторінки лишився відкритим.
    expect(search).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "Готово" }),
    ).not.toBeInTheDocument()
    await user.keyboard("{Escape}")
    expect(onBlur).toHaveBeenCalledTimes(1)
    // Закрите поле — уже в телефонному вигляді: список відкривається шторкою.
    await user.click(field())
    expect(screen.getByRole("button", { name: "Готово" })).toBeInTheDocument()
  })
})
