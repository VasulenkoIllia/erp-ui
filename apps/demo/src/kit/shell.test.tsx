import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { FileText, Users } from "lucide-react"
import { describe, expect, it, vi } from "vitest"

import { AppShell, type NavGroup } from "@/registry/erp/app-shell"
import { PageState } from "@/registry/erp/page-state"
import { initials, UserMenu } from "@/registry/erp/user-menu"
import { getAppearance, setAppearance } from "@/registry/lib/appearance"
import { en } from "@/registry/lib/i18n-en"
import { uk } from "@/registry/lib/i18n-uk"
import { HryvniaIcon, MODULE_ICONS, MODULE_IDS } from "@/registry/lib/icons"
import { TooltipProvider } from "@/registry/ui/tooltip"

const NAV: NavGroup[] = [
  {
    id: "sales",
    label: "Продажі",
    items: [
      {
        id: "k2",
        label: "Рахунки",
        href: "#/k2",
        icon: FileText,
        mobile: true,
        badge: 3,
      },
      { id: "b1", label: "Контакти", href: "#/b1", icon: Users, mobile: true },
      { id: "b2", label: "Воронка", href: "#/b2", icon: Users },
    ],
  },
]

function renderShell() {
  return render(
    <TooltipProvider>
      <AppShell
        nav={NAV}
        activeId="k2"
        breadcrumbs={[{ label: "Продажі" }, { label: "Рахунки" }]}
      >
        <p>Вміст</p>
      </AppShell>
    </TooltipProvider>,
  )
}

describe("AppShell (jsdom — ширина телефона)", () => {
  it("нижня панель: лише пункти mobile + «Ще»; активний позначено", () => {
    renderShell()
    const bottom = screen.getByRole("navigation", { name: "Швидкі розділи" })
    const links = within(bottom).getAllByRole("link")
    expect(links.map((l) => l.textContent)).toEqual(["Рахунки", "Контакти"])
    expect(links[0]).toHaveAttribute("aria-current", "page")
    expect(within(bottom).getByRole("button", { name: "Ще" })).toHaveAttribute(
      "aria-expanded",
      "false",
    )
  })

  it("короткий підпис: видно його, доступна назва — повна; слова немає в назві — обидва", () => {
    render(
      <TooltipProvider>
        <AppShell
          nav={[
            {
              id: "sales",
              label: "Продажі",
              items: [
                {
                  id: "k2",
                  label: "Рахунки клієнтам",
                  shortLabel: "Рахунки",
                  href: "#/k2",
                  icon: FileText,
                  mobile: true,
                },
                {
                  id: "b1",
                  label: "Контрагенти",
                  shortLabel: "Люди",
                  href: "#/b1",
                  icon: Users,
                  mobile: true,
                },
              ],
            },
          ]}
          activeId="k2"
        >
          <p>Вміст</p>
        </AppShell>
      </TooltipProvider>,
    )
    const bottom = screen.getByRole("navigation", { name: "Швидкі розділи" })
    const links = within(bottom).getAllByRole("link")
    expect(links.map((link) => link.textContent)).toEqual(["Рахунки", "Люди"])
    expect(links[0]).toHaveAccessibleName("Рахунки клієнтам")
    expect(links[1]).toHaveAccessibleName("Люди, Контрагенти")
  })

  it("«Ще» відкриває повне меню з групами", async () => {
    const user = userEvent.setup()
    renderShell()
    await user.click(screen.getByRole("button", { name: "Ще" }))
    const sheet = await screen.findByRole("dialog", { name: "Навігація" })
    expect(within(sheet).getByText("Продажі")).toBeInTheDocument()
    expect(
      within(sheet).getByRole("link", { name: /Воронка/ }),
    ).toBeInTheDocument()
  })

  it("вміст — у <main>, на телефоні в крихтах лише поточна сторінка", () => {
    renderShell()
    expect(screen.getByRole("main")).toHaveTextContent("Вміст")
    expect(
      screen.getByRole("link", { name: "Перейти до вмісту" }),
    ).toBeInTheDocument()
  })

  it("остання крихта з href — посилання (список над карткою), без href — поточна сторінка", () => {
    render(
      <TooltipProvider>
        <AppShell
          nav={NAV}
          activeId="b1"
          breadcrumbs={[
            { label: "Контакти" },
            { label: "Організації", href: "#/b1/organizations" },
          ]}
        >
          <p>Вміст</p>
        </AppShell>
      </TooltipProvider>,
    )
    expect(screen.getByRole("link", { name: "Організації" })).toHaveAttribute(
      "href",
      "#/b1/organizations",
    )
    // Підпис групи — не поточна сторінка й не посилання.
    const crumbs = screen.getByRole("navigation", { name: "Шлях до сторінки" })
    expect(within(crumbs).getByText("Контакти")).not.toHaveAttribute(
      "aria-current",
    )
    expect(crumbs.querySelector("[aria-current]")).toBeNull()
  })

  it("остання крихта без href — поточна сторінка", () => {
    renderShell()
    const crumbs = screen.getByRole("navigation", { name: "Шлях до сторінки" })
    expect(within(crumbs).getByText("Рахунки")).toHaveAttribute(
      "aria-current",
      "page",
    )
    expect(within(crumbs).getByText("Продажі")).not.toHaveAttribute(
      "aria-current",
    )
  })
})

