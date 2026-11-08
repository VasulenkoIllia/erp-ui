import { zodResolver } from "@hookform/resolvers/zod"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { memo, useLayoutEffect, useState } from "react"
import {
  useFieldArray,
  useForm,
  type FieldPath,
  type FieldValues,
  type UseFormReturn,
} from "react-hook-form"
import { describe, expect, it } from "vitest"
import { z } from "zod"

import { FormField } from "@/registry/erp/form"
import { Input } from "@/registry/ui/input"

/**
 * Легке з'єднання поля з формою (`hooks/use-field-controller`, UI05c, ADR-0063): поле поводиться, як з
 * `Controller`, але не перемальовується від чужих змін. Тест — і сторож оновлень react-hook-form: хук
 * спирається на внутрішні частини `control`.
 */

function TextField<TValues extends FieldValues>({
  form,
  name,
  label,
  onRender,
}: {
  form: UseFormReturn<TValues>
  name: FieldPath<TValues>
  label: string
  onRender?: () => void
}) {
  return (
    <FormField
      control={form.control}
      name={name}
      label={label}
      render={({ field, control, fieldState }) => {
        onRender?.()
        const marks = [
          fieldState.isDirty ? "змінено" : "",
          fieldState.isTouched ? "торкнуто" : "",
        ].filter(Boolean)
        return (
          <>
            <Input {...control} {...field} value={String(field.value ?? "")} />
            <output aria-label={`Стан: ${label}`}>{marks.join(", ")}</output>
          </>
        )
      }}
    />
  )
}

/** Поле, яке форма не перемальовує, як рядок документа під `React.memo` (`erp/repeating-rows`). */
const MemoTextField = memo(TextField) as typeof TextField

const rowsSchema = z.object({
  rows: z.array(z.object({ price: z.string().min(1, "Вкажіть ціну") })),
})
type Rows = z.infer<typeof rowsSchema>

function RowsForm({
  initialRows = [{ price: "1" }, { price: "" }],
}: {
  initialRows?: Rows["rows"]
}) {
  const form = useForm<Rows>({
    defaultValues: { rows: initialRows },
    resolver: zodResolver(rowsSchema),
    mode: "onTouched",
  })
  const { fields, insert, remove } = useFieldArray({
    control: form.control,
    name: "rows",
  })
  return (
    <form
      noValidate
      onSubmit={(event) => void form.handleSubmit(() => undefined)(event)}
    >
      {fields.map((row, index) => (
        <MemoTextField
          key={row.id}
          form={form}
          name={`rows.${index}.price`}
          label={`Ціна ${String(index + 1)}`}
        />
      ))}
      <button
        type="button"
        onClick={() => {
          insert(0, { price: "5" })
        }}
      >
        Вставити вгорі
      </button>
      <button
        type="button"
        onClick={() => {
          remove(0)
        }}
      >
        Вилучити перший
      </button>
      <button type="submit">Зберегти</button>
    </form>
  )
}

const nameSchema = z.object({
  name: z.string().min(1, "Заповніть ім'я"),
  city: z.string(),
})
type Person = z.infer<typeof nameSchema>

function PersonForm({
  initialName = "Олена",
  onCity,
}: {
  initialName?: string
  onCity?: () => void
}) {
  const form = useForm<Person>({
    defaultValues: { name: initialName, city: "Київ" },
    resolver: zodResolver(nameSchema),
  })
  return (
    <form
      noValidate
      onSubmit={(event) =>
        void form.handleSubmit((values) => {
          form.reset(values)
        })(event)
      }
    >
      <MemoTextField form={form} name="name" label="Ім'я" />
      <TextField form={form} name="city" label="Місто" onRender={onCity} />
      <button
        type="button"
        onClick={() => {
          form.reset()
        }}
      >
        Скинути
      </button>
      <button
        type="button"
        onClick={() => {
          form.setFocus("name")
        }}
      >
        До імені
      </button>
      <button type="submit">Зберегти</button>
    </form>
  )
}

const name = () => screen.getByRole("textbox", { name: "Ім'я" })

