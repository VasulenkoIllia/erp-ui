import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { lazy, useEffect, useState } from "react"
import { describe, expect, it, vi } from "vitest"

import { DeniedAction } from "@/registry/erp/permission-gate"
import { RecordHeader, RecordStatusBar } from "@/registry/erp/record-header"
import { ApiError, errorStateKind } from "@/registry/lib/api"
import {
  OBJECT_PAGE_ASIDE_TAB,
  ObjectPage,
  useRecordSlots,
  type ExtensionAside,
  type ObjectPageSectionItem,
} from "@/registry/templates/object-page"

import {
  makeInvoiceLines,
  makeInvoices,
  parseInvoiceDetail,
} from "@/data/invoices"
import { invoiceHref, listSearchOf, parsePath } from "@/router"

/** Крок 0.6d (ADR-0019): шаблон Object Page, шапка й етапи, детальний запис рахунку, адреса картки. */

const STEPS = [
  { id: "draft", label: "Чернетка" },
  { id: "approved", label: "Погоджено" },
  { id: "sent", label: "Надіслано" },
  { id: "paid", label: "Оплачено" },
]

function Page(props: Partial<Parameters<typeof ObjectPage>[0]>) {
  return (
    <ObjectPage
      title="Рахунок"
      header={{ title: "Рахунок № 2026-0001" }}
      aside={{ label: "Історія", content: <p>Подій ще немає.</p> }}
      sections={[
        { id: "lines", title: "Рядки", content: <p>Рядки рахунку</p> },
      ]}
      {...props}
    />
  )
}

describe("ObjectPage: стани сторінки", () => {
  it("завантаження: скелетон і прихований заголовок сторінки", () => {
    render(<Page isPending />)
    expect(
      screen.getByRole("status", { name: "Завантаження даних" }),
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Рахунок",
    )
    expect(screen.queryByText("Рядки рахунку")).not.toBeInTheDocument()
  })

  it.each([
    [
      new ApiError(404, { code: "not_found", message: "" }),
      "Сторінку не знайдено",
      false,
    ],
    [
      new ApiError(403, { code: "forbidden", message: "" }),
      "Немає доступу",
      false,
    ],
    [
      new ApiError(0, { code: "offline", message: "" }),
      "Немає з'єднання",
      true,
    ],
    [new Error("boom"), "Не вдалося завантажити дані", true],
  ])(
    "помилка запису %#: стан і повтор лише там, де він допоможе",
    async (error, title, retry) => {
      const onRetry = vi.fn()
      render(<Page error={error} onRetry={onRetry} />)
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument()
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
        "Рахунок",
      )
      const button = screen.queryByRole("button", {
        name: /^(Спробувати ще|Перевірити ще раз)$/,
      })
      expect(Boolean(button)).toBe(retry)
      if (button) {
        await userEvent.click(button)
        expect(onRetry).toHaveBeenCalledOnce()
      }
    },
  )

  it("запис: шапка з h1, а на вузькому контейнері стрічка — вкладкою", async () => {
    render(<Page />)
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Рахунок № 2026-0001",
    )
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1)
    expect(screen.getByRole("region", { name: "Рядки" })).toBeInTheDocument()
    await userEvent.click(screen.getByRole("tab", { name: "Історія" }))
    expect(screen.getByText("Подій ще немає.")).toBeInTheDocument()
  })
})

/** Вкладки з адресою: вибрану тримає сторінка, як `?tab=` у демо. */
function TabsPage({
  initial = null,
  onTab = () => undefined,
  sections = TAB_SECTIONS,
  ...props
}: Partial<Parameters<typeof ObjectPage>[0]> & {
  initial?: string | null
  onTab?: (id: string) => void
}) {
  const [tab, setTab] = useState(initial)
  return (
    <Page
      aside={undefined}
      sections={sections}
      tabs={{
        value: tab,
        onValueChange: (id) => {
          onTab(id)
          setTab(id)
        },
      }}
      {...props}
    />
  )
}

const TAB_SECTIONS: ObjectPageSectionItem[] = [
  { id: "requisites", title: "Реквізити", content: <p>Код 12345678</p> },
  { id: "invoices", title: "Рахунки", content: <p>Рахунки клієнта</p> },
  { id: "notes", title: "Нотатки", content: <p>Нотатки менеджера</p> },
]

