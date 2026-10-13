import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { FileText, Users } from "lucide-react"
import { describe, expect, it, vi } from "vitest"

import { AppShell, type NavGroup } from "@/registry/erp/app-shell"
import { PageState } from "@/registry/erp/page-state"
import { initials } from "@/registry/erp/user-menu"
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
