import { zodResolver } from "@hookform/resolvers/zod"
import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { afterEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"

import { ConfirmDialog } from "@/registry/erp/confirm-dialog"
import { DateInput, TimeInput } from "@/registry/erp/date-input"
import { DateRangeInput } from "@/registry/erp/date-range-input"
import { FormErrorSummary, FormField } from "@/registry/erp/form"
import { MoneyInput, NumberInput } from "@/registry/erp/number-input"
import type { DateRange } from "@/registry/lib/dates"
import type { Money } from "@/registry/lib/format"
import { Input } from "@/registry/ui/input"

import { createDemoI18n } from "@/i18n"

const NBSP = "\u00a0"

function ControlledDate({ initial = "" }: { initial?: string }) {
  const [value, setValue] = useState(initial)
  return (
    <>
      <DateInput aria-label="Дата" value={value} onValueChange={setValue} />
      <output>{value}</output>
      <button
        type="button"
        onClick={() => {
          setValue("")
        }}
      >
        Скинути
      </button>
    </>
  )
}

describe("DateInput", () => {
  it("цифри → «13.10.2026», значення — календарна дата", async () => {
    const user = userEvent.setup()
    render(<ControlledDate />)
    const input = screen.getByRole("textbox", { name: "Дата" })
    expect(input).toHaveAttribute("placeholder", "дд.мм.рррр")
    await user.type(input, "131")
    expect(input).toHaveValue("13.1")
    expect(screen.getByRole("status")).toHaveTextContent("13.1")
    await user.type(input, "02026")
    expect(input).toHaveValue("13.10.2026")
    expect(screen.getByRole("status")).toHaveTextContent("2026-10-13")
  })

  it("неіснуюча дата лишається текстом для перевірки форми; скидання ззовні очищує поле", async () => {
    const user = userEvent.setup()
    render(<ControlledDate />)
    const input = screen.getByRole("textbox", { name: "Дата" })
    await user.type(input, "31022026")
    expect(screen.getByRole("status")).toHaveTextContent("31.02.2026")
    await user.click(screen.getByRole("button", { name: "Скинути" }))
    expect(input).toHaveValue("")
  })

  it("en-GB: «13/10/2026»", () => {
    createDemoI18n("en")
    render(<ControlledDate initial="2026-10-13" />)
    expect(screen.getByRole("textbox", { name: "Дата" })).toHaveValue(
      "13/10/2026",
    )
    expect(
      screen.getByRole("button", { name: "Choose in calendar" }),
    ).toBeInTheDocument()
  })

  it("лише читання — без кнопки календаря, поле у фокусі", async () => {
    const user = userEvent.setup()
    render(
      <DateInput
        aria-label="Дата"
        value="2026-10-13"
        readOnly
        onValueChange={() => undefined}
      />,
    )
    expect(
      screen.queryByRole("button", { name: "Вибрати в календарі" }),
    ).not.toBeInTheDocument()
    await user.tab()
    // react-hook-form фокусує в setTimeout.
    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "Дата" })).toHaveFocus()
    })
  })
})

describe("TimeInput", () => {
  it("«1430» → «14:30»", async () => {
    const user = userEvent.setup()
    function Time() {
      const [value, setValue] = useState("")
      return (
        <TimeInput aria-label="Час" value={value} onValueChange={setValue} />
      )
    }
    render(<Time />)
    const input = screen.getByRole("textbox", { name: "Час" })
    await user.type(input, "14305")
    expect(input).toHaveValue("14:30")
  })
})

