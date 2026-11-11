import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { StrictMode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ChallengeForm } from "@/registry/erp/challenge-form"
import { ApiError } from "@/registry/lib/api"
import type { Challenge } from "@/registry/lib/auth"

/**
 * Другий крок входу кодом з SMS (WebOTP): Chrome на Android сам читає код, і форма відправляє його один раз,
 * зі станом «Запам'ятати пристрій» на момент коду, а не на момент, коли метод став SMS. Код іншої довжини
 * не ставиться; після «Надіслати код ще раз» читається код нової SMS; поки запит коду триває, другий не йде.
 */
const SMS: Challenge = {
  methods: ["sms", "totp"],
  method: "sms",
  destination: "+380 •• ••• 45",
  codeLength: 6,
  secondFactor: true,
}

const INVALID_CODE = new ApiError(422, {
  code: "validation",
  message: "invalid",
  fieldErrors: { code: "invalid" },
})

/** «Браузер» з WebOTP: кожен запит коду чекає, доки тест покличе `deliver`. */
function stubWebOtp() {
  const pending: { resolve: (code: string) => void; signal: AbortSignal }[] = []
  vi.stubGlobal("OTPCredential", class {})
  Object.defineProperty(navigator, "credentials", {
    configurable: true,
    value: {
      get: vi.fn(
        ({ signal }: { signal: AbortSignal }) =>
          new Promise<{ code: string }>((resolve) => {
            pending.push({ resolve: (code) => resolve({ code }), signal })
          }),
      ),
    },
  })
  return {
    /** SMS прийшла: відповідають усі запити, і скасовані теж — форма має їх відкинути сама. */
    deliver: async (code: string) => {
      await act(async () => {
        for (const request of pending.splice(0)) request.resolve(code)
        await Promise.resolve()
      })
    },
    /** Запити коду, які ще чекають і не скасовані. */
    waiting: () => pending.filter(({ signal }) => !signal.aborted).length,
  }
}

/** Відповідь сервера на код, яку тест віддає, коли треба. */
function deferredServer() {
  const answers: { resolve: () => void; reject: (error: unknown) => void }[] =
    []
  const onVerify = vi.fn<
    (method: string, code: string, trust: boolean) => Promise<void>
  >(
    () =>
      new Promise<void>((resolve, reject) => {
        answers.push({ resolve, reject })
      }),
  )
  return {
    onVerify,
    answer: async (error?: unknown) => {
      await act(async () => {
        const next = answers.shift()
        if (error === undefined) next?.resolve()
        else next?.reject(error)
        await Promise.resolve()
      })
    },
  }
}

function renderForm(onVerify: ReturnType<typeof deferredServer>["onVerify"]) {
  render(
    <StrictMode>
      <ChallengeForm
        challenge={SMS}
        onVerify={onVerify}
        onSend={vi.fn(() => Promise.resolve(SMS))}
        trustedDeviceDays={30}
      />
    </StrictMode>,
  )
}

const trustBox = () =>
  screen.getByRole("checkbox", { name: /Запам'ятати цей пристрій/u })

describe("ChallengeForm: код з SMS (WebOTP)", () => {
  beforeEach(() => {
    // Поле коду (input-otp) у фокусі шукає кнопку менеджера паролів поруч: у jsdom цього методу немає.
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: () => null,
    })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    Reflect.deleteProperty(navigator, "credentials")
    Reflect.deleteProperty(document, "elementFromPoint")
  })

  it("код іде на сервер один раз і з позначкою, поставленою до коду", async () => {
    const sms = stubWebOtp()
    const server = deferredServer()
    const user = userEvent.setup()
    renderForm(server.onVerify)
    await user.click(trustBox())
    await sms.deliver("123456")
    await waitFor(() => {
      expect(server.onVerify).toHaveBeenCalled()
    })
    await server.answer()
    expect(server.onVerify.mock.calls).toEqual([["sms", "123456", true]])
  })

  it("позначку поставили й зняли до коду — пристрій не запам'ятовується", async () => {
    const sms = stubWebOtp()
    const server = deferredServer()
    const user = userEvent.setup()
    renderForm(server.onVerify)
    await user.click(trustBox())
    await user.click(trustBox())
    await sms.deliver("654321")
    await waitFor(() => {
      expect(server.onVerify).toHaveBeenCalled()
    })
    await server.answer()
    expect(server.onVerify.mock.calls).toEqual([["sms", "654321", false]])
  })

  it("код іншої довжини не ставиться й не відправляється", async () => {
    const sms = stubWebOtp()
    const server = deferredServer()
    renderForm(server.onVerify)
    await sms.deliver("12345")
    expect(screen.getByRole("textbox")).toHaveValue("")
    expect(server.onVerify).not.toHaveBeenCalled()
  })

  it("код не підійшов, «Надіслати код ще раз» — читається й відправляється код нової SMS", async () => {
    const sms = stubWebOtp()
    const server = deferredServer()
    const user = userEvent.setup()
    renderForm(server.onVerify)
    await sms.deliver("111111")
    await waitFor(() => {
      expect(server.onVerify).toHaveBeenCalledTimes(1)
    })
    await server.answer(INVALID_CODE)
    await user.click(
      await screen.findByRole("button", { name: "Надіслати код ще раз" }),
    )
    await waitFor(() => {
      expect(sms.waiting()).toBe(1)
    })
    await sms.deliver("222222")
    await waitFor(() => {
      expect(server.onVerify).toHaveBeenCalledTimes(2)
    })
    expect(server.onVerify.mock.calls[1]).toEqual(["sms", "222222", false])
  })

  it("введений код і Enter, поки запит триває, — один запит; після помилки той самий код іде знову", async () => {
    stubWebOtp()
    const server = deferredServer()
    const user = userEvent.setup()
    renderForm(server.onVerify)
    await user.click(screen.getByRole("textbox"))
    // Шоста цифра — `onComplete` поля, Enter — відправка форми: разом один запит.
    await user.keyboard("333333{Enter}")
    await waitFor(() => {
      expect(server.onVerify).toHaveBeenCalledTimes(1)
    })
    await server.answer(INVALID_CODE)
    expect(
      await screen.findByText("Код не підходить. Перевірте й спробуйте ще раз"),
    ).toBeVisible()
    await user.keyboard("333333")
    await waitFor(() => {
      expect(server.onVerify).toHaveBeenCalledTimes(2)
    })
    expect(server.onVerify.mock.calls).toEqual([
      ["sms", "333333", false],
      ["sms", "333333", false],
    ])
  })
})
