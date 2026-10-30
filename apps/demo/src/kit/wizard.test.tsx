import { act, render, renderHook, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { Stepper } from "@/registry/erp/stepper"
import { useWizard, type WizardStep } from "@/registry/hooks/use-wizard"
import { en } from "@/registry/lib/i18n-en"
import { uk } from "@/registry/lib/i18n-uk"
import {
  clearWizardProgress,
  loadWizardProgress,
  saveWizardProgress,
} from "@/registry/lib/wizard-progress"

const STEPS: WizardStep[] = [
  { id: "one", label: "Перший" },
  { id: "two", label: "Другий", optional: true },
  { id: "three", label: "Третій" },
]

const wizardOf = (
  options: Partial<Parameters<typeof useWizard>[0]> = {},
  steps = STEPS,
) => renderHook(() => useWizard({ steps, onFinish: vi.fn(), ...options }))

afterEach(() => {
  localStorage.clear()
})

describe("useWizard", () => {
  it("іде кроками й запам'ятовує найдальший", async () => {
    const onProgress = vi.fn()
    const { result } = wizardOf({ onProgress })
    expect(result.current.isFirst).toBe(true)
    await act(() => result.current.next())
    await act(() => result.current.next())
    expect(result.current.step.id).toBe("three")
    expect(result.current.isLast).toBe(true)
    act(() => {
      result.current.back()
    })
    expect(result.current.step.id).toBe("two")
    expect(result.current.reachedIndex).toBe(2)
    expect(onProgress).toHaveBeenLastCalledWith({
      stepId: "two",
      reachedIndex: 2,
    })
  })

  it("onNext із false лишає на кроці й позначає його", async () => {
    let passes = false
    const steps: WizardStep[] = [
      { id: "one", label: "Перший", onNext: () => passes },
      { id: "two", label: "Другий" },
    ]
    const { result } = wizardOf({}, steps)
    await act(() => result.current.next())
    expect(result.current.step.id).toBe("one")
    expect(result.current.steps[0]?.invalid).toBe(true)
    passes = true
    await act(() => result.current.next())
    expect(result.current.step.id).toBe("two")
    expect(result.current.steps[0]?.invalid).toBeUndefined()
  })

  it("збій лишає на кроці, а наступна спроба його знімає", async () => {
    const failure = new Error("network")
    const onFinish = vi.fn().mockRejectedValueOnce(failure)
    const { result } = wizardOf({ onFinish }, [{ id: "only", label: "Один" }])
    await act(() => result.current.next())
    expect(result.current.error).toBe(failure)
    expect(result.current.busy).toBe(false)
    await act(() => result.current.next())
    expect(result.current.error).toBeNull()
    expect(onFinish).toHaveBeenCalledTimes(2)
  })

  it("подвійне натискання не зберігає двічі", async () => {
    const onNext = vi.fn(
      () => new Promise<boolean>((resolve) => setTimeout(resolve, 0, true)),
    )
    const steps: WizardStep[] = [
      { id: "one", label: "Перший", onNext },
      { id: "two", label: "Другий" },
    ]
    const { result } = wizardOf({}, steps)
    await act(async () => {
      await Promise.all([result.current.next(), result.current.next()])
    })
    expect(onNext).toHaveBeenCalledTimes(1)
    expect(result.current.step.id).toBe("two")
  })

  it("пропуск не запускає перевірку", () => {
    const onNext = vi.fn(() => false)
    const steps: WizardStep[] = [
      { id: "one", label: "Перший", optional: true, onNext },
      { id: "two", label: "Другий" },
    ]
    const { result } = wizardOf({}, steps)
    act(() => {
      result.current.skip()
    })
    expect(onNext).not.toHaveBeenCalled()
    expect(result.current.step.id).toBe("two")
  })

  it("«Пропустити» викликає onSkip до збереження прогресу", () => {
    const calls: string[] = []
    const steps: WizardStep[] = [
      {
        id: "one",
        label: "Перший",
        optional: true,
        onSkip: () => calls.push("skip"),
      },
      { id: "two", label: "Другий" },
    ]
    const { result } = wizardOf(
      { onProgress: () => calls.push("progress") },
      steps,
    )
    act(() => {
      result.current.skip()
    })
    expect(calls).toEqual(["skip", "progress"])
  })

  it("уперед у межах відкритих — через перевірку поточного кроку", async () => {
    let passes = false
    const steps: WizardStep[] = [
      { id: "one", label: "Перший", onNext: () => passes },
      { id: "two", label: "Другий" },
    ]
    const { result } = wizardOf(
      { initial: { stepId: "one", reachedIndex: 1 } },
      steps,
    )
    await act(async () => {
      result.current.goTo("two")
      await Promise.resolve()
    })
    expect(result.current.step.id).toBe("one")
    expect(result.current.steps[0]?.invalid).toBe(true)
    passes = true
    await act(async () => {
      result.current.goTo("two")
      await Promise.resolve()
    })
    expect(result.current.step.id).toBe("two")
  })

  it("після успішного завершення друге натискання нічого не створює", async () => {
    const onFinish = vi.fn().mockResolvedValue(undefined)
    const { result } = wizardOf({ onFinish }, [{ id: "only", label: "Один" }])
    await act(() => result.current.next())
    await act(() => result.current.next())
    expect(onFinish).toHaveBeenCalledTimes(1)
  })

  it("на кроки далі за відкритий не переходить", () => {
    const { result } = wizardOf()
    act(() => {
      result.current.goTo("three")
    })
    expect(result.current.step.id).toBe("one")
  })

  it("відновлює збережений крок і не падає на зниклому", () => {
    const { result } = wizardOf({
      initial: { stepId: "two", reachedIndex: 9 },
    })
    expect(result.current.step.id).toBe("two")
    expect(result.current.reachedIndex).toBe(2)
    const gone = wizardOf({ initial: { stepId: "gone", reachedIndex: 2 } })
    expect(gone.result.current.step.id).toBe("one")
    expect(gone.result.current.reachedIndex).toBe(0)
  })

  it("без кроків кидає зрозумілу помилку", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined)
    expect(() => wizardOf({}, [])).toThrow("steps must not be empty")
    error.mockRestore()
  })
})

