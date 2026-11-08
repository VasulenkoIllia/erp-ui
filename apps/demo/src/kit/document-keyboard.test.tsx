import { zodResolver } from "@hookform/resolvers/zod"
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useForm } from "react-hook-form"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { DocumentLinesEditor } from "@/registry/erp/document-lines-editor"
import {
  useDocumentLinesSchema,
  type DocumentLinesValues,
} from "@/registry/erp/document-lines-schema"
import { findDocumentLines } from "@/registry/erp/document-lines-search"
import {
  groupHeadsOf,
  rowGroupMove,
} from "@/registry/erp/repeating-rows-groups"
import type {
  DocumentBodyLine,
  DocumentLineTax,
} from "@/registry/lib/document-lines"

/**
 * Великий документ з клавіатури (UI05d, ADR-0064): Ctrl+End до підсумків, пошук у рядках, перенесення
 * розділу з рядками. Рядок поза екраном перевіряє e2e (`document-form.spec.ts`).
 */

/**
 * Рядок віртуального списку — 64 px (TanStack Virtual міряє `offsetHeight`): без висоти в jsdom діапазон
 * рядків у DOM випадковий.
 */
const ROW_HEIGHT_PX = 64

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(
    function (this: HTMLElement) {
      return this.matches("li[data-row-index]") ? ROW_HEIGHT_PX : 0
    },
  )
})

afterEach(() => {
  vi.restoreAllMocks()
})

const VAT_20: DocumentLineTax = {
  id: "vat-20",
  name: "ПДВ 20%",
  rate: 20,
  included: false,
}
const TAXES = [VAT_20]
const UNITS = [{ id: "pcs", name: "шт" }]

const item = (id: string, name: string): DocumentBodyLine => ({
  kind: "item",
  id,
  name,
  itemId: null,
  quantity: "1",
  unit: UNITS[0] ?? null,
  price: "100",
  discountPercent: 0,
  discountAmount: 0,
  tax: VAT_20,
})
const section = (id: string, title: string): DocumentBodyLine => ({
  kind: "section",
  id,
  title,
})
const note = (id: string, text: string): DocumentBodyLine => ({
  kind: "note",
  id,
  text,
})

/** Рядок до першого розділу, «Обладнання» (рядки 2–4), «Монтаж» (рядки 5–7) з нотаткою. */
const LINES = [
  item("1", "Кабель"),
  section("s1", "Обладнання"),
  item("2", "Кавоварка"),
  item("3", "Чайник"),
  section("s2", "Монтаж"),
  item("4", "Встановлення"),
  note("n1", "Монтаж після поставки"),
]

function Editor({
  lines = LINES,
  virtualizeFrom = 5,
  onSubmit,
}: {
  lines?: DocumentBodyLine[]
  virtualizeFrom?: number
  onSubmit?: (values: DocumentLinesValues) => void
}) {
  const schema = useDocumentLinesSchema("UAH")
  const form = useForm<DocumentLinesValues>({
    mode: "onTouched",
    resolver: zodResolver(schema),
    defaultValues: { lines, discountPercent: 0, discountAmount: 0 },
  })
  return (
    <form
      noValidate
      onSubmit={(event) =>
        void form.handleSubmit((values) => onSubmit?.(values))(event)
      }
    >
      <DocumentLinesEditor
        form={form}
        currency="UAH"
        units={UNITS}
        taxes={TAXES}
        virtualizeFrom={virtualizeFrom}
      />
      <button type="submit">Зберегти</button>
    </form>
  )
}

const row = (index: number) =>
  screen.getByRole("group", { name: `Рядок ${String(index)}` })
const documentDiscount = () =>
  screen.getByLabelText("Знижка на документ, у відсотках")
const search = () => screen.getByRole("combobox", { name: "Пошук у рядках" })
const titleOf = (index: number) =>
  within(row(index)).queryByLabelText("Розділ")?.getAttribute("value")

/** Дія з меню рядка лише клавіатурою: Enter на меню, стрілки до пункту, Enter. */
async function rowAction(
  user: ReturnType<typeof userEvent.setup>,
  index: number,
  action: string,
) {
  within(row(index))
    .getByRole("button", { name: `Дії: Рядок ${String(index)}` })
    .focus()
  await user.keyboard("{Enter}")
  const menuItem = await screen.findByRole("menuitem", { name: action })
  for (let step = 0; step < 10 && document.activeElement !== menuItem; step++)
    await user.keyboard("{ArrowDown}")
  expect(menuItem).toHaveFocus()
  await user.keyboard("{Enter}")
}