describe("FormField: легке з'єднання з формою", () => {
  it("рядок, зсунутий вставкою вгорі, забирає свою помилку; фокус відправки — на полі з помилкою", async () => {
    const user = userEvent.setup()
    render(<RowsForm />)
    await user.click(screen.getByRole("button", { name: "Зберегти" }))
    const second = screen.getByRole("textbox", { name: "Ціна 2" })
    await waitFor(() => {
      expect(second).toHaveFocus()
    })
    expect(second).toHaveAccessibleDescription("Вкажіть ціну")

    await user.click(screen.getByRole("button", { name: "Вставити вгорі" }))
    const moved = screen.getByRole("textbox", { name: "Ціна 3" })
    await waitFor(() => {
      expect(moved).toHaveAccessibleDescription("Вкажіть ціну")
    })
    expect(moved).toBe(second)
    expect(screen.getByRole("textbox", { name: "Ціна 1" })).toHaveValue("5")
    expect(screen.getByRole("textbox", { name: "Ціна 1" })).not.toHaveAttribute(
      "aria-invalid",
    )
    expect(screen.getByRole("textbox", { name: "Ціна 2" })).toHaveValue("1")
  })

  it("після reset без зміни значень поле знову доступне формі: setFocus і фокус відправки", async () => {
    const user = userEvent.setup()
    // reset() замінює реєстр полів, а значення ті самі: поле, яке форма не перемальовує, має
    // зареєструватися знову саме.
    render(<PersonForm initialName="" />)
    await user.click(screen.getByRole("button", { name: "Скинути" }))
    await user.click(screen.getByRole("button", { name: "До імені" }))
    expect(name()).toHaveFocus()
    await user.click(screen.getByRole("button", { name: "Зберегти" }))
    await waitFor(() => {
      expect(name()).toHaveFocus()
    })
    expect(name()).toHaveAccessibleDescription("Заповніть ім'я")
  })

  it("помилка одного поля не перемальовує інше поле", async () => {
    const user = userEvent.setup()
    let cityRenders = 0
    render(
      <PersonForm
        onCity={() => {
          cityRenders += 1
        }}
      />,
    )
    await user.clear(name())
    const before = cityRenders
    await user.click(screen.getByRole("button", { name: "Зберегти" }))
    await waitFor(() => {
      expect(name()).toHaveAccessibleDescription("Заповніть ім'я")
    })
    expect(cityRenders).toBe(before)
  })

  it("зміна й торкання — з рендеру поля", async () => {
    const user = userEvent.setup()
    render(<PersonForm />)
    await user.type(name(), "!")
    expect(
      screen.getByRole("status", { name: "Стан: Ім'я" }),
    ).toHaveTextContent("змінено")
    await user.tab()
    expect(
      screen.getByRole("status", { name: "Стан: Ім'я" }),
    ).toHaveTextContent("змінено, торкнуто")
    expect(
      screen.getByRole("status", { name: "Стан: Місто" }),
    ).toHaveTextContent("")
  })

  it("вилучення першого рядка зсуває помилки: поле бере стан свого нового імені", async () => {
    const user = userEvent.setup()
    render(
      <RowsForm initialRows={[{ price: "" }, { price: "2" }, { price: "" }]} />,
    )
    await user.click(screen.getByRole("button", { name: "Зберегти" }))
    await waitFor(() => {
      expect(
        screen.getByRole("textbox", { name: "Ціна 3" }),
      ).toHaveAccessibleDescription("Вкажіть ціну")
    })
    await user.click(screen.getByRole("button", { name: "Вилучити перший" }))
    const first = screen.getByRole("textbox", { name: "Ціна 1" })
    const second = screen.getByRole("textbox", { name: "Ціна 2" })
    expect(first).toHaveValue("2")
    await waitFor(() => {
      expect(second).toHaveAccessibleDescription("Вкажіть ціну")
    })
    expect(first).not.toHaveAttribute("aria-invalid")
  })

  it("помилка, поставлена між рендером поля і його підпискою, з'являється одразу", async () => {
    // Ефект компонента, що стоїть раніше, іде після рендеру поля, але до його підписки.
    function SetErrorOnMount({ form }: { form: UseFormReturn<Person> }) {
      useLayoutEffect(() => {
        form.setError("name", { type: "server", message: "Таке ім'я вже є" })
      }, [form])
      return null
    }
    function EarlyErrorForm() {
      const form = useForm<Person>({
        defaultValues: { name: "Олена", city: "Київ" },
      })
      return (
        <form>
          <SetErrorOnMount form={form} />
          <MemoTextField form={form} name="name" label="Ім'я" />
        </form>
      )
    }
    render(<EarlyErrorForm />)
    await waitFor(() => {
      expect(name()).toHaveAccessibleDescription("Таке ім'я вже є")
    })
  })

  it("onChange бере значення з події, як react-hook-form: позначка, файл, дата й масив — як є", async () => {
    const user = userEvent.setup()
    type Values = { agree: boolean; scan: unknown; due: unknown; tags: unknown }
    function EventsForm() {
      const form = useForm<Values>({
        defaultValues: { agree: false, scan: null, due: null, tags: null },
      })
      const show = (value: unknown) =>
        value instanceof Date
          ? `дата ${value.toISOString().slice(0, 10)}`
          : value instanceof FileList
            ? `файл ${value[0]?.name ?? ""}`
            : JSON.stringify(value)
      return (
        <form>
          <FormField
            control={form.control}
            name="agree"
            label="Згода"
            render={({ field, control }) => (
              <>
                <input
                  {...control}
                  ref={field.ref}
                  type="checkbox"
                  checked={field.value}
                  onChange={field.onChange}
                />
                <output aria-label="Згода, значення">
                  {show(field.value)}
                </output>
              </>
            )}
          />
          <FormField
            control={form.control}
            name="scan"
            label="Скан"
            render={({ field, control }) => (
              <>
                <input
                  {...control}
                  ref={field.ref}
                  type="file"
                  onChange={field.onChange}
                />
                <output aria-label="Скан, значення">{show(field.value)}</output>
              </>
            )}
          />
          <FormField
            control={form.control}
            name="due"
            label="Строк"
            render={({ field, control }) => (
              <>
                <button
                  {...control}
                  type="button"
                  onClick={() => {
                    field.onChange(new Date("2026-11-30T00:00:00Z"))
                  }}
                >
                  Строк
                </button>
                <output aria-label="Строк, значення">
                  {show(field.value)}
                </output>
              </>
            )}
          />
          <FormField
            control={form.control}
            name="tags"
            label="Теги"
            render={({ field, control }) => (
              <>
                <button
                  {...control}
                  type="button"
                  onClick={() => {
                    field.onChange(["опт"])
                  }}
                >
                  Теги
                </button>
                <output aria-label="Теги, значення">{show(field.value)}</output>
              </>
            )}
          />
        </form>
      )
    }
    render(<EventsForm />)
    const value = (label: string) =>
      screen.getByRole("status", { name: `${label}, значення` })
    await user.click(screen.getByRole("checkbox", { name: "Згода" }))
    expect(value("Згода")).toHaveTextContent("true")
    await user.upload(
      screen.getByLabelText("Скан"),
      new File(["%PDF"], "rahunok.pdf", { type: "application/pdf" }),
    )
    expect(value("Скан")).toHaveTextContent("файл rahunok.pdf")
    await user.click(screen.getByRole("button", { name: "Строк" }))
    expect(value("Строк")).toHaveTextContent("дата 2026-11-30")
    await user.click(screen.getByRole("button", { name: "Теги" }))
    expect(value("Теги")).toHaveTextContent('["опт"]')
  })

  it("shouldUnregister: початкове значення, яке не копіюється, не валить форму", () => {
    const format = () => "1 200,00"
    function FormatForm() {
      const form = useForm<{ note: { text: string; format: () => string } }>({
        shouldUnregister: true,
        defaultValues: { note: { text: "Доставка", format } },
      })
      return (
        <FormField
          control={form.control}
          name="note"
          label="Примітка"
          render={({ field, control }) => (
            <output {...control}>{field.value.format()}</output>
          )}
        />
      )
    }
    render(<FormatForm />)
    expect(screen.getByText("1 200,00")).toBeInTheDocument()
  })

  it("форма з shouldUnregister прибирає значення поля, яке зникло", async () => {
    const user = userEvent.setup()
    function NoteForm() {
      const form = useForm<{ note: string }>({
        shouldUnregister: true,
        defaultValues: { note: "Доставка" },
      })
      const [isShown, setShown] = useState(true)
      const [values, setValues] = useState("")
      return (
        <form>
          {isShown ? (
            <TextField form={form} name="note" label="Примітка" />
          ) : null}
          <button
            type="button"
            onClick={() => {
              setShown(false)
            }}
          >
            Сховати
          </button>
          <button
            type="button"
            onClick={() => {
              setValues(JSON.stringify(form.getValues()))
            }}
          >
            Значення
          </button>
          <output aria-label="Значення форми">{values}</output>
        </form>
      )
    }
    render(<NoteForm />)
    const values = screen.getByRole("status", { name: "Значення форми" })
    expect(screen.getByRole("textbox", { name: "Примітка" })).toHaveValue(
      "Доставка",
    )
    await user.click(screen.getByRole("button", { name: "Значення" }))
    expect(values).toHaveTextContent('{"note":"Доставка"}')
    await user.click(screen.getByRole("button", { name: "Сховати" }))
    await user.click(screen.getByRole("button", { name: "Значення" }))
    expect(values).toHaveTextContent("{}")
  })

  it("вимкнена форма вимикає поле, і перемикання доходить до поля", async () => {
    const user = userEvent.setup()
    function ToggleForm() {
      const [isDisabled, setDisabled] = useState(true)
      const form = useForm<Person>({
        disabled: isDisabled,
        defaultValues: { name: "Олена", city: "Київ" },
      })
      return (
        <form>
          {/* Поле під memo читає й зміну: підписане не лише на помилку. */}
          <MemoTextField form={form} name="name" label="Ім'я" />
          <button
            type="button"
            onClick={() => {
              setDisabled((value) => !value)
            }}
          >
            Перемкнути
          </button>
        </form>
      )
    }
    render(<ToggleForm />)
    expect(name()).toBeDisabled()
    expect(name()).toHaveValue("Олена")
    await user.click(screen.getByRole("button", { name: "Перемкнути" }))
    await waitFor(() => {
      expect(name()).toBeEnabled()
    })
    await user.click(screen.getByRole("button", { name: "Перемкнути" }))
    await waitFor(() => {
      expect(name()).toBeDisabled()
    })
  })
})