describe("MoneyInput і NumberInput", () => {
  it("сума: розряди нерозривним пробілом, кома й крапка — дріб, значення в копійках", async () => {
    const user = userEvent.setup()
    const changes: (Money | null)[] = []
    function Amount() {
      const [value, setValue] = useState<Money | null>(null)
      return (
        <MoneyInput
          aria-label="Сума"
          currency="UAH"
          value={value}
          onValueChange={(next) => {
            changes.push(next)
            setValue(next)
          }}
        />
      )
    }
    render(<Amount />)
    const input = screen.getByRole("textbox", { name: "Сума" })
    expect(screen.getByText("₴")).toBeInTheDocument()
    await user.type(input, "48600.505")
    // Третій знак після коми не вводиться (у гривні 2).
    expect(input).toHaveValue(`48${NBSP}600,50`)
    expect(changes.at(-1)).toEqual({ amount: 4_860_050, currency: "UAH" })
    await user.clear(input)
    expect(changes.at(-1)).toBe(null)
  })

  it("en-GB: кома — роздільник розрядів, а не дріб", async () => {
    createDemoI18n("en")
    const user = userEvent.setup()
    const changes: (Money | null)[] = []
    function Amount() {
      const [value, setValue] = useState<Money | null>(null)
      return (
        <MoneyInput
          aria-label="Amount"
          currency="UAH"
          value={value}
          onValueChange={(next) => {
            changes.push(next)
            setValue(next)
          }}
        />
      )
    }
    render(<Amount />)
    const input = screen.getByRole("textbox", { name: "Amount" })
    await user.type(input, "1,200.50")
    expect(input).toHaveValue("1,200.50")
    expect(changes.at(-1)).toEqual({ amount: 120_050, currency: "UAH" })
  })

  it("зміна валюти на меншу точність не ламає поле", async () => {
    const user = userEvent.setup()
    function Amount() {
      const [currency, setCurrency] = useState("UAH")
      const [value, setValue] = useState<Money | null>(null)
      return (
        <>
          <MoneyInput
            aria-label="Сума"
            currency={currency}
            value={value}
            onValueChange={setValue}
          />
          <button
            type="button"
            onClick={() => {
              setCurrency("JPY")
              setValue({ amount: 100, currency: "JPY" })
            }}
          >
            JPY
          </button>
        </>
      )
    }
    render(<Amount />)
    const input = screen.getByRole("textbox", { name: "Сума" })
    await user.type(input, "100,50")
    await user.click(screen.getByRole("button", { name: "JPY" }))
    expect(input).toHaveValue("100")
    expect(input).toHaveAccessibleDescription("JPY")
  })

  it("цілих розрядів не більше 15", async () => {
    const user = userEvent.setup()
    function Amount() {
      const [value, setValue] = useState<Money | null>(null)
      return (
        <MoneyInput
          aria-label="Сума"
          currency="UAH"
          value={value}
          onValueChange={setValue}
        />
      )
    }
    render(<Amount />)
    const input = screen.getByRole("textbox", { name: "Сума" })
    await user.type(input, "12345678901234567")
    expect(input.getAttribute("value")?.replace(/\D/g, "")).toBe(
      "123456789012345",
    )
  })

  it("значення ззовні показується відформатованим", () => {
    render(
      <MoneyInput
        aria-label="Сума"
        currency="USD"
        value={{ amount: 120_000, currency: "USD" }}
        onValueChange={() => undefined}
      />,
    )
    expect(screen.getByRole("textbox", { name: "Сума" })).toHaveValue(
      `1${NBSP}200,00`,
    )
    expect(screen.getByText("USD")).toBeInTheDocument()
  })

  it("ціле число не приймає дробу; одиниця — поруч", async () => {
    const user = userEvent.setup()
    function Quantity() {
      const [value, setValue] = useState<number | null>(null)
      return (
        <>
          <NumberInput
            aria-label="Кількість"
            unit="шт."
            value={value}
            onValueChange={setValue}
          />
          <output>{String(value)}</output>
        </>
      )
    }
    render(<Quantity />)
    await user.type(screen.getByRole("textbox", { name: "Кількість" }), "12,5")
    expect(screen.getByRole("status")).toHaveTextContent("125")
    expect(screen.getByText("шт.")).toBeInTheDocument()
  })
})

