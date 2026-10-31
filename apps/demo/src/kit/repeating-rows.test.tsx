import { zodResolver } from "@hookform/resolvers/zod"
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useForm, type Control } from "react-hook-form"
import { afterEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"

import { FormErrorSummary, FormField } from "@/registry/erp/form"
import { KeyValueField } from "@/registry/erp/key-value-field"
import { RepeatingRows } from "@/registry/erp/repeating-rows"
import { useErpUiT } from "@/registry/lib/i18n"
import { keyValueSchema, type KeyValueRow } from "@/registry/lib/key-value"
import { Input } from "@/registry/ui/input"

/** Повторювані рядки й «ключ–значення» (UI42, ADR-0047). */
interface Values {
  items: { title: string }[]
}

const schema = z.object({
  items: z
    .array(z.object({ title: z.string().min(1, "Заповніть") }))
    .refine((items) => items.length !== 3, "Рівно три не можна"),
})

function Rows({
  initial,
  minRows,
  maxRows,
  readOnly,
  resetOnSubmit,
  onSubmit,
}: {
  initial: string[]
  minRows?: number
  maxRows?: number
  readOnly?: boolean
  resetOnSubmit?: boolean
  onSubmit?: (values: Values) => void
}) {
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { items: initial.map((title) => ({ title })) },
  })
  return (
    <form
      onSubmit={(event) =>
        void form.handleSubmit((values) => {
          onSubmit?.(values)
          if (resetOnSubmit) form.reset(values)
        })(event)
      }
    >
      <FormErrorSummary
        errors={form.formState.errors}
        labels={{ items: "Позиції" }}
        submitCount={form.formState.submitCount}
      />
      <RepeatingRows
        control={form.control}
        name="items"
        label="Позиції"
        rowLabel={(index) => `Позиція ${index + 1}`}
        addLabel="Додати позицію"
        newRow={() => ({ title: "" })}
        empty="Позицій немає"
        minRows={minRows}
        maxRows={maxRows}
        readOnly={readOnly}
        canReorder
        renderRow={({ index }) => (
          <FormField
            control={form.control}
            name={`items.${index}.title`}
            label="Назва"
            readOnly={readOnly}
            render={({ field, control }) => <Input {...field} {...control} />}
          />
        )}
      />
      <button type="submit">Зберегти</button>
    </form>
  )
}

/** Типи: поле з іншими рядками `KeyValueField` не приймає. */
export function WrongRows({ control }: { control: Control<Values> }) {
  // @ts-expect-error У `items` не `KeyValueRow[]`.
  return <KeyValueField control={control} name="items" label="Коди" />
}

const row = (name: string) => screen.getByRole("group", { name })
const titles = () =>
  screen
    .queryAllByRole("textbox")
    .map((input) => (input as HTMLInputElement).value)
const button = (name: string) => screen.getByRole("button", { name })

afterEach(cleanup)

