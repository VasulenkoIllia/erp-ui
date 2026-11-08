import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import {
  PrintDocumentLines,
  PrintDocumentTitle,
  PrintDocumentTotals,
  PrintWatermark,
} from "@/registry/erp/print-document"
import {
  PrintCompanyHeader,
  PrintRequisites,
  PrintSignatures,
} from "@/registry/erp/print-requisites"
import type { CompanyProfile } from "@/registry/lib/company"
import type {
  DocumentBodyLine,
  DocumentLine,
  SavedDocumentTotals,
} from "@/registry/lib/document-lines"

/**
 * Крок PF08a (ADR-0062): блоки аркуша поза переглядом (мова інтерфейсу) — назва з номером і позначка
 * чернетки, рядки з розділами, підсумки й сума прописом, реквізити, логотип, печатка.
 */

const COMPANY: CompanyProfile = {
  id: "zoriana",
  name: "Зоряна логістика",
  legalName: "ТОВ «Зоряна логістика»",
  kind: "legal",
  edrpou: "32855961",
  vatPayer: true,
  vatIpn: "143605704021",
  iban: "UA213223130000026007233566001",
  bankName: "АТ «Демо Банк»",
  address: "01001, м. Київ, вул. Зоряна, 1",
  director: { name: "Олена Коваль", position: "Директор" },
  accountant: "Ірина Шевчук",
  logoUrl: "logo.svg",
  stampUrl: "stamp.svg",
  branches: [],
}

const VAT_20 = { id: "vat-20", name: "ПДВ 20%", rate: 20, included: false }
const item = (id: string, patch: Partial<DocumentLine> = {}): DocumentLine => ({
  kind: "item",
  id,
  name: `Товар ${id}`,
  itemId: null,
  quantity: "2",
  unit: { id: "pcs", name: "шт" },
  price: "100",
  discountPercent: 0,
  discountAmount: 0,
  tax: VAT_20,
  ...patch,
})

const LINES: DocumentBodyLine[] = [
  { kind: "section", id: "s1", title: "Етап 1" },
  item("a"),
  item("b", { discountPercent: 10 }),
  { kind: "note", id: "n1", text: "Ціни дійсні 14 днів" },
  { kind: "section", id: "s2", title: "Етап 2" },
  item("c", { quantity: "1.5" }),
]

describe("документ на аркуші", () => {
  it("номер і дата; у чернетки без номера, позначка й стан для скрінрідера", () => {
    const { rerender } = render(
      <PrintDocumentTitle
        title="Рахунок на оплату"
        number="2026-0001"
        date="2026-11-04"
        dueDate="2026-11-18"
      />,
    )
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      "Рахунок на оплату № 2026-0001 від 4 листопада 2026",
    )
    expect(
      screen.getByText("Сплатити до 18 листопада 2026"),
    ).toBeInTheDocument()
    rerender(
      <>
        <PrintDocumentTitle
          title="Рахунок на оплату"
          number={null}
          date="2026-11-04"
          docStatus="draft"
        />
        <PrintWatermark docStatus="draft" />
      </>,
    )
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      "Рахунок на оплату (без номера) від 4 листопада 2026",
    )
    expect(
      screen.getByText("Чернетка: документ ще не проведено"),
    ).toBeInTheDocument()
    const mark = document.querySelector('[data-slot="print-watermark"]')
    expect(mark).toHaveAttribute("data-label", "Чернетка")
    expect(mark).toHaveAttribute("aria-hidden", "true")
  })

  it("позначка «Скасовано»; проведений друкується без позначки", () => {
    const { rerender } = render(<PrintWatermark docStatus="cancelled" />)
    expect(
      document.querySelector('[data-slot="print-watermark"]'),
    ).toHaveAttribute("data-label", "Скасовано")
    rerender(<PrintWatermark docStatus="submitted" />)
    expect(document.querySelector('[data-slot="print-watermark"]')).toBeNull()
  })

  it("рядки: номери лише товарів, розділ із сумою своїх рядків, нотатка, знижка", () => {
    render(<PrintDocumentLines lines={LINES} currency="UAH" />)
    const table = screen.getByRole("table", { name: "Рядки документа" })
    const headers = within(table)
      .getAllByRole("columnheader")
      .map((cell) => cell.textContent)
    // Ставка одна — колонки «Податок» немає; знижка є — колонка «Знижка» є.
    expect(headers).toEqual([
      "№",
      "Товари (роботи, послуги)",
      "К-сть",
      "Од.",
      "Ціна",
      "Знижка",
      "Сума",
    ])
    const rows = within(table).getAllByRole("row").slice(1)
    const text = rows.map((row) => row.textContent?.replace(/\s+/g, " ").trim())
    expect(text).toEqual([
      "Етап 1380,00 ₴",
      "1Товар a2шт100,00 ₴200,00 ₴",
      "2Товар b2шт100,00 ₴10%180,00 ₴",
      "Ціни дійсні 14 днів",
      "Етап 2150,00 ₴",
      "3Товар c1,5шт100,00 ₴150,00 ₴",
    ])
    expect(
      within(table).getByRole("rowheader", { name: "Етап 1" }),
    ).toBeInTheDocument()
  })

  it("дві ставки — колонка «Податок»; рядків немає — так і сказано", () => {
    const { rerender } = render(
      <PrintDocumentLines
        lines={[item("a"), item("b", { tax: null })]}
        currency="UAH"
      />,
    )
    expect(
      screen.getByRole("columnheader", { name: "Податок" }),
    ).toBeInTheDocument()
    expect(screen.getByText("Без податку")).toBeInTheDocument()
    rerender(<PrintDocumentLines lines={[]} currency="UAH" />)
    expect(screen.getByText("У документі немає рядків")).toBeInTheDocument()
  })

  it("підсумки за ставками, разом і сума прописом мовою аркуша", () => {
    render(<PrintDocumentTotals lines={LINES} currency="UAH" />)
    const totals = document.querySelector('[data-slot="print-document-totals"]')
    expect(totals?.textContent?.replace(/\s+/g, " ")).toContain(
      "Сума до знижок550,00 ₴",
    )
    expect(screen.getByText("Знижка в рядках")).toBeInTheDocument()
    expect(screen.getByText("ПДВ 20%")).toBeInTheDocument()
    expect(screen.getByText("Разом").nextSibling).toHaveTextContent("636,00 ₴")
    expect(
      screen.getByText(
        "Всього на суму: Шістсот тридцять шість гривень 00 копійок",
      ),
    ).toBeInTheDocument()
  })

  it("підсумки сервера мають перевагу; валюта без слів — без суми прописом", () => {
    const saved: SavedDocumentTotals = {
      amount: 10_000,
      discount: 0,
      documentDiscount: 0,
      net: 10_000,
      tax: 0,
      total: 10_000,
      taxes: [],
    }
    render(<PrintDocumentTotals lines={LINES} currency="PLN" totals={saved} />)
    expect(screen.getByText("Разом").nextSibling).toHaveTextContent("100,00")
    expect(screen.queryByText(/Всього на суму/)).toBeNull()
  })

  it("валюта без усіх форм слова й неповний рядок: аркуш не падає", () => {
    render(
      <PrintDocumentTotals
        lines={[...LINES, item("d", { price: "" })]}
        currency="PLN"
        currencies={{ PLN: { major: ["злотий"], minor: ["грош"] } }}
      />,
    )
    expect(screen.getByText("Разом").nextSibling).toHaveTextContent("636,00")
    expect(screen.queryByText(/Всього на суму/)).toBeNull()
  })
})