describe("ConfirmDialog", () => {
  it("рівень 3: без слова дія не виконується, зі словом — виконується", async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(
      <ConfirmDialog
        open
        title="Видалити компанію?"
        description="Відновити не вийде."
        confirmLabel="Видалити назавжди"
        confirmWord="ВИДАЛИТИ"
        destructive
        onClose={() => undefined}
        onConfirm={onConfirm}
      />,
    )
    expect(screen.getByRole("alertdialog")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Видалити назавжди" }))
    expect(onConfirm).not.toHaveBeenCalled()
    expect(
      screen.getByText("Введіть «ВИДАЛИТИ» точно, як написано"),
    ).toBeInTheDocument()
    const word = screen.getByLabelText("Щоб підтвердити, введіть «ВИДАЛИТИ»")
    expect(word).toHaveFocus()
    await user.type(word, "ВИДАЛИТИ")
    await user.click(screen.getByRole("button", { name: "Видалити назавжди" }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it("поки дія триває, Enter у полі слова її не повторює", async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn(() => new Promise<void>(() => undefined))
    render(
      <ConfirmDialog
        open
        title="Видалити компанію?"
        description="Відновити не вийде."
        confirmLabel="Видалити назавжди"
        confirmWord="ВИДАЛИТИ"
        destructive
        onClose={() => undefined}
        onConfirm={onConfirm}
      />,
    )
    const word = screen.getByLabelText("Щоб підтвердити, введіть «ВИДАЛИТИ»")
    await user.type(word, "ВИДАЛИТИ{Enter}{Enter}{Enter}")
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(
      screen.getByRole("button", { name: "Видалити назавжди" }),
    ).toHaveAttribute("aria-busy", "true")
  })
})

describe("DateRangeInput", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  function Range({ max }: { max?: string }) {
    const [value, setValue] = useState<DateRange | null>(null)
    return (
      <>
        <DateRangeInput
          aria-label="Період"
          value={value}
          max={max}
          onValueChange={setValue}
        />
        <output aria-label="Значення">
          {value ? `${value.from}…${value.to}` : "null"}
        </output>
      </>
    )
  }

  it("у неділю підсвічено натиснутий пресет, а не перший з тим самим періодом", async () => {
    // Неділя: «Цей тиждень» і «Останні 7 днів» — той самий період.
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-10-18T12:00:00Z"))
    const user = userEvent.setup()
    render(<Range />)
    await user.click(screen.getByRole("button", { name: "Період" }))
    await user.click(screen.getByRole("button", { name: "Останні 7 днів" }))
    expect(screen.getByRole("status", { name: "Значення" })).toHaveTextContent(
      "2026-10-12…2026-10-18",
    )
    await user.click(screen.getByRole("button", { name: "Період" }))
    const presets = screen.getByRole("group", { name: "Швидкий вибір" })
    expect(
      within(presets).getByRole("button", { name: "Останні 7 днів" }),
    ).toHaveAttribute("aria-pressed", "true")
    expect(
      within(presets).getByRole("button", { name: "Цей тиждень" }),
    ).toHaveAttribute("aria-pressed", "false")
  })

  it("межа max: пресет обрізано, введена дата поза межею — помилка", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-10-18T12:00:00Z"))
    const user = userEvent.setup()
    render(<Range max="2026-10-18" />)
    await user.click(screen.getByRole("button", { name: "Період" }))
    await user.click(screen.getByRole("button", { name: "Цей місяць" }))
    expect(screen.getByRole("status", { name: "Значення" })).toHaveTextContent(
      "2026-10-01…2026-10-18",
    )
    await user.click(screen.getByRole("button", { name: "Період" }))
    const to = screen.getByRole("textbox", { name: "До" })
    await user.clear(to)
    await user.type(to, "01122026")
    await user.click(screen.getByRole("button", { name: "Готово" }))
    expect(screen.getByText("Не пізніше 18.10.2026")).toBeInTheDocument()
    expect(screen.getByRole("status", { name: "Значення" })).toHaveTextContent(
      "2026-10-01…2026-10-18",
    )
  })
})

describe("ref полів для react-hook-form", () => {
  it("setFocus доходить до поля дати й суми", async () => {
    const user = userEvent.setup()
    function Demo() {
      const form = useForm<{ date: string; amount: Money | null }>({
        defaultValues: { date: "", amount: null },
      })
      return (
        <form>
          <FormField
            control={form.control}
            name="date"
            label="Дата"
            render={({ field, control }) => (
              <DateInput
                {...control}
                ref={field.ref}
                value={field.value}
                onValueChange={field.onChange}
              />
            )}
          />
          <FormField
            control={form.control}
            name="amount"
            label="Сума"
            render={({ field, control }) => (
              <MoneyInput
                {...control}
                ref={field.ref}
                currency="UAH"
                value={field.value}
                onValueChange={field.onChange}
              />
            )}
          />
          <button
            type="button"
            onClick={() => {
              form.setFocus("date")
            }}
          >
            До дати
          </button>
          <button
            type="button"
            onClick={() => {
              form.setFocus("amount")
            }}
          >
            До суми
          </button>
        </form>
      )
    }
    render(<Demo />)
    // react-hook-form фокусує в setTimeout.
    await user.click(screen.getByRole("button", { name: "До дати" }))
    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "Дата" })).toHaveFocus()
    })
    await user.click(screen.getByRole("button", { name: "До суми" }))
    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "Сума" })).toHaveFocus()
    })
  })
})