describe("ObjectPage: вкладки секцій (ADR-0024)", () => {
  it("невідомий ключ — перша вкладка; змонтована лише вибрана, з h2 для переходу заголовками", () => {
    render(<TabsPage initial="removed-by-extension" />)
    const tablist = screen.getByRole("tablist", { name: "Розділи запису" })
    expect(
      within(tablist)
        .getAllByRole("tab")
        .map((tab) => tab.textContent),
    ).toEqual(["Реквізити", "Рахунки", "Нотатки"])
    expect(screen.getByRole("tab", { name: "Реквізити" })).toHaveAttribute(
      "aria-selected",
      "true",
    )
    const panel = screen.getByRole("tabpanel")
    expect(within(panel).getByRole("heading", { level: 2 })).toHaveTextContent(
      "Реквізити",
    )
    expect(screen.getByText("Код 12345678")).toBeInTheDocument()
    expect(screen.queryByText("Рахунки клієнта")).not.toBeInTheDocument()
  })

  it("клавіатура (W3C APG): стрілки лише переводять фокус, Enter вибирає й пише ключ", async () => {
    const user = userEvent.setup()
    const onTab = vi.fn()
    render(<TabsPage onTab={onTab} />)
    await user.click(screen.getByRole("tab", { name: "Реквізити" }))
    await user.keyboard("{ArrowRight}")
    const invoices = screen.getByRole("tab", { name: "Рахунки" })
    expect(invoices).toHaveFocus()
    expect(screen.queryByText("Рахунки клієнта")).not.toBeInTheDocument()
    await user.keyboard("{End}")
    expect(screen.getByRole("tab", { name: "Нотатки" })).toHaveFocus()
    await user.keyboard("{Home}{ArrowRight}{Enter}")
    expect(onTab).toHaveBeenLastCalledWith("invoices")
    expect(screen.getByText("Рахунки клієнта")).toBeInTheDocument()
    expect(screen.queryByText("Код 12345678")).not.toBeInTheDocument()
    expect(invoices).toHaveFocus()
  })

  it("лінивий вміст вкладки — скелетон секції, а не вся картка", async () => {
    let release: () => void = () => undefined
    const Notes = lazy(
      () =>
        new Promise<{ default: () => React.ReactNode }>((resolve) => {
          release = () => {
            resolve({ default: () => <p>Нотатки з чанка</p> })
          }
        }),
    )
    render(
      <TabsPage
        initial="notes"
        sections={[
          ...TAB_SECTIONS.slice(0, 2),
          { id: "notes", title: "Нотатки", content: <Notes /> },
        ]}
      />,
    )
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Рахунок № 2026-0001",
    )
    expect(
      within(screen.getByRole("tabpanel")).getByRole("status", {
        name: "Завантаження даних",
      }),
    ).toBeInTheDocument()
    release()
    expect(await screen.findByText("Нотатки з чанка")).toBeInTheDocument()
  })

  it("вузько зі стрічкою — вона остання вкладка серед секцій", async () => {
    const user = userEvent.setup()
    const onTab = vi.fn()
    render(
      <TabsPage
        onTab={onTab}
        aside={{ label: "Історія", content: <p>Подій ще немає.</p> }}
      />,
    )
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Реквізити",
      "Рахунки",
      "Нотатки",
      "Історія",
    ])
    await user.click(screen.getByRole("tab", { name: "Історія" }))
    expect(onTab).toHaveBeenLastCalledWith(OBJECT_PAGE_ASIDE_TAB)
    expect(screen.getByText("Подій ще немає.")).toBeInTheDocument()
  })
})

/** Поле з текстом, який живе в стані: так поводиться чернетка стрічки. */
function Draft() {
  const [text, setText] = useState("")
  return (
    <label>
      Чернетка
      <input
        value={text}
        onChange={(event) => {
          setText(event.target.value)
        }}
      />
    </label>
  )
}

