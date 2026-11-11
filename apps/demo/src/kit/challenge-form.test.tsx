import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ChallengeForm } from "@/registry/erp/challenge-form"
import type { Challenge } from "@/registry/lib/auth"

/**
 * Другий крок входу кодом з SMS (WebOTP): Chrome на Android сам читає код, і форма відправляє його один раз,
 * зі станом «Запам'ятати пристрій» на момент коду, а не на момент, коли метод став SMS.
 */
const SMS: Challenge = {
  methods: ["sms", "totp"],
  method: "sms",
  destination: "+380 •• ••• 45",
  codeLength: 6,
  secondFactor: true,
}

/** Код з SMS, який «браузер» віддасть, коли тест покличе `deliver`. */
function stubWebOtp() {
  let deliver: (code: string) => void = () => undefined
  const credential = new Promise<{ code: string }>((resolve) => {
    deliver = (code) => {
      resolve({ code })
    }
  })
  vi.stubGlobal("OTPCredential", class {})
  Object.defineProperty(navigator, "credentials", {
    configurable: true,
    value: { get: vi.fn(() => credential) },
  })
  return { deliver: (code: string) => deliver(code) }
}

function renderForm() {
  const onVerify = vi.fn<
    (method: string, code: string, trust: boolean) => Promise<void>
  >(() => new Promise<void>((resolve) => setTimeout(resolve, 50)))
  render(
    <ChallengeForm
      challenge={SMS}
      onVerify={onVerify}
      onSend={vi.fn(() => Promise.resolve(SMS))}
      trustedDeviceDays={30}
    />,
  )
  return onVerify
}

describe("ChallengeForm: код з SMS (WebOTP)", () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    Reflect.deleteProperty(navigator, "credentials")
  })

  it("код іде на сервер один раз і з позначкою, поставленою до коду", async () => {
    const sms = stubWebOtp()
    const user = userEvent.setup()
    const onVerify = renderForm()
    await user.click(
      screen.getByRole("checkbox", { name: /Запам'ятати цей пристрій/u }),
    )
    sms.deliver("123456")
    await waitFor(() => {
      expect(onVerify).toHaveBeenCalled()
    })
    // Друга відправка прийшла б одразу за першою: чекаємо, доки перша завершиться.
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(onVerify.mock.calls).toEqual([["sms", "123456", true]])
  })

  it("позначку поставили й зняли до коду — пристрій не запам'ятовується", async () => {
    const sms = stubWebOtp()
    const user = userEvent.setup()
    const onVerify = renderForm()
    const trust = screen.getByRole("checkbox", {
      name: /Запам'ятати цей пристрій/u,
    })
    await user.click(trust)
    await user.click(trust)
    sms.deliver("654321")
    await waitFor(() => {
      expect(onVerify).toHaveBeenCalled()
    })
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(onVerify.mock.calls).toEqual([["sms", "654321", false]])
  })
})