describe("erp/repeating-rows", () => {
  it("рядки показано групами з назвою; порожньо — текст", () => {
    render(<Rows initial={["А", "Б"]} />)
    expect(within(row("Позиція 2")).getByRole("textbox")).toHaveValue("Б")
    cleanup()
    render(<Rows initial={[]} />)
    expect(screen.getByText("Позицій немає")).toBeVisible()
  })

  it("«Додати» — новий рядок із фокусом на першому полі", async () => {
    const user = userEvent.setup()
    render(<Rows initial={["А"]} />)
    await user.click(button("Додати позицію"))
    expect(titles()).toEqual(["А", ""])
    await waitFor(() => {
      expect(within(row("Позиція 2")).getByRole("textbox")).toHaveFocus()
    })
  })

  it("вилучення: фокус на сусідньому рядку, «Повернути» ставить рядок на місце", async () => {
    const user = userEvent.setup()
    render(<Rows initial={["А", "Б", "В"]} />)
    await user.click(button("Вилучити: Позиція 2"))
    expect(titles()).toEqual(["А", "В"])
    await waitFor(() => {
      expect(button("Вилучити: Позиція 2")).toHaveFocus()
    })
    expect(
      screen.getByText(/Вилучено: Позиція 2/, { selector: "p" }),
    ).toBeVisible()
    await user.click(button("Повернути"))
    expect(titles()).toEqual(["А", "Б", "В"])
    await waitFor(() => {
      expect(within(row("Позиція 2")).getByRole("textbox")).toHaveFocus()
    })
    expect(screen.queryByText(/Вилучено/)).not.toBeInTheDocument()
  })

  it("«Повернути» дає те, що було введено в рядок, а не початкове значення", async () => {
    const user = userEvent.setup()
    render(<Rows initial={["А", "Б"]} />)
    const input = within(row("Позиція 2")).getByRole("textbox")
    await user.clear(input)
    await user.type(input, "Змінено")
    await user.click(button("Вилучити: Позиція 2"))
    expect(titles()).toEqual(["А"])
    await user.click(button("Повернути"))
    expect(titles()).toEqual(["А", "Змінено"])
  })

  it("утримана клавіша не вилучає наступні рядки", () => {
    render(<Rows initial={["А", "Б"]} />)
    const remove = button("Вилучити: Позиція 1")
    expect(fireEvent.keyDown(remove, { key: "Enter", repeat: true })).toBe(
      false,
    )
    expect(fireEvent.keyDown(remove, { key: "Enter" })).toBe(true)
  })

  it("скидання форми дає нові ключі: фокус лишається в тому самому рядку", async () => {
    const user = userEvent.setup()
    render(<Rows initial={["А", "Б"]} resetOnSubmit />)
    await user.click(within(row("Позиція 2")).getByRole("textbox"))
    await user.keyboard("{Enter}")
    await waitFor(() => {
      expect(within(row("Позиція 2")).getByRole("textbox")).toHaveFocus()
    })
  })

  it("останній рядок вилучено: фокус на «Додати», «Повернути» доступне", async () => {
    const user = userEvent.setup()
    render(<Rows initial={["А"]} />)
    await user.click(button("Вилучити: Позиція 1"))
    await waitFor(() => {
      expect(button("Додати позицію")).toHaveFocus()
    })
    expect(screen.getByText("Позицій немає")).toBeVisible()
    await user.click(button("Повернути"))
    expect(titles()).toEqual(["А"])
  })

  it("наступна зміна рядків прибирає «Повернути»: воно б вставило рядок не туди", async () => {
    const user = userEvent.setup()
    render(<Rows initial={["А", "Б"]} />)
    await user.click(button("Вилучити: Позиція 1"))
    await user.click(button("Додати позицію"))
    expect(
      screen.queryByRole("button", { name: "Повернути" }),
    ).not.toBeInTheDocument()
  })

  it("порядок: рядок переходить, фокус лишається на тій самій кнопці", async () => {
    const user = userEvent.setup()
    render(<Rows initial={["А", "Б", "В"]} />)
    await user.click(button("Опустити: Позиція 1"))
    expect(titles()).toEqual(["Б", "А", "В"])
    await waitFor(() => {
      expect(button("Опустити: Позиція 2")).toHaveFocus()
    })
    await user.click(button("Підняти: Позиція 3"))
    expect(titles()).toEqual(["Б", "В", "А"])
    await waitFor(() => {
      expect(button("Підняти: Позиція 2")).toHaveFocus()
    })
  })

  it("крайні рядки: кнопка неактивна, але лишається у фокусі", () => {
    render(<Rows initial={["А", "Б"]} />)
    const up = button("Підняти: Позиція 1")
    expect(up).toHaveAttribute("aria-disabled", "true")
    expect(up).not.toBeDisabled()
    expect(button("Опустити: Позиція 2")).toHaveAttribute(
      "aria-disabled",
      "true",
    )
  })

  it("minRows: вилучити не можна; maxRows: додати не можна, причину видно", async () => {
    const user = userEvent.setup()
    render(<Rows initial={["А", "Б"]} minRows={2} maxRows={2} />)
    await user.click(button("Вилучити: Позиція 1"))
    expect(titles()).toEqual(["А", "Б"])
    const add = button("Додати позицію")
    expect(add).toHaveAttribute("aria-disabled", "true")
    expect(add).toHaveAccessibleDescription("Не більше 2 рядків")
    await user.click(add)
    expect(titles()).toEqual(["А", "Б"])
  })

  it("readOnly: поля без кнопок", () => {
    render(<Rows initial={["А"]} readOnly />)
    expect(screen.getByRole("textbox")).toHaveAttribute("readonly")
    expect(screen.queryByRole("button", { name: /Додати/ })).toBeNull()
    expect(screen.queryByRole("button", { name: /Вилучити/ })).toBeNull()
    expect(screen.queryByRole("button", { name: /Підняти/ })).toBeNull()
  })

  it("помилка групи — під рядками, зведення веде до першого поля", async () => {
    const user = userEvent.setup()
    render(<Rows initial={["А", "Б", "В"]} />)
    await user.click(button("Зберегти"))
    const message = await screen.findByText("Позиції: Рівно три не можна")
    expect(screen.getAllByText("Рівно три не можна")[0]).toBeVisible()
    expect(
      screen.getByRole("group", { name: "Позиції" }),
    ).toHaveAccessibleDescription("Рівно три не можна")
    await user.click(message)
    expect(within(row("Позиція 1")).getByRole("textbox")).toHaveFocus()
  })

  it("помилка поля рядка — у зведенні групи й біля поля з aria-invalid", async () => {
    const user = userEvent.setup()
    render(<Rows initial={["А", ""]} />)
    await user.click(button("Зберегти"))
    const message = await screen.findByRole("button", {
      name: "Позиції: Заповніть",
    })
    await user.click(message)
    const field = within(row("Позиція 2")).getByRole("textbox")
    expect(field).toHaveFocus()
    expect(field).toHaveAttribute("aria-invalid", "true")
  })

  it("після зміни порядку відправляються значення в новому порядку", async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<Rows initial={["А", "Б"]} onSubmit={onSubmit} />)
    await user.click(button("Опустити: Позиція 1"))
    await user.click(button("Зберегти"))
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        items: [{ title: "Б" }, { title: "А" }],
      })
    })
  })
})

