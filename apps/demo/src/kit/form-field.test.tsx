import { zodResolver } from "@hookform/resolvers/zod"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { memo, useState } from "react"
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
 * Легке з'єднання поля з формою (`hooks/use-form-field`, UI05c, ADR-0063): поле поводиться, як з
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

function RowsForm() {
  const form = useForm<Rows>({
    defaultValues: { rows: [{ price: "1" }, { price: "" }] },
    resolver: zodResolver(rowsSchema),
    mode: "onTouched",
  })
  const { fields, insert } = useFieldArray({
    control: form.control,
    name: "rows",
  })
  return (
    <form
      noValidate
      onSubmit={(event) => void form.handleSubmit(() => undefined)(event)}
    >
      {fields.map((row, index) => (
        <TextField
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

  it("вимкнена форма вимикає поле", () => {
    function DisabledForm() {
      const form = useForm<{ name: string }>({
        disabled: true,
        defaultValues: { name: "Олена" },
      })
      return <TextField form={form} name="name" label="Ім'я" />
    }
    render(<DisabledForm />)
    expect(name()).toBeDisabled()
    expect(name()).toHaveValue("Олена")
  })
})
