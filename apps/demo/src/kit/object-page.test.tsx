import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { DeniedAction } from "@/registry/erp/permission-gate"
import { RecordHeader, RecordStatusBar } from "@/registry/erp/record-header"
import { ApiError, errorStateKind } from "@/registry/lib/api"
import { ObjectPage } from "@/registry/templates/object-page"

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
