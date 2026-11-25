import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { FormSelect } from "@/registry/erp/form-select"
import {
  LoginForm,
  SetPasswordForm,
  type AuthFormFailure,
  type LoginFormValues,
} from "@/registry/erp/login-form"

/**
 * Легкий набір (ADR-0099): форма входу для свого сервера проекту збирає поля й показує причину відмови своїм
 * текстом; запит робить проект. «Забагато спроб» із `Retry-After` тримає кнопку з відліком; поки запит іде,
 * друге натискання не відправляє вдруге. Новий пароль перевіряє мінімум проекту. FormSelect віддає число.
 */

/** Відповідь «сервера», яку тест віддає, коли треба. */
function deferredServer<T>() {
  const answers: {
    resolve: (value: AuthFormFailure | undefined) => void
    reject: (error: unknown) => void
  }[] = []
  const onSubmit = vi.fn<(values: T) => Promise<AuthFormFailure | undefined>>(
    () =>
      new Promise((resolve, reject) => {
        answers.push({ resolve, reject })
      }),
  )
  const settle = async (
    run: (answer: (typeof answers)[number]) => void,
  ): Promise<void> => {
    await act(async () => {
      const next = answers.shift()
      if (next) run(next)
      await Promise.resolve()
    })
  }
  return {
    onSubmit,
    answer: (failure?: AuthFormFailure) =>
      settle((next) => {
        next.resolve(failure)
      }),
    fail: (error: unknown) =>
      settle((next) => {
        next.reject(error)
      }),
  }
}

const loginField = () => screen.getByLabelText("Логін")
const passwordField = () => screen.getByLabelText("Пароль")
const submitButton = () => screen.getByRole("button", { name: /Увійти/u })

async function signIn(
  user: ReturnType<typeof userEvent.setup>,
  login: string,
  password: string,
) {
  await user.type(loginField(), login)
  await user.type(passwordField(), password)
  await user.click(submitButton())
}

describe("LoginForm", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("порожні поля — помилки біля полів і фокус на першому, запит не йде; введення знімає помилку", async () => {
    const server = deferredServer<LoginFormValues>()
    const user = userEvent.setup()
    render(<LoginForm onSubmit={server.onSubmit} />)
    await user.click(submitButton())
    expect(server.onSubmit).not.toHaveBeenCalled()
    expect(loginField()).toHaveAttribute("aria-invalid", "true")
    expect(loginField()).toHaveFocus()
    expect(loginField()).toHaveAccessibleDescription("Заповніть це поле")
    expect(passwordField()).toHaveAccessibleDescription("Заповніть це поле")
    await user.type(loginField(), "m")
    expect(loginField()).not.toHaveAttribute("aria-invalid")
    expect(passwordField()).toHaveAttribute("aria-invalid", "true")
    await user.click(submitButton())
    expect(passwordField()).toHaveFocus()
  })

  it("логін без пробілів на краях, пароль як є; поки запит іде й після успіху другий клік не відправляє", async () => {
    const server = deferredServer<LoginFormValues>()
    const user = userEvent.setup()
    render(<LoginForm onSubmit={server.onSubmit} />)
    await signIn(user, "  manager ", " secret ")
    await user.click(submitButton())
    expect(server.onSubmit.mock.calls).toEqual([
      [{ identifier: "manager", password: " secret " }],
    ])
    expect(submitButton()).toHaveAttribute("aria-busy", "true")
    await server.answer()
    // Успіх: проект переходить далі, а форма до того лишається зайнятою.
    expect(submitButton()).toHaveAttribute("aria-busy", "true")
    await user.click(submitButton())
    expect(server.onSubmit).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })

  it("значення — з полів форми: автозаповнення без події введення теж іде", async () => {
    const server = deferredServer<LoginFormValues>()
    const user = userEvent.setup()
    render(<LoginForm onSubmit={server.onSubmit} />)
    expect(loginField()).toHaveAttribute("name", "username")
    expect(passwordField()).toHaveAttribute("name", "password")
    ;(loginField() as HTMLInputElement).value = "manager"
    ;(passwordField() as HTMLInputElement).value = "secret"
    await user.click(submitButton())
    expect(server.onSubmit.mock.calls).toEqual([
      [{ identifier: "manager", password: "secret" }],
    ])
  })

  it("невірні дані — текст про логін, а для email — про email", async () => {
    const server = deferredServer<LoginFormValues>()
    const user = userEvent.setup()
    const { unmount } = render(<LoginForm onSubmit={server.onSubmit} />)
    await signIn(user, "manager", "wrong")
    await server.answer({ kind: "credentials" })
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Невірний логін або пароль",
    )
    unmount()
    render(<LoginForm identifier="email" onSubmit={server.onSubmit} />)
    const email = screen.getByLabelText("Email")
    expect(email).toHaveAttribute("type", "email")
    expect(email).toHaveAttribute("autocomplete", "username")
    await user.type(email, "a@demo.example")
    await user.type(passwordField(), "wrong")
    await user.click(submitButton())
    await server.answer({ kind: "credentials" })
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Невірний email або пароль",
    )
  })

  it("«Забагато спроб» із Retry-After: кнопка чекає з відліком, потім знову доступна", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const server = deferredServer<LoginFormValues>()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<LoginForm onSubmit={server.onSubmit} />)
    await signIn(user, "manager", "secret")
    await server.answer({ kind: "rateLimited", retryAfterSeconds: 30 })
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Забагато спроб. Спробуйте через 0:30",
    )
    // Кнопка лишається у фокусі (`focusableWhenDisabled`): недоступна через aria-disabled.
    expect(submitButton()).toHaveAttribute("aria-disabled", "true")
    expect(submitButton()).toHaveTextContent("0:30")
    await user.click(submitButton())
    expect(server.onSubmit).toHaveBeenCalledTimes(1)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })
    expect(submitButton()).not.toHaveAttribute("aria-disabled", "true")
    expect(submitButton()).not.toHaveTextContent("0:")
    // «Спробуйте через 0:30» уже неправда.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })

  it("«Забагато спроб» без Retry-After чи на добу — лише «Спробуйте пізніше», кнопка доступна", async () => {
    const server = deferredServer<LoginFormValues>()
    const user = userEvent.setup()
    render(<LoginForm onSubmit={server.onSubmit} />)
    await signIn(user, "manager", "secret")
    await server.answer({ kind: "rateLimited" })
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Забагато спроб. Спробуйте пізніше",
    )
    await user.click(submitButton())
    await server.answer({ kind: "rateLimited", retryAfterSeconds: 86_400 })
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Забагато спроб. Спробуйте пізніше",
    )
    expect(submitButton()).not.toHaveAttribute("aria-disabled", "true")
  })

  it("збій мережі — «Немає з'єднання», інша помилка — «Помилка сервера» (обидві в консолі), свій текст — як є, порожній — «Помилка сервера»", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {})
    const server = deferredServer<LoginFormValues>()
    const user = userEvent.setup()
    render(<LoginForm onSubmit={server.onSubmit} />)
    await signIn(user, "manager", "secret")
    await server.fail(new TypeError("Failed to fetch"))
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Немає з'єднання з сервером",
    )
    await user.click(submitButton())
    await server.fail(new Error("boom"))
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Помилка сервера. Спробуйте ще раз",
    )
    await user.click(submitButton())
    await server.answer({
      kind: "message",
      message: "Обліковий запис вимкнено",
    })
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Обліковий запис вимкнено",
    )
    await user.click(submitButton())
    await server.answer({ kind: "message", message: " " })
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Помилка сервера. Спробуйте ще раз",
    )
    expect(logged).toHaveBeenCalledTimes(2)
    expect(logged).toHaveBeenCalledWith(
      "erp-ui: sign-in request failed",
      expect.any(TypeError),
    )
    logged.mockRestore()
  })

  it("onSubmit кидає синхронно — «Помилка сервера», форма знову доступна", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {})
    const onSubmit = vi.fn<
      (values: LoginFormValues) => Promise<AuthFormFailure | undefined>
    >(() => {
      throw new Error("bad url")
    })
    const user = userEvent.setup()
    render(<LoginForm onSubmit={onSubmit} />)
    await signIn(user, "manager", "secret")
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Помилка сервера. Спробуйте ще раз",
    )
    expect(submitButton()).not.toHaveAttribute("aria-busy")
    expect(logged).toHaveBeenCalledTimes(1)
    logged.mockRestore()
  })
})