describe("PageState", () => {
  it("тексти за замовчуванням і кнопка повтору для помилки", async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    render(<PageState kind="error" onRetry={onRetry} />)
    const alert = screen.getByRole("alert")
    expect(alert).toHaveTextContent("Не вдалося завантажити дані")
    await user.click(screen.getByRole("button", { name: "Спробувати ще" }))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it("порожньо вперше не оголошується як тривога; власний заголовок", () => {
    render(<PageState kind="empty" title="Рахунків ще немає" />)
    expect(screen.queryByRole("alert")).toBeNull()
    expect(
      screen.getByRole("heading", { name: "Рахунків ще немає" }),
    ).toBeInTheDocument()
  })

  it("рівень заголовка: 2 за замовчуванням, 1 — стан замість сторінки, 3 — у секції", () => {
    const { rerender } = render(<PageState kind="not-found" />)
    expect(screen.getByRole("heading", { level: 2 })).toBeInTheDocument()
    rerender(<PageState kind="not-found" headingLevel={1} />)
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument()
    rerender(<PageState kind="not-found" headingLevel={3} />)
    expect(screen.getByRole("heading", { level: 3 })).toBeInTheDocument()
  })

  it("компактний: h3 за замовчуванням, без великого блоку, тривога й повтор як у звичайного", async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    const { container, rerender } = render(
      <PageState kind="error" compact onRetry={onRetry} />,
    )
    const state = container.querySelector('[data-slot="page-state"]')
    expect(state).toHaveAttribute("data-compact")
    expect(state).not.toHaveClass("min-h-64")
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Не вдалося завантажити дані",
    )
    expect(
      screen.getByRole("heading", {
        level: 3,
        name: "Не вдалося завантажити дані",
      }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Спробувати ще" }))
    expect(onRetry).toHaveBeenCalledOnce()

    rerender(<PageState kind="empty" compact headingLevel={2} />)
    expect(screen.queryByRole("alert")).toBeNull()
    expect(screen.getByRole("heading", { level: 2 })).toBeInTheDocument()
    expect(screen.queryByRole("button")).toBeNull()
  })
})

describe("UserMenu", () => {
  const USER = { name: "Олена Коваль", email: "olena@test.example" }
  const openMenu = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(
      screen.getByRole("button", { name: /Меню користувача: Олена Коваль/ }),
    )
    return screen.findByRole("menu")
  }

  it("за замовчуванням видно палітру й щільність", async () => {
    const user = userEvent.setup()
    render(<UserMenu user={USER} />)
    const menu = await openMenu(user)
    expect(
      within(menu).getByRole("menuitem", { name: /Палітра/ }),
    ).toBeInTheDocument()
    expect(
      within(menu).getByRole("menuitem", { name: /Щільність/ }),
    ).toBeInTheDocument()
  })

  it("проект ховає палітру й щільність; тема, мова й сайдбар лишаються", async () => {
    const user = userEvent.setup()
    render(<UserMenu user={USER} showPalette={false} showDensity={false} />)
    const menu = await openMenu(user)
    expect(within(menu).queryByRole("menuitem", { name: /Палітра/ })).toBeNull()
    expect(
      within(menu).queryByRole("menuitem", { name: /Щільність/ }),
    ).toBeNull()
    expect(
      within(menu).getByRole("menuitemradio", { name: "Темна" }),
    ).toBeInTheDocument()
    expect(
      within(menu).getByRole("menuitem", { name: /Мова/ }),
    ).toBeInTheDocument()
    expect(
      within(menu).getByRole("menuitemcheckbox", { name: "Темний сайдбар" }),
    ).toBeInTheDocument()
  })

  it("onLanguageChange отримує мову, щойно її обрали в меню; вигляд уже змінено", async () => {
    const user = userEvent.setup()
    const onLanguageChange = vi.fn()
    render(<UserMenu user={USER} onLanguageChange={onLanguageChange} />)
    const menu = await openMenu(user)
    // Підменю з клавіатури: у jsdom його позиціонер ще має pointer-events: none.
    within(menu).getByRole("menuitem", { name: /Мова/ }).focus()
    await user.keyboard("{ArrowRight}")
    const ukrainian = await screen.findByRole("menuitemradio", {
      name: "Українська",
    })
    await vi.waitFor(() => {
      expect(ukrainian).toHaveFocus()
    })
    await user.keyboard("{ArrowDown}")
    expect(screen.getByRole("menuitemradio", { name: "English" })).toHaveFocus()
    await user.keyboard("{Enter}")
    expect(onLanguageChange).toHaveBeenCalledExactlyOnceWith("en")
    expect(getAppearance().language).toBe("en")
    setAppearance({ language: "uk" })
    expect(onLanguageChange).toHaveBeenCalledOnce()
  })
})

describe("словник іконок", () => {
  it("кожен модуль має іконку й назву uk/en", () => {
    expect(MODULE_IDS).toHaveLength(104)
    for (const id of MODULE_IDS) {
      expect(MODULE_ICONS[id], id).toBeTruthy()
      expect(uk.modules[id], id).toBeTruthy()
      expect(en.modules[id], id).toBeTruthy()
    }
  })

  it("гривня рендериться як іконка lucide", () => {
    const { container } = render(<HryvniaIcon aria-hidden />)
    const svg = container.querySelector("svg")
    expect(svg).toHaveClass("lucide")
    expect(svg?.querySelectorAll("path")).toHaveLength(3)
  })

  it("ініціали для аватара", () => {
    expect(initials("Олена Коваль")).toBe("ОК")
    expect(initials("  admin ")).toBe("A")
  })
})