describe("до підсумків", () => {
  it("з поля рядка 3 до знижки документа — два натискання: Ctrl і End", async () => {
    const user = userEvent.setup()
    render(<Editor virtualizeFrom={12} />)
    await user.click(within(row(3)).getByLabelText("Кількість"))
    await user.keyboard("{Control>}{End}{/Control}")
    expect(documentDiscount()).toHaveFocus()
    // У підсумках Ctrl+End лишається полю: курсор у кінець тексту.
    expect(
      fireEvent.keyDown(documentDiscount(), { key: "End", ctrlKey: true }),
    ).toBe(true)
  })

  it("пошук і «До підсумків» — від порога віртуальних рядків", async () => {
    const user = userEvent.setup()
    const { unmount } = render(<Editor virtualizeFrom={8} />)
    expect(
      screen.queryByRole("combobox", { name: "Пошук у рядках" }),
    ).not.toBeInTheDocument()
    unmount()
    render(<Editor virtualizeFrom={7} />)
    await user.click(screen.getByRole("button", { name: /До підсумків/ }))
    expect(documentDiscount()).toHaveFocus()
    expect(
      screen.getByRole("button", { name: /До підсумків/ }),
    ).toHaveAttribute("aria-keyshortcuts", "Control+End")
  })
})

describe("пошук у рядках", () => {
  it("назва розділу й текст нотатки: вибір ставить фокус у поле зі збігом", async () => {
    const user = userEvent.setup()
    render(<Editor />)
    await user.type(search(), "монтаж")
    const options = await screen.findAllByRole("option")
    expect(options.map((option) => option.textContent)).toEqual([
      "Рядок 5, Монтаж",
      "Рядок 7, Монтаж після поставки, Монтаж",
    ])
    await user.keyboard("{ArrowDown}{Enter}")
    await waitFor(() => {
      expect(within(row(7)).getByLabelText("Нотатка")).toHaveFocus()
    })
    // Запит лишається: наступний збіг — з того самого списку.
    expect(search()).toHaveValue("монтаж")
  })

  it("номер рядка — першим, фокус на перше поле рядка", async () => {
    const user = userEvent.setup()
    render(<Editor />)
    await user.type(search(), "6")
    const [first] = await screen.findAllByRole("option")
    expect(first).toHaveTextContent("Рядок 6, Встановлення")
    await user.keyboard("{Enter}")
    await waitFor(() => {
      expect(within(row(6)).getByLabelText("Назва")).toHaveFocus()
    })
  })

  it("⌘F у рядках ставить курсор у пошук, у самому пошуку — пошук браузера", async () => {
    const user = userEvent.setup()
    render(<Editor />)
    await user.click(within(row(2)).getByLabelText("Розділ"))
    await user.keyboard("{Meta>}f{/Meta}")
    expect(search()).toHaveFocus()
    expect(fireEvent.keyDown(search(), { key: "f", metaKey: true })).toBe(true)
  })

  it("до порога ⌘F лишається браузеру: усі рядки в DOM", () => {
    render(<Editor virtualizeFrom={12} />)
    const name = within(row(1)).getByLabelText("Назва")
    expect(fireEvent.keyDown(name, { key: "f", ctrlKey: true })).toBe(true)
  })

  it("Enter без збігу не відправляє форму документа", async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<Editor onSubmit={onSubmit} />)
    await user.type(search(), "немає такого")
    expect(await screen.findByText("Нічого не знайдено")).toBeInTheDocument()
    await user.keyboard("{Enter}")
    expect(search()).toHaveFocus()
    expect(onSubmit).not.toHaveBeenCalled()
  })
})

describe("перенесення розділу з рядками", () => {
  it("вгору й назад, фокус іде за розділом", async () => {
    const user = userEvent.setup()
    render(<Editor virtualizeFrom={12} />)
    await rowAction(user, 5, "Перенести розділ із рядками вище")
    await waitFor(() => {
      expect(
        within(row(2)).getByRole("button", { name: "Дії: Рядок 2" }),
      ).toHaveFocus()
    })
    expect(titleOf(2)).toBe("Монтаж")
    expect(within(row(4)).getByLabelText("Нотатка")).toHaveValue(
      "Монтаж після поставки",
    )
    expect(titleOf(5)).toBe("Обладнання")
    // Рядок до першого розділу лишається на місці: «Монтаж» тепер перший розділ.
    expect(within(row(1)).getByLabelText("Назва")).toHaveValue("Кабель")

    await rowAction(user, 2, "Перенести розділ із рядками нижче")
    await waitFor(() => {
      expect(
        within(row(5)).getByRole("button", { name: "Дії: Рядок 5" }),
      ).toHaveFocus()
    })
    expect(titleOf(2)).toBe("Обладнання")
    expect(titleOf(5)).toBe("Монтаж")
    expect(within(row(7)).getByLabelText("Нотатка")).toHaveValue(
      "Монтаж після поставки",
    )
  })

  it("розділ стає поза екраном віртуальних рядків — рядок з'являється, фокус іде за ним", async () => {
    const user = userEvent.setup()
    const items = (prefix: string) =>
      Array.from({ length: 14 }, (_, index) =>
        item(`${prefix}${String(index)}`, `${prefix} ${String(index)}`),
      )
    render(
      <Editor
        lines={[
          section("a", "Перший"),
          ...items("Товар"),
          section("b", "Другий"),
          ...items("Послуга"),
        ]}
      />,
    )
    // 12 рядків по 64 px на екрані й один нижче: рядка 16 у DOM немає.
    expect(
      screen.queryByRole("group", { name: "Рядок 16" }),
    ).not.toBeInTheDocument()
    await rowAction(user, 1, "Перенести розділ із рядками нижче")
    await waitFor(() => {
      expect(
        within(row(16)).getByRole("button", { name: "Дії: Рядок 16" }),
      ).toHaveFocus()
    })
    expect(titleOf(16)).toBe("Перший")
  })

  it("перший розділ вище й останній нижче не переносяться; у рядка товару пунктів немає", async () => {
    const user = userEvent.setup()
    render(<Editor virtualizeFrom={12} />)
    within(row(2)).getByRole("button", { name: "Дії: Рядок 2" }).focus()
    await user.keyboard("{Enter}")
    expect(
      await screen.findByRole("menuitem", {
        name: "Перенести розділ із рядками вище",
      }),
    ).toHaveAttribute("aria-disabled", "true")
    expect(
      screen.getByRole("menuitem", {
        name: "Перенести розділ із рядками нижче",
      }),
    ).not.toHaveAttribute("aria-disabled")
    await user.keyboard("{Escape}")

    within(row(5)).getByRole("button", { name: "Дії: Рядок 5" }).focus()
    await user.keyboard("{Enter}")
    expect(
      await screen.findByRole("menuitem", {
        name: "Перенести розділ із рядками нижче",
      }),
    ).toHaveAttribute("aria-disabled", "true")
    await user.keyboard("{Escape}")

    within(row(3)).getByRole("button", { name: "Дії: Рядок 3" }).focus()
    await user.keyboard("{Enter}")
    await screen.findByRole("menuitem", { name: "Підняти" })
    expect(
      screen.queryByRole("menuitem", {
        name: "Перенести розділ із рядками вище",
      }),
    ).not.toBeInTheDocument()
  })
})