describe("реквізити, логотип і печатка", () => {
  it("юрособа — платник ПДВ: коди, IBAN групами, порожніх рядків немає", () => {
    render(<PrintRequisites company={{ ...COMPANY, phone: undefined }} />)
    const block = document.querySelector('[data-slot="print-requisites"]')
    const lines = Array.from(block?.children ?? [], (line) => line.textContent)
    expect(lines).toEqual([
      "ТОВ «Зоряна логістика»",
      "ЄДРПОУ 32855961, ІПН 143605704021",
      "IBAN UA21 3223 1300 0002 6007 2335 6600 1, АТ «Демо Банк»",
      "01001, м. Київ, вул. Зоряна, 1",
      "Платник ПДВ",
    ])
  })

  it("ФОП не платник ПДВ: РНОКПП і «Не є платником ПДВ»", () => {
    render(
      <PrintRequisites
        company={{
          ...COMPANY,
          kind: "fop",
          legalName: "ФОП Коваленко О. В.",
          rnokpp: "1759013776",
          vatPayer: false,
          iban: undefined,
          bankName: undefined,
          address: undefined,
        }}
      />,
    )
    expect(screen.getByText("РНОКПП 1759013776")).toBeInTheDocument()
    expect(screen.getByText("Не є платником ПДВ")).toBeInTheDocument()
    expect(screen.queryByText(/ІПН|ЄДРПОУ/)).toBeNull()
  })

  it("логотип із назвою компанії; без логотипа — лише реквізити", () => {
    const { rerender } = render(<PrintCompanyHeader company={COMPANY} />)
    expect(
      screen.getByRole("img", { name: "Логотип: ТОВ «Зоряна логістика»" }),
    ).toHaveAttribute("src", "logo.svg")
    rerender(<PrintCompanyHeader company={{ ...COMPANY, logoUrl: null }} />)
    expect(screen.queryByRole("img")).toBeNull()
  })

  it("підписи директора й бухгалтера з печаткою; без печатки й без директора", () => {
    const { rerender } = render(<PrintSignatures company={COMPANY} />)
    expect(screen.getByText("Директор")).toBeInTheDocument()
    expect(screen.getByText("Ірина Шевчук")).toBeInTheDocument()
    expect(
      screen.getByRole("img", { name: "Печатка: ТОВ «Зоряна логістика»" }),
    ).toHaveAttribute("src", "stamp.svg")
    rerender(<PrintSignatures company={COMPANY} stamp={false} />)
    expect(screen.queryByRole("img")).toBeNull()
    rerender(
      <PrintSignatures
        company={{ ...COMPANY, director: undefined, accountant: undefined }}
      />,
    )
    expect(screen.getByText("Підпис")).toBeInTheDocument()
    expect(screen.queryByText("Головний бухгалтер")).toBeNull()
  })
})
