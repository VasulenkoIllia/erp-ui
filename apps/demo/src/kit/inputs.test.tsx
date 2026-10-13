import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { describe, expect, it } from "vitest"

import { PhoneInput } from "@/registry/erp/phone-input"
import { UaIdInput } from "@/registry/erp/ua-id-input"
import type { UaIdKind } from "@/registry/lib/ua-ids"

function Controlled({ kind }: { kind: UaIdKind }) {
  const [value, setValue] = useState("")
  return (
    <>
      <UaIdInput
        aria-label="Код"
        kind={kind}
        value={value}
        onValueChange={setValue}
      />
      <output>{value}</output>
    </>
  )
}

function ControlledPhone({ initial = "" }: { initial?: string }) {
  const [value, setValue] = useState(initial)
  return (
    <>
      <PhoneInput aria-label="Телефон" value={value} onValueChange={setValue} />
      <output>{value}</output>
    </>
  )
}

describe("UaIdInput", () => {
  it("ЄДРПОУ: лише цифри й не більше 8", async () => {
    const user = userEvent.setup()
    render(<Controlled kind="edrpou" />)
    const input = screen.getByRole("textbox", { name: "Код" })
    await user.type(input, "32a85-5961999")
    expect(input).toHaveValue("32855961")
    expect(screen.getByRole("status")).toHaveTextContent("32855961")
  })

  it("IBAN: «UA» додається сам, групи по 4, вставка очищується", async () => {
    const user = userEvent.setup()
    render(<Controlled kind="iban" />)
    const input = screen.getByRole("textbox", { name: "Код" })
    await user.type(input, "2132")
    expect(input).toHaveValue("UA21 32")
    await user.clear(input)
    await user.click(input)
    await user.paste("ua21 3223-1300 0002 6007 2335 6600 1")
    expect(input).toHaveValue("UA21 3223 1300 0002 6007 2335 6600 1")
    expect(screen.getByRole("status")).toHaveTextContent(
      "UA213223130000026007233566001",
    )
  })
})

describe("PhoneInput", () => {
  it("український номер без «+» стає E.164 і показується групами", async () => {
    const user = userEvent.setup()
    render(<ControlledPhone />)
    const input = screen.getByRole("textbox", { name: "Телефон" })
    await user.type(input, "0671234567")
    expect(input).toHaveValue("+380 67 123 45 67")
    expect(screen.getByRole("status")).toHaveTextContent("+380671234567")
    expect(screen.getByRole("combobox", { name: "Країна" })).toHaveTextContent(
      "UA +380",
    )
  })

  it("країна підлаштовується під введений код", async () => {
    const user = userEvent.setup()
    render(<ControlledPhone />)
    const input = screen.getByRole("textbox", { name: "Телефон" })
    await user.type(input, "+48512345678")
    expect(input).toHaveValue("+48 512 345 678")
    expect(screen.getByRole("combobox", { name: "Країна" })).toHaveTextContent(
      "PL +48",
    )
  })
})