describe("FormField і FormErrorSummary", () => {
  const schema = z.object({
    name: z.string().min(1, "Заповніть це поле"),
    city: z.string().min(1, "Вкажіть місто"),
    company: z.string(),
  })

  function DemoForm() {
    const form = useForm<z.infer<typeof schema>>({
      mode: "onTouched",
      shouldFocusError: false,
      resolver: zodResolver(schema),
      defaultValues: { name: "", city: "", company: "Північний вітер" },
    })
    return (
      <form
        noValidate
        onSubmit={(event) => {
          void form.handleSubmit(() => undefined)(event)
        }}
      >
        <FormErrorSummary
          errors={form.formState.errors}
          submitCount={form.formState.submitCount}
          labels={{ name: "Ім'я", city: "Місто" }}
        />
        <FormField
          control={form.control}
          name="name"
          label="Ім'я"
          render={({ field, control }) => <Input {...control} {...field} />}
        />
        <FormField
          control={form.control}
          name="city"
          label="Місто"
          description="Де ви працюєте"
          render={({ field, control }) => <Input {...control} {...field} />}
        />
        <FormField
          control={form.control}
          name="company"
          label="Компанія"
          readOnly
          render={({ field, control }) => <Input {...control} {...field} />}
        />
        <button type="submit">Зберегти</button>
      </form>
    )
  }

  it("помилка при виході з поля, зведення після відправки з переходом до поля", async () => {
    const user = userEvent.setup()
    render(<DemoForm />)
    const name = screen.getByRole("textbox", { name: "Ім'я" })
    await user.click(name)
    await user.tab()
    expect(name).toHaveAttribute("aria-invalid", "true")
    expect(name).toHaveAccessibleDescription("Заповніть це поле")
    expect(screen.queryByText("Виправте 2 помилки")).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Зберегти" }))
    const title = await screen.findByText("Виправте 2 помилки")
    expect(title.closest("[data-slot=form-error-summary]")).toHaveFocus()
    const city = screen.getByRole("textbox", { name: "Місто" })
    expect(city).toHaveAccessibleDescription("Де ви працюєте Вкажіть місто")
    await user.click(
      screen.getByRole("button", { name: "Місто: Вкажіть місто" }),
    )
    expect(city).toHaveFocus()

    const company = screen.getByRole("textbox", { name: "Компанія" })
    expect(company).toHaveAttribute("readonly")
    expect(company).not.toBeDisabled()
  })

  it("виправлене поле зникає зі зведення без нового фокуса", async () => {
    const user = userEvent.setup()
    render(<DemoForm />)
    await user.click(screen.getByRole("button", { name: "Зберегти" }))
    await screen.findByText("Виправте 2 помилки")
    await act(async () => {
      await user.type(screen.getByRole("textbox", { name: "Ім'я" }), "Іван")
    })
    expect(screen.getByText("Виправте 1 помилку")).toBeInTheDocument()
    expect(screen.getByRole("textbox", { name: "Ім'я" })).toHaveFocus()
  })
})
