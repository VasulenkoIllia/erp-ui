import { zodResolver } from "@hookform/resolvers/zod"
import { QueryClient } from "@tanstack/react-query"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { CoreAdminContext, type DataProvider } from "ra-core"
import { useForm } from "react-hook-form"
import { describe, expect, it, vi } from "vitest"

import type { DocumentLineItem } from "@/registry/erp/document-line-fields"
import { DocumentLinesEditor } from "@/registry/erp/document-lines-editor"
import {
  useDocumentLinesSchema,
  type DocumentLinesValues,
} from "@/registry/erp/document-lines-schema"
import { previewTotals } from "@/registry/erp/document-lines-totals"
import type {
  DocumentLine,
  DocumentLineTax,
  SavedDocumentLine,
  SavedDocumentTotals,
} from "@/registry/lib/document-lines"
import { computeDocumentTotals } from "@/registry/lib/document-totals"
import { formatMoney } from "@/registry/lib/format"

/** Редактор рядків документа (UI05a, ADR-0059): поля, клавіатура, підсумки з lib/document-totals. */

const VAT_20: DocumentLineTax = {
  id: "vat-20",
  name: "ПДВ 20%",
  rate: 20,
  included: false,
}
const TAXES: readonly DocumentLineTax[] = [
  VAT_20,
  { id: "vat-7", name: "ПДВ 7%", rate: 7, included: false },
]
const UNITS = [
  { id: "pcs", name: "шт" },
  { id: "h", name: "год" },
]

const line = (id: string, patch: Partial<DocumentLine> = {}): DocumentLine => ({
  id,
  name: `Рядок ${id}`,
  itemId: null,
  quantity: "1",
  unit: UNITS[0],
  price: "100",
  discountPercent: 0,
  discountAmount: 0,
  tax: VAT_20,
  ...patch,
})

const values = (
  lines: DocumentLine[],
  discount: Partial<DocumentLinesValues> = {},
): DocumentLinesValues => ({
  lines,
  discountPercent: 0,
  discountAmount: 0,
  ...discount,
})

const uah = (amount: number) => formatMoney({ amount, currency: "UAH" }, "uk")
/** Сума так, як її шукає getByText: нерозривні пробіли вузла він зводить до звичайних. */
const uahText = (amount: number) => uah(amount).replace(/\s/g, " ")

interface Product {
  id: string
  name: string
  price: number
}

function Editor({
  initial,
  currency = "UAH",
  readOnly,
  savedTotals,
  item,
  newLine = () => ({ tax: VAT_20 }),
  onSubmit,
}: {
  initial: DocumentLinesValues
  currency?: string
  readOnly?: boolean
  savedTotals?: SavedDocumentTotals
  item?: DocumentLineItem<Product>
  newLine?: () => Partial<Omit<DocumentLine, "id">>
  onSubmit?: (values: DocumentLinesValues) => void
}) {
  const schema = useDocumentLinesSchema(currency)
  const form = useForm<DocumentLinesValues>({
    mode: "onTouched",
    resolver: zodResolver(schema),
    defaultValues: initial,
  })
  return (
    <form
      noValidate
      onSubmit={(event) =>
        void form.handleSubmit((submitted) => onSubmit?.(submitted))(event)
      }
    >
      <DocumentLinesEditor
        form={form}
        currency={currency}
        units={UNITS}
        taxes={TAXES}
        item={item}
        newLine={newLine}
        readOnly={readOnly}
        savedTotals={savedTotals}
      />
      <button type="submit">Зберегти</button>
    </form>
  )
}

const row = (index: number) =>
  screen.getByRole("group", { name: `Рядок ${String(index)}` })
const totals = () => screen.getByRole("region", { name: "Підсумки" })
/** Значення рядка підсумків за підписом. */
function total(label: string) {
  const term = within(totals()).getByText(label, { selector: "dt" })
  return term.nextElementSibling?.textContent
}