describe("ObjectPage: стрічка, що не зникає (ADR-0054)", () => {
  const aside = { label: "Стрічка", content: <Draft />, keepMounted: true }

  it("не монтується, доки її не показали: запити не йдуть даремно", async () => {
    const mounted = vi.fn()
    function Spy() {
      useEffect(mounted, [])
      return <p>Стрічка запису</p>
    }
    render(<Page aside={{ ...aside, content: <Spy /> }} />)
    expect(mounted).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole("tab", { name: "Стрічка" }))
    expect(await screen.findByText("Стрічка запису")).toBeInTheDocument()
    expect(mounted).toHaveBeenCalledOnce()
  })

  it("чернетка переживає перехід на іншу вкладку і назад", async () => {
    const user = userEvent.setup()
    render(<Page aside={aside} />)
    await user.click(screen.getByRole("tab", { name: "Стрічка" }))
    await user.type(await screen.findByLabelText("Чернетка"), "Текст")
    await user.click(screen.getByRole("tab", { name: "Подробиці" }))
    expect(screen.queryByLabelText("Чернетка")).not.toBeInTheDocument()
    await user.click(screen.getByRole("tab", { name: "Стрічка" }))
    expect(await screen.findByLabelText("Чернетка")).toHaveValue("Текст")
  })

  it("так само серед вкладок секцій", async () => {
    const user = userEvent.setup()
    render(<TabsPage aside={aside} />)
    await user.click(screen.getByRole("tab", { name: "Стрічка" }))
    await user.type(await screen.findByLabelText("Чернетка"), "Текст")
    await user.click(screen.getByRole("tab", { name: "Реквізити" }))
    expect(screen.getByText("Код 12345678")).toBeInTheDocument()
    await user.click(screen.getByRole("tab", { name: "Стрічка" }))
    expect(await screen.findByLabelText("Чернетка")).toHaveValue("Текст")
  })

  it("без `keepMounted` вкладка, як і раніше, монтує вміст наново", async () => {
    const user = userEvent.setup()
    render(<Page aside={{ ...aside, keepMounted: false }} />)
    await user.click(screen.getByRole("tab", { name: "Стрічка" }))
    await user.type(await screen.findByLabelText("Чернетка"), "Текст")
    await user.click(screen.getByRole("tab", { name: "Подробиці" }))
    await user.click(screen.getByRole("tab", { name: "Стрічка" }))
    expect(await screen.findByLabelText("Чернетка")).toHaveValue("")
  })
})

describe("useRecordSlots: стрічка зі слота", () => {
  const record = { id: "r1" }

  function SlotPage({
    component,
  }: {
    component: ExtensionAside<typeof record>["component"]
  }) {
    const slots = useRecordSlots({
      record,
      resource: "deals",
      aside: { label: { uk: "Стрічка", en: "Feed" }, component },
    })
    return <Page aside={slots.aside} />
  }

  it("компонент проекту отримує запис і ресурс, назва — мовою інтерфейсу", async () => {
    render(
      <SlotPage
        component={({ record: { id }, resource }) => (
          <p>
            {resource}/{id}
          </p>
        )}
      />,
    )
    await userEvent.click(screen.getByRole("tab", { name: "Стрічка" }))
    expect(await screen.findByText("deals/r1")).toBeInTheDocument()
  })

  it("збій слота не валить картку", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    function Broken(): never {
      throw new Error("boom")
    }
    render(<SlotPage component={Broken} />)
    await userEvent.click(screen.getByRole("tab", { name: "Стрічка" }))
    expect(
      await screen.findByRole("button", { name: "Спробувати ще" }),
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Рахунок № 2026-0001",
    )
    vi.restoreAllMocks()
  })
})

describe("RecordHeader і RecordStatusBar", () => {
  it("порожнє поле — «—»", () => {
    render(
      <RecordHeader
        title="Рахунок"
        fields={[{ id: "client", label: "Клієнт", value: "" }]}
      />,
    )
    expect(screen.getByText("—")).toBeInTheDocument()
  })

  it("пройдені етапи — «виконано», поточний — aria-current", () => {
    render(
      <RecordStatusBar label="Етапи рахунку" steps={STEPS} current="sent" />,
    )
    const list = screen.getByRole("list", { name: "Етапи рахунку" })
    expect(list.querySelector("[aria-current=step]")).toHaveTextContent(
      "Надіслано",
    )
    expect(screen.getByText("Чернетка").parentElement).toHaveTextContent(
      "Чернетка, виконано",
    )
    expect(screen.getByText("3 з 4")).toBeInTheDocument()
  })

  it("етапу немає в переліку — видно всі, жоден не поточний", () => {
    render(
      <RecordStatusBar
        label="Етапи рахунку"
        steps={STEPS}
        current="cancelled"
      />,
    )
    const items = screen.getAllByRole("listitem")
    expect(items).toHaveLength(4)
    for (const item of items) expect(item).not.toHaveClass("hidden")
    expect(document.querySelector("[aria-current]")).toBeNull()
  })
})