describe("групи рядків і пошук: чисті функції", () => {
  const kinds = (lines: readonly DocumentBodyLine[]) =>
    lines.map((line) => line.id)
  /** Застосовує перенесення так, як `move` форми. */
  const apply = (lines: DocumentBodyLine[], head: number, up: boolean) => {
    const heads = groupHeadsOf(lines, (line) => line.kind === "section")
    const plan = rowGroupMove(heads, lines.length, head, up ? "up" : "down")
    const result = [...lines]
    for (const [from, to] of plan?.moves ?? []) {
      const [moved] = result.splice(from, 1)
      if (moved) result.splice(to, 0, moved)
    }
    return { result, plan }
  }

  it("групи міняються місцями, рядок до першої групи лишається; переноситься менша група", () => {
    const up = apply(LINES, 4, true)
    expect(kinds(up.result)).toEqual(["1", "s2", "4", "n1", "s1", "2", "3"])
    expect(up.plan).toMatchObject({ head: 1, size: 3 })
    expect(up.plan?.moves).toHaveLength(3)
    const down = apply(up.result, 1, false)
    expect(kinds(down.result)).toEqual(kinds(LINES))
    expect(down.plan?.head).toBe(4)
    // Порожній розділ (лише заголовок) переноситься одним кроком.
    const empty = [section("a", "A"), item("x", "X"), item("y", "Y")]
    const lonely = apply([...empty, section("b", "B")], 3, true)
    expect(kinds(lonely.result)).toEqual(["b", "a", "x", "y"])
    expect(lonely.plan?.moves).toHaveLength(1)
  })

  it("без сусідньої групи — null", () => {
    const heads = groupHeadsOf(LINES, (line) => line.kind === "section")
    expect(heads).toEqual([1, 4])
    expect(rowGroupMove(heads, LINES.length, 1, "up")).toBeNull()
    expect(rowGroupMove(heads, LINES.length, 4, "down")).toBeNull()
    expect(rowGroupMove(heads, LINES.length, 2, "up")).toBeNull()
  })

  it("пошук: номер рядка першим, розділ рядка, межа списку й кількість усіх збігів", () => {
    const contains = (text: string, query: string) =>
      text.toLocaleLowerCase("uk").includes(query.toLocaleLowerCase("uk"))
    expect(findDocumentLines(LINES, "  ", contains)).toEqual({
      matches: [],
      total: 0,
    })
    const found = findDocumentLines(LINES, "МОНТАЖ", contains)
    expect(
      found.matches.map(({ index, field, section: own }) => [
        index,
        field,
        own,
      ]),
    ).toEqual([
      [4, "title", null],
      [6, "text", "Монтаж"],
    ])
    expect(findDocumentLines(LINES, "3", contains).matches[0]).toEqual({
      index: 2,
      field: null,
      text: "Кавоварка",
      section: "Обладнання",
    })
    expect(findDocumentLines(LINES, "99", contains)).toEqual({
      matches: [],
      total: 0,
    })
    const many = Array.from({ length: 60 }, (_, index) =>
      item(String(index), "Кабель"),
    )
    const limited = findDocumentLines(many, "кабель", contains)
    expect(limited.matches).toHaveLength(50)
    expect(limited.total).toBe(60)
  })
})