describe("підсумки збігаються з lib/document-totals", () => {
  it("рядки, знижки й ставки дають ті самі суми, що й computeDocumentTotals", () => {
    const initial = values(
      [
        line("1", { quantity: "2", price: "4200" }),
        line("2", {
          quantity: "1.5",
          unit: UNITS[1],
          price: "900",
          discountPercent: 10,
        }),
        line("3", { price: "150", discountAmount: 5_000, tax: null }),
        line("4", { price: "33.33", tax: TAXES[1] }),
      ],
      { discountPercent: 5 },
    )
    render(<Editor initial={initial} />)
    const expected = computeDocumentTotals(initial.lines, 2, initial)
    if (!expected) throw new Error("Сума за межею")
    expect(total("Сума до знижок")).toBe(uah(expected.amount))
    expect(total("Знижка в рядках")).toBe(
      uah(expected.discount - expected.documentDiscount),
    )
    expect(total("Знижка на документ")).toBe(uah(expected.documentDiscount))
    expect(total("Без податку")).toBe(uah(expected.net))
    expect(total("ПДВ 20%")).toBe(uah(expected.taxes[0].tax))
    expect(total("ПДВ 7%")).toBe(uah(expected.taxes[1].tax))
    expect(total("Разом")).toBe(uah(expected.total))
    // Сума рядка — кількість × ціна мінус знижка рядка, до знижки документа.
    expect(within(row(2)).getByText(uahText(121_500))).toBeInTheDocument()
    expect(within(row(3)).getByText(uahText(10_000))).toBeInTheDocument()
  })

  it("податок у ціні — «у т. ч.», без податку — лише «Разом»", () => {
    const { unmount } = render(
      <Editor
        initial={values([
          line("1", {
            price: "120",
            tax: { ...VAT_20, id: "vat-in", included: true },
          }),
        ])}
      />,
    )
    expect(total("У т. ч. ПДВ 20%")).toBe(uah(2_000))
    expect(total("Разом")).toBe(uah(12_000))
    unmount()
    render(<Editor initial={values([line("1", { tax: null })])} />)
    expect(within(totals()).queryByText("Без податку")).toBeNull()
    expect(total("Разом")).toBe(uah(10_000))
  })

  it("рядок без ціни не рахується, і це сказано під підсумками", () => {
    render(<Editor initial={values([line("1"), line("2", { price: "" })])} />)
    expect(total("Разом")).toBe(uah(12_000))
    expect(within(row(2)).getByText("—")).toBeInTheDocument()
    expect(totals()).toHaveTextContent(
      "Не враховано 1 рядок: перевірте кількість, ціну й знижку.",
    )
  })

  it("попередній розрахунок прибирає рядок зі знижкою понад суму й зайву знижку документа", () => {
    const lines = [line("1"), line("2", { discountAmount: 20_000 })]
    const preview = previewTotals(lines, 2, {
      discountPercent: 0,
      discountAmount: 50_000,
    })
    expect(preview.skipped).toBe(1)
    expect([...preview.lines.keys()]).toEqual([0])
    expect(preview.totals?.documentDiscount).toBe(0)
    expect(preview.totals?.total).toBe(12_000)
    expect(preview.documentDiscountSkipped).toBe(true)
  })

  it("зайва знижка документа — примітка під підсумками", () => {
    render(<Editor initial={values([line("1")], { discountAmount: 50_000 })} />)
    expect(total("Разом")).toBe(uah(12_000))
    expect(within(totals()).getByRole("status")).toHaveTextContent(
      "Знижку на документ не враховано: перевірте її.",
    )
  })

  it("сума за межею контракту — повідомлення замість підсумків", () => {
    render(
      <Editor
        initial={values([
          line("1", { quantity: "2", price: "90000000000000" }),
        ])}
      />,
    )
    expect(totals()).toHaveTextContent("Сума документа завелика")
    expect(within(totals()).queryByText("Разом")).toBeNull()
  })
})