describe("прогрес у браузері", () => {
  it("зберігає, читає й прибирає", () => {
    saveWizardProgress("k", { stepId: "two", reachedIndex: 1, draft: { a: 1 } })
    expect(loadWizardProgress("k")).toEqual({
      stepId: "two",
      reachedIndex: 1,
      draft: { a: 1 },
    })
    clearWizardProgress("k")
    expect(loadWizardProgress("k")).toBeNull()
  })

  it("пошкоджений запис — початок спочатку", () => {
    localStorage.setItem("erp-ui:wizard:k", "{зламано")
    expect(loadWizardProgress("k")).toBeNull()
    localStorage.setItem("erp-ui:wizard:k", '{"stepId":1}')
    expect(loadWizardProgress("k")).toBeNull()
  })
})

describe("Stepper", () => {
  const steps = [
    { id: "a", label: "Реквізити" },
    { id: "b", label: "Логотип" },
    { id: "c", label: "Колеги", optional: true },
  ]

  it("показує поточний крок і текст стану, а не лише колір", () => {
    render(
      <Stepper
        steps={[{ ...steps[0], invalid: true }, steps[1], steps[2]]}
        currentId="b"
      />,
    )
    expect(document.querySelector('[aria-current="step"]')).toHaveTextContent(
      "Логотип",
    )
    expect(screen.getByText(uk.wizard.stepInvalid)).toBeInTheDocument()
    expect(screen.getByText(uk.wizard.optional)).toBeInTheDocument()
  })

  it("кнопка — лише на відкритих кроках", async () => {
    const user = userEvent.setup()
    const onStepSelect = vi.fn()
    render(
      <Stepper
        steps={steps}
        currentId="b"
        reachedIndex={1}
        onStepSelect={onStepSelect}
      />,
    )
    const buttons = screen.getAllByRole("button", { hidden: true })
    expect(buttons).toHaveLength(1)
    await user.click(buttons[0])
    expect(onStepSelect).toHaveBeenCalledWith("a")
  })
})

describe("рядки майстра", () => {
  it("ключі uk і en збігаються", () => {
    expect(Object.keys(en.wizard).sort()).toEqual(Object.keys(uk.wizard).sort())
  })
})