function Pairs({
  rows,
  maxRows,
  onSubmit,
}: {
  rows: KeyValueRow[]
  maxRows?: number
  onSubmit?: (rows: KeyValueRow[]) => void
}) {
  const t = useErpUiT()
  const form = useForm<{ codes: KeyValueRow[] }>({
    resolver: zodResolver(
      z.object({
        codes: keyValueSchema({
          required: t("validation.required"),
          duplicate: t("keyValue.duplicate"),
          tooLong: t("keyValue.tooLong"),
        }),
      }),
    ),
    defaultValues: { codes: rows },
  })
  return (
    <form
      onSubmit={(event) =>
        void form.handleSubmit((values) => onSubmit?.(values.codes))(event)
      }
    >
      <KeyValueField
        control={form.control}
        name="codes"
        label="Коди"
        keyLabel="Система"
        valueLabel="Код"
        maxRows={maxRows}
      />
      <button type="submit">Зберегти</button>
    </form>
  )
}

describe("erp/key-value-field", () => {
  it("порожньо — текст; рядок із двома підписаними полями", async () => {
    const user = userEvent.setup()
    render(<Pairs rows={[]} />)
    expect(screen.getByText("Рядків ще немає")).toBeVisible()
    await user.click(button("Додати рядок"))
    expect(screen.getByLabelText("Система")).toHaveFocus()
    expect(screen.getByLabelText("Код")).toBeVisible()
  })

  it("дублікат ключа — помилка біля другого ключа", async () => {
    const user = userEvent.setup()
    render(
      <Pairs
        rows={[
          { key: "1С", value: "1" },
          { key: "1с", value: "2" },
        ]}
      />,
    )
    await user.click(button("Зберегти"))
    expect(await screen.findByText("Такий ключ уже є")).toBeVisible()
    const keys = screen.getAllByLabelText("Система")
    expect(keys[0]).not.toHaveAttribute("aria-invalid")
    expect(keys[1]).toHaveAttribute("aria-invalid", "true")
  })

  it("межа рядків", () => {
    render(<Pairs rows={[{ key: "a", value: "1" }]} maxRows={1} />)
    expect(button("Додати рядок")).toHaveAttribute("aria-disabled", "true")
    expect(screen.getByText("Не більше 1 рядка")).toBeVisible()
  })
})