describe("клавіатура", () => {
  it("додати, заповнити й вилучити рядок лише з клавіатури", async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn<(values: DocumentLinesValues) => void>()
    render(<Editor initial={values([line("1")])} onSubmit={onSubmit} />)
    screen.getByRole("button", { name: "Додати рядок" }).focus()
    await user.keyboard("{Enter}")
    const added = row(2)
    expect(within(added).getByLabelText("Назва")).toHaveFocus()
    expect(
      within(added).getByRole("combobox", { name: "Податок" }),
    ).toHaveTextContent("ПДВ 20%")
    await user.keyboard("Монтаж{Tab}")
    expect(within(added).getByLabelText("Кількість")).toHaveFocus()
    await user.keyboard("{Control>}a{/Control}3{Tab}{Tab}250,5{Tab}")
    expect(within(added).getByText(uahText(75_150))).toBeInTheDocument()
    expect(total("Разом")).toBe(uah(12_000 + 90_180))

    const remove = within(row(1)).getByRole("button", {
      name: "Вилучити: Рядок 1",
    })
    remove.focus()
    await user.keyboard("{Enter}")
    expect(within(row(1)).getByLabelText("Назва")).toHaveValue("Монтаж")
    expect(
      within(row(1)).getByRole("button", { name: "Вилучити: Рядок 1" }),
    ).toHaveFocus()
    expect(total("Разом")).toBe(uah(90_180))

    await user.click(screen.getByRole("button", { name: "Зберегти" }))
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledOnce()
    })
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      lines: [
        {
          name: "Монтаж",
          quantity: "3",
          price: "250.5",
          unit: null,
          tax: VAT_20,
          discountPercent: 0,
          discountAmount: 0,
        },
      ],
    })
  })

  it("перемикач «₴» обнуляє відсоток, сума йде мінорними одиницями", async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn<(values: DocumentLinesValues) => void>()
    render(
      <Editor
        initial={values([line("1", { discountPercent: 10 })])}
        onSubmit={onSubmit}
      />,
    )
    expect(total("Знижка в рядках")).toBe(uah(1_000))
    await user.click(
      within(row(1)).getByRole("combobox", { name: "Вид знижки: Рядок 1" }),
    )
    await user.click(await screen.findByRole("option", { name: "сумою" }))
    const amount = within(row(1)).getByLabelText("Знижка, сумою")
    expect(amount).toHaveValue("")
    await user.type(amount, "12,5")
    await user.click(screen.getByRole("button", { name: "Зберегти" }))
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledOnce()
    })
    expect(onSubmit.mock.calls[0]?.[0].lines[0]).toMatchObject({
      discountPercent: 0,
      discountAmount: 1_250,
    })
    expect(total("Знижка в рядках")).toBe(uah(1_250))
  })

  it("стерта знижка сумою лишає поле суми під фокусом", async () => {
    const user = userEvent.setup()
    render(<Editor initial={values([line("1", { discountAmount: 5_000 })])} />)
    const amount = within(row(1)).getByLabelText("Знижка, сумою")
    await user.click(amount)
    await user.keyboard("{Control>}a{/Control}{Backspace}")
    expect(within(row(1)).getByLabelText("Знижка, сумою")).toBe(amount)
    expect(amount).toHaveFocus()
    expect(amount).toHaveValue("")
    await user.keyboard("1")
    // Набране не перемальовується нулями: «1», а не «1,00».
    expect(amount).toHaveValue("1")
  })

  it("сума знижки не виходить за безпечне ціле число", async () => {
    const user = userEvent.setup()
    render(<Editor initial={values([line("1", { discountAmount: 100 })])} />)
    const amount = within(row(1)).getByLabelText("Знижка, сумою")
    await user.clear(amount)
    await user.type(amount, "9".repeat(17))
    // UAH: 13 цілих розрядів і 2 знаки копійок — 15 цифр мінорних одиниць.
    expect(amount).toHaveValue("9\u00a0999\u00a0999\u00a0999\u00a0999")
    expect(within(row(1)).getByText("—")).toBeInTheDocument()
  })

  it("новий рядок: типове значення undefined не стирає порожнє", async () => {
    const user = userEvent.setup()
    render(<Editor initial={values([])} newLine={() => ({ tax: undefined })} />)
    await user.click(screen.getByRole("button", { name: "Додати рядок" }))
    expect(
      within(row(1)).getByRole("combobox", { name: "Податок" }),
    ).toHaveTextContent("Без податку")
  })
})

describe("помилки біля полів", () => {
  it("порожня назва й ціна, нульова кількість, знижки понад суму", async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn<(values: DocumentLinesValues) => void>()
    render(
      <Editor
        initial={values(
          [
            line("1", { name: "", quantity: "0", price: "" }),
            line("2", { discountAmount: 20_000 }),
          ],
          { discountAmount: 50_000 },
        )}
        onSubmit={onSubmit}
      />,
    )
    await user.click(screen.getByRole("button", { name: "Зберегти" }))
    expect(
      await within(row(1)).findByText("Має бути більше нуля"),
    ).toBeInTheDocument()
    expect(within(row(1)).getAllByText("Заповніть це поле")).toHaveLength(2)
    // Знижка рядка перевіряється в самому рядку: помилки інших рядків її не ховають.
    expect(
      within(row(2)).getByText("Знижка більша за суму"),
    ).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()

    // Рядки виправлено: тепер видно, що знижка документа більша за суму рядків.
    await user.type(within(row(1)).getByLabelText("Назва"), "Послуга")
    await user.clear(within(row(1)).getByLabelText("Кількість"))
    await user.type(within(row(1)).getByLabelText("Кількість"), "1")
    await user.type(within(row(1)).getByLabelText("Ціна"), "100")
    await user.clear(within(row(2)).getByLabelText("Знижка, сумою"))
    await user.click(screen.getByRole("button", { name: "Зберегти" }))
    expect(
      await within(totals()).findByText("Знижка більша за суму"),
    ).toBeInTheDocument()
  })

  it("знижка документа понад суму рядків — біля поля знижки документа", async () => {
    const user = userEvent.setup()
    render(<Editor initial={values([line("1")], { discountAmount: 50_000 })} />)
    await user.click(screen.getByRole("button", { name: "Зберегти" }))
    expect(
      await within(totals()).findByText("Знижка більша за суму"),
    ).toBeInTheDocument()
    expect(
      within(totals()).getByLabelText("Знижка на документ, сумою"),
    ).toHaveAttribute("aria-invalid", "true")
  })

  it("сума за межею — помилка всієї групи під рядками", async () => {
    const user = userEvent.setup()
    render(
      <Editor
        initial={values([
          line("1", { quantity: "2", price: "90000000000000" }),
        ])}
      />,
    )
    await user.click(screen.getByRole("button", { name: "Зберегти" }))
    const group = screen.getByRole("group", { name: "Рядки документа" })
    expect(
      await within(group).findByText(
        "Сума документа завелика. Зменште кількість чи ціну.",
      ),
    ).toBeInTheDocument()
  })
})

