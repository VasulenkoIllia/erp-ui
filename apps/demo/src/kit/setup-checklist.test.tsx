import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  SetupChecklist,
  type SetupChecklistItem,
  type SetupChecklistProps,
} from "@/registry/erp/setup-checklist"

const ITEMS: SetupChecklistItem[] = [
  {
    id: "requisites",
    label: "Реквізити",
    done: false,
    href: "/company",
    actionLabel: "Заповнити",
  },
  {
    id: "logo",
    label: "Логотип",
    description: "Для документів",
    done: false,
    href: "/company?tab=images",
    actionLabel: "Завантажити",
    optional: true,
  },
  {
    id: "team",
    label: "Колеги",
    done: true,
    href: "/setup",
    actionLabel: "Запросити",
    optional: true,
  },
]

const STORAGE_KEY = "erp-ui:setup-dismissed:c1"

const show = (props: Partial<SetupChecklistProps> = {}) =>
  render(
    <MemoryRouter>
      <SetupChecklist scope="c1" items={ITEMS} {...props} />
    </MemoryRouter>,
  )

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe("SetupChecklist", () => {
  it("показує, що зроблено, а що чекає", () => {
    show()
    expect(screen.getByRole("heading", { name: "Почніть роботу" })).toBeTruthy()
    expect(screen.getByText("Зроблено 1 з 3")).toBeTruthy()
    expect(
      screen.getByRole("link", { name: "Заповнити: Реквізити" }),
    ).toBeTruthy()
    expect(screen.getByText("Для документів")).toBeTruthy()
    // Зроблений пункт уже без дій.
    expect(screen.queryByRole("link", { name: /Запросити/ })).toBeNull()
  })

  it("обов'язковий пункт відхилити не можна", () => {
    show()
    expect(
      screen.queryByRole("button", { name: "Не потрібно: Реквізити" }),
    ).toBeNull()
  })

  it("«Не потрібно» рахується, лишається в браузері й повертається", async () => {
    const user = userEvent.setup()
    const { unmount } = show()
    await user.click(
      screen.getByRole("button", { name: "Не потрібно: Логотип" }),
    )
    expect(screen.getByText("Зроблено 2 з 3")).toBeTruthy()
    expect(
      screen.queryByRole("link", { name: "Завантажити: Логотип" }),
    ).toBeNull()
    expect(localStorage.getItem(STORAGE_KEY)).toBe('["logo"]')
    unmount()

    show()
    expect(screen.getByText("Зроблено 2 з 3")).toBeTruthy()
    await user.click(screen.getByRole("button", { name: "Повернути: Логотип" }))
    expect(screen.getByText("Зроблено 1 з 3")).toBeTruthy()
    expect(localStorage.getItem(STORAGE_KEY)).toBe("[]")
  })

  it("вибір однієї компанії не діє на іншу", () => {
    localStorage.setItem(STORAGE_KEY, '["logo"]')
    show({ scope: "c2" })
    expect(screen.getByText("Зроблено 1 з 3")).toBeTruthy()
  })

  it("останній відхилений пункт закриває чек-лист і переводить фокус на повідомлення", async () => {
    const user = userEvent.setup()
    const items = ITEMS.map((item) =>
      item.id === "requisites" ? { ...item, done: true } : item,
    )
    show({ items })
    await user.click(
      screen.getByRole("button", { name: "Не потрібно: Логотип" }),
    )
    expect(screen.queryByRole("heading")).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole("status"))
    expect(screen.getByRole("status").textContent).toBe("Усе налаштовано")
  })

  it("усе зроблено ще до показу: нічого немає", () => {
    const { container } = show({
      items: ITEMS.map((item) => ({ ...item, done: true })),
    })
    expect(container.textContent).toBe("")
  })

  it("завантаження й помилка всередині картки, а не порожньо", async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    const { rerender } = show({ items: [], isPending: true })
    expect(screen.getByRole("heading", { name: "Почніть роботу" })).toBeTruthy()
    rerender(
      <MemoryRouter>
        <SetupChecklist
          scope="c1"
          items={[]}
          error={new Error("Збій")}
          onRetry={onRetry}
        />
      </MemoryRouter>,
    )
    const section = screen.getByRole("region", { name: "Почніть роботу" })
    await user.click(
      within(section).getByRole("button", { name: "Спробувати ще" }),
    )
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it("запит без мережі лишається в очікуванні: помилка важливіша за завантаження", () => {
    show({
      items: [],
      isPending: true,
      error: new Error("Збій"),
      onRetry: vi.fn(),
    })
    expect(screen.getByRole("button", { name: "Спробувати ще" })).toBeTruthy()
  })

  it("обов'язковий пункт зі старого запису в браузері не рахується відхиленим", () => {
    localStorage.setItem(STORAGE_KEY, '["requisites"]')
    show()
    expect(screen.getByText("Зроблено 1 з 3")).toBeTruthy()
    expect(
      screen.getByRole("link", { name: "Заповнити: Реквізити" }),
    ).toBeTruthy()
  })

  it("повідомлення про завершення зникає, коли чек-лист відкрився знову, і фокус потім не стрибає", async () => {
    const user = userEvent.setup()
    const items = ITEMS.map((item) =>
      item.id === "requisites" ? { ...item, done: true } : item,
    )
    const view = (shown: SetupChecklistItem[]) => (
      <MemoryRouter>
        <SetupChecklist scope="c1" items={shown} />
      </MemoryRouter>
    )
    const { rerender } = render(view(items))
    await user.click(
      screen.getByRole("button", { name: "Не потрібно: Логотип" }),
    )
    expect(screen.getByRole("status")).toBeTruthy()
    // Людина прибрала логотип із профілю в іншій вкладці: новий обов'язковий пункт відкрив список.
    rerender(view(ITEMS))
    expect(screen.getByRole("heading", { name: "Почніть роботу" })).toBeTruthy()
    expect(screen.queryByRole("status")).toBeNull()
    // Закрився сам, без дії людини: повідомлення немає, бо фокус забирати нема за що.
    rerender(view(ITEMS.map((item) => ({ ...item, done: true }))))
    expect(screen.queryByRole("status")).toBeNull()
  })

  it("сховище недоступне: вибір діє на екрані, збою немає", async () => {
    const user = userEvent.setup()
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied")
    })
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied")
    })
    show()
    await user.click(
      screen.getByRole("button", { name: "Не потрібно: Логотип" }),
    )
    expect(screen.getByText("Зроблено 2 з 3")).toBeTruthy()
  })

  it("пошкоджений запис у сховищі не ламає чек-лист", () => {
    localStorage.setItem(STORAGE_KEY, "{oops")
    show()
    expect(screen.getByText("Зроблено 1 з 3")).toBeTruthy()
  })
})
