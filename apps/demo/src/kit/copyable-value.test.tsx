import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"

import { CopyableValue } from "@/registry/erp/copyable-value"

/** Крок 1.3a (ADR-0023): значення з «Копіювати» (UI43) — показ для людини, у буфер — як зберігається. */

describe("CopyableValue", () => {
  it("IBAN: групами по 4 на екрані, у буфер — без пробілів", async () => {
    const user = userEvent.setup()
    render(
      <CopyableValue
        label="IBAN"
        kind="iban"
        value="UA21 3223 1300 0002 6007 2335 6600 1"
      />,
    )
    expect(
      screen.getByText("UA21 3223 1300 0002 6007 2335 6600 1"),
    ).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Копіювати: IBAN" }))
    expect(await navigator.clipboard.readText()).toBe(
      "UA213223130000026007233566001",
    )
    expect(screen.getByRole("status")).toHaveTextContent("Скопійовано")
  })

  it("IBAN іншої країни — як є, без підміни на UA; не схоже на IBAN — як є", async () => {
    const user = userEvent.setup()
    render(
      <>
        <CopyableValue
          label="IBAN DE"
          kind="iban"
          value="de89370400440532013000"
        />
        <CopyableValue label="IBAN ?" kind="iban" value="n/a" />
      </>,
    )
    expect(screen.getByText("DE89 3704 0044 0532 0130 00")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Копіювати: IBAN DE" }))
    expect(await navigator.clipboard.readText()).toBe("DE89370400440532013000")
    expect(screen.getByText("n/a")).toBeInTheDocument()
  })

  it("email з параметрами листа й телефон без цифр — простий текст, не посилання", () => {
    render(
      <>
        <CopyableValue
          label="Email"
          kind="email"
          value="a@b.example?bcc=x@evil.example"
        />
        <CopyableValue label="Телефон" kind="phone" value="немає" />
      </>,
    )
    expect(screen.queryByRole("link")).not.toBeInTheDocument()
    expect(
      screen.getByText("a@b.example?bcc=x@evil.example"),
    ).toBeInTheDocument()
  })

  it("телефон і email — посилання; показ телефону — від проекту, у буфер — +380…", async () => {
    const user = userEvent.setup()
    render(
      <>
        <CopyableValue
          label="Телефон"
          kind="phone"
          value="+380671204310"
          display="+380 67 120 43 10"
        />
        <CopyableValue
          label="Email"
          kind="email"
          value="office@zoria.example"
        />
      </>,
    )
    expect(
      screen.getByRole("link", { name: "+380 67 120 43 10" }),
    ).toHaveAttribute("href", "tel:+380671204310")
    expect(
      screen.getByRole("link", { name: "office@zoria.example" }),
    ).toHaveAttribute("href", "mailto:office@zoria.example")
    await user.click(screen.getByRole("button", { name: "Копіювати: Телефон" }))
    expect(await navigator.clipboard.readText()).toBe("+380671204310")
  })

  it("посилання — лише http(s) і в новій вкладці", () => {
    render(
      <>
        <CopyableValue label="Сайт" kind="url" value="https://zoria.example" />
        <CopyableValue label="Скрипт" kind="url" value="javascript:alert(1)" />
      </>,
    )
    const link = screen.getByRole("link", { name: "https://zoria.example" })
    expect(link).toHaveAttribute("target", "_blank")
    expect(link).toHaveAttribute("rel", "noopener noreferrer")
    expect(screen.getAllByRole("link")).toHaveLength(1)
    expect(screen.getByText("javascript:alert(1)")).toBeInTheDocument()
  })

  it("порожнє значення — «—» і «Не вказано» для скрінрідера, без кнопки", () => {
    render(<CopyableValue label="Факс" value="  " />)
    expect(screen.getByText("Не вказано")).toHaveClass("sr-only")
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
  })
})