describe("лише для читання й знімки довідників", () => {
  it("поля у фокусі без кнопок, підсумки сервера", () => {
    const initial = values([line("1")])
    const server = computeDocumentTotals(initial.lines, 2)
    if (!server) throw new Error("Сума за межею")
    render(
      <Editor
        initial={initial}
        readOnly
        savedTotals={{ ...server, total: 99_999 }}
      />,
    )
    expect(within(row(1)).getByLabelText("Назва")).toHaveAttribute("readonly")
    expect(
      screen.queryByRole("button", { name: /Додати рядок|Вилучити/ }),
    ).toBeNull()
    // Збережений документ показує числа сервера, а не попередній розрахунок.
    expect(total("Разом")).toBe(uah(99_999))
  })

  it("сума рядка лише для читання — із сум сервера в рядку", () => {
    const saved = line("1")
    const server = computeDocumentTotals([saved], 2)
    if (!server) throw new Error("Сума за межею")
    const fromServer: SavedDocumentLine = {
      ...saved,
      totals: { ...server.lines[0], amount: 9_999 },
    }
    render(
      <Editor initial={values([fromServer])} readOnly savedTotals={server} />,
    )
    expect(within(row(1)).getByText(uahText(9_999))).toBeInTheDocument()
  })

  it("ставка, якої вже немає в довіднику, лишається вибраною під своєю назвою", () => {
    render(
      <Editor
        initial={values([
          line("1", { tax: { ...VAT_20, rate: 14, name: "ПДВ 14% (старий)" } }),
        ])}
      />,
    )
    expect(
      within(row(1)).getByRole("combobox", { name: "Податок" }),
    ).toHaveTextContent("ПДВ 14% (старий)")
  })

  it("вибраний товар підставляє назву й ціну", async () => {
    const user = userEvent.setup()
    const products: Product[] = [{ id: "p-1", name: "Кавоварка", price: 4200 }]
    const dataProvider = {
      getList: () => Promise.resolve({ data: products, total: 1 }),
      getOne: (_: string, { id }: { id: unknown }) =>
        Promise.resolve({ data: products.find((p) => p.id === id) }),
    } as unknown as DataProvider
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <CoreAdminContext dataProvider={dataProvider} queryClient={queryClient}>
        <Editor
          initial={values([line("1", { name: "", price: "" })])}
          item={{
            resource: "products",
            optionLabel: (product) => product.name,
            toLine: (product) => ({
              name: product.name,
              price: String(product.price),
              // Без значення — одиниця лишається, як була.
              unit: undefined,
            }),
          }}
        />
      </CoreAdminContext>,
    )
    await user.click(screen.getByRole("button", { name: "Зберегти" }))
    expect(
      await within(row(1)).findAllByText("Заповніть це поле"),
    ).toHaveLength(2)
    await user.click(
      within(row(1)).getByRole("combobox", { name: "Товар чи послуга" }),
    )
    await user.click(await screen.findByRole("option", { name: "Кавоварка" }))
    expect(within(row(1)).getByLabelText("Назва")).toHaveValue("Кавоварка")
    expect(within(row(1)).getByLabelText("Ціна")).toHaveValue("4\u00a0200")
    expect(
      within(row(1)).getByRole("combobox", { name: "Одиниця" }),
    ).toHaveTextContent("шт")
    // Хост не читає `errors`, а помилки полів, які заповнив вибір, усе одно зникають.
    await waitFor(() => {
      expect(within(row(1)).queryByText("Заповніть це поле")).toBeNull()
    })
    expect(total("Разом")).toBe(uah(504_000))
  })
})