describe("DeniedAction (SPEC §8.4)", () => {
  it("неактивна, у фокусі, причина — в описі кнопки", () => {
    render(
      <DeniedAction reason="Доступно для ролі «Бухгалтер»">
        Змінити
      </DeniedAction>,
    )
    const button = screen.getByRole("button", { name: "Змінити" })
    expect(button).toHaveAttribute("aria-disabled", "true")
    expect(button).toHaveAccessibleDescription("Доступно для ролі «Бухгалтер»")
    button.focus()
    expect(button).toHaveFocus()
  })
})

describe("детальний запис рахунку", () => {
  const invoices = makeInvoices(400)

  it("рядки: сума — як у рахунку, ціна й сума рядка — цілі копійки", () => {
    const amounts = [0, 1, 7, 99, 35_000_000]
    const cases = [
      ...invoices,
      ...amounts.map((amount, i) => ({ id: `edge-${String(i)}`, amount })),
    ]
    for (const invoice of cases) {
      const lines = makeInvoiceLines(invoice)
      expect(lines.length).toBeGreaterThan(0)
      expect(lines.reduce((sum, line) => sum + line.total, 0)).toBe(
        invoice.amount,
      )
      for (const line of lines) {
        expect(Number.isInteger(line.price)).toBe(true)
        expect(line.price * line.quantity).toBe(line.total)
      }
    }
    expect(makeInvoiceLines(invoices[0])).toEqual(makeInvoiceLines(invoices[0]))
  })

  it("розбір: рядок списку — шапка без рядків; деталь — з рядками; зіпсоване — помилка", () => {
    const invoice = invoices[0]
    const lines = makeInvoiceLines(invoice)
    expect(parseInvoiceDetail(undefined)).toEqual({})
    expect(parseInvoiceDetail(invoice)).toEqual({ invoice, lines: undefined })
    expect(parseInvoiceDetail({ ...invoice, lines })).toEqual({
      invoice,
      lines,
    })

    const unknownStatus = parseInvoiceDetail({
      ...invoice,
      status: "cancelled",
    })
    expect(unknownStatus.invoice).toBeUndefined()
    expect(unknownStatus.error?.message).toMatch(/status/)

    const badLine = parseInvoiceDetail({
      ...invoice,
      lines: [{ ...lines[0], price: 1.5 }],
    })
    expect(badLine.invoice).toEqual(invoice)
    expect(badLine.lines).toBeUndefined()
    expect(badLine.error?.message).toMatch(/price/)
  })
})

describe("адреса картки", () => {
  it("/data/<id>: туди й назад, зіпсований % і вкладений шлях", () => {
    expect(invoiceHref("inv-00001")).toBe("/data/inv-00001")
    expect(parsePath("/data/inv-00001")).toEqual({
      route: "invoice",
      id: "inv-00001",
    })
    expect(parsePath(invoiceHref("a/b c"))).toEqual({
      route: "invoice",
      id: "a/b c",
    })
    expect(parsePath("/data/%E0")).toEqual({ route: "invoice", id: "%E0" })
    expect(parsePath("/data/inv-1/lines")).not.toMatchObject({
      route: "invoice",
    })
    expect(parsePath("/data")).toEqual({ route: "data" })
  })

  it("«До списку»: лише рядок запиту зі стану переходу", () => {
    expect(listSearchOf({ listSearch: "?tab=draft" })).toBe("?tab=draft")
    expect(listSearchOf({ listSearch: "https://evil.example" })).toBe("")
    expect(listSearchOf({ listSearch: 42 })).toBe("")
    expect(listSearchOf(null)).toBe("")
    expect(listSearchOf("?tab=draft")).toBe("")
  })

  it("стан помилки: офлайн, немає доступу, решта — помилка з повтором", () => {
    expect(
      errorStateKind(new ApiError(0, { code: "offline", message: "" })),
    ).toBe("offline")
    expect(
      errorStateKind(new ApiError(403, { code: "forbidden", message: "" })),
    ).toBe("forbidden")
    expect(errorStateKind(new Error("boom"))).toBe("error")
  })
})