describe("SetPasswordForm", () => {
  const newPassword = () => screen.getByLabelText("Новий пароль")
  const save = () => screen.getByRole("button", { name: "Зберегти пароль" })

  it("коротший за мінімум проекту — помилка біля поля, запит не йде", async () => {
    const server = deferredServer<{ password: string }>()
    const user = userEvent.setup()
    render(<SetPasswordForm minLength={12} onSubmit={server.onSubmit} />)
    await user.click(save())
    expect(newPassword()).toHaveAccessibleDescription(/Заповніть це поле/u)
    expect(newPassword()).toHaveFocus()
    await user.type(newPassword(), "short-pass1")
    await user.click(save())
    expect(newPassword()).toHaveAccessibleDescription(/Щонайменше 12 символів/u)
    expect(server.onSubmit).not.toHaveBeenCalled()
    await user.type(newPassword(), "!")
    await user.click(save())
    expect(server.onSubmit.mock.calls).toEqual([[{ password: "short-pass1!" }]])
  })

  it("недійсне посилання — текст про посилання", async () => {
    const server = deferredServer<{ password: string }>()
    const user = userEvent.setup()
    render(<SetPasswordForm onSubmit={server.onSubmit} />)
    await user.type(newPassword(), "long enough phrase")
    await user.click(save())
    await server.answer({ kind: "linkInvalid" })
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Посилання застаріло або вже використане.",
    )
  })
})

describe("FormSelect без форми", () => {
  it("значення-число приходить числом", async () => {
    const onValueChange = vi.fn<(value: number | null) => void>()
    const user = userEvent.setup()
    render(
      <FormSelect<number | null>
        aria-label="Постачальник"
        items={[
          { value: 17, label: "Північний склад" },
          { value: 42, label: "Опт Південь" },
        ]}
        value={null}
        onValueChange={onValueChange}
      />,
    )
    await user.click(screen.getByRole("combobox", { name: "Постачальник" }))
    await user.click(await screen.findByRole("option", { name: "Опт Південь" }))
    expect(onValueChange).toHaveBeenCalledWith(42)
  })
})
