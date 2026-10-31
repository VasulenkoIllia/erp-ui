import * as React from "react"

import type { StepperStep } from "@/registry/erp/stepper"
import type { WizardProgress } from "@/registry/lib/wizard-progress"

/**
 * Стан майстра UI06 окремо від розкладки (`templates/wizard`, ADR-0043): поточний крок, найдальший
 * відкритий, перехід далі з перевіркою чи збереженням кроку, помилка з повтором.
 *
 * - `onNext` кроку — перевірка чи запис на сервер: `false` лишає людину на кроці й позначає його
 *   помилковим, виняток показує шаблон, а введене лишається. Сервер, що зберіг крок, — це і є прогрес.
 * - `onFinish` — дія останнього кроку. Після успіху майстер нічого не робить: куди йти, вирішує
 *   сторінка.
 * - Поки йде запит, другий запит не стартує: `next` і перехід на крок нічого не роблять, тож подвійне
 *   натискання не зберігає двічі.
 * - На кроки далі за відкритий перейти не можна: їхні `onNext` ще не виконувались. Уперед у межах
 *   відкритих — через `onNext` поточного кроку, як «Далі».
 * - Після успішного `onFinish` майстер більше нічого не запускає: сторінка могла лишитись відкритою,
 *   а друге «Завершити» створило б запис ще раз. Почати спочатку — новим `key`.
 * - `locked` кроку: дія вже виконана (імпорт пішов на сервер), повернення до попередніх кроків немає,
 *   бо «Далі» повторило б її.
 * - `blocked` кроку: дані для нього застаріли (людина змінила файл), відкриті кроки закінчуються
 *   перед ним, доки «Далі» не підготує їх знову.
 */
export interface WizardStep extends StepperStep {
  /** Пояснення під заголовком кроку. */
  readonly description?: string
  readonly onNext?: () => boolean | void | Promise<boolean | void>
  /** Крок пропущено: приберіть введене на ньому, далі воно не йде. */
  readonly onSkip?: () => void
  /** Кнопка «Далі» з наслідком: «Імпортувати 120 записів» (SPEC §8.2). */
  readonly nextLabel?: string
  /** З цього кроку назад не можна: дія вже виконана. */
  readonly locked?: boolean
  /** Даних для кроку ще немає: зі степера на нього не перейти. */
  readonly blocked?: boolean
}

export interface WizardOptions {
  /** Кроки; `id` сталі, решта може змінюватись (мова, крок з'явився). */
  readonly steps: readonly WizardStep[]
  /** Збережений прогрес: сервер чи `loadWizardProgress`. Читається раз, під час монтування. */
  readonly initial?: WizardProgress
  /** Прогрес змінився: збережіть, якщо майстер має пережити перезавантаження. */
  readonly onProgress?: (progress: WizardProgress) => void
  readonly onFinish: () => void | Promise<void>
}

export interface WizardApi {
  /** Кроки з позначкою `invalid` для степера. */
  readonly steps: readonly WizardStep[]
  readonly step: WizardStep
  readonly index: number
  readonly reachedIndex: number
  readonly isFirst: boolean
  readonly isLast: boolean
  readonly busy: boolean
  /** Збій `onNext` чи `onFinish`; наступна спроба його знімає. */
  readonly error: unknown
  readonly next: () => Promise<void>
  readonly back: () => void
  /** Необов'язковий крок: далі без перевірки. */
  readonly skip: () => void
  readonly goTo: (stepId: string) => void
}

interface Position {
  readonly stepId: string
  readonly reachedIndex: number
}

function startOf(
  steps: readonly WizardStep[],
  initial: WizardProgress | undefined,
): Position {
  const last = steps.length - 1
  const saved = steps.findIndex((step) => step.id === initial?.stepId)
  if (saved < 0) return { stepId: steps[0]?.id ?? "", reachedIndex: 0 }
  // Кроків стало менше, ніж було: найдальший не виходить за межі, але й не менший за поточний.
  const reachedIndex = Math.min(
    Math.max(initial?.reachedIndex ?? 0, saved),
    last,
  )
  return { stepId: steps[saved]?.id ?? "", reachedIndex }
}

export function useWizard({
  steps,
  initial,
  onProgress,
  onFinish,
}: WizardOptions): WizardApi {
  const [position, setPosition] = React.useState(() => startOf(steps, initial))
  const [invalidIds, setInvalidIds] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  )
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<unknown>(null)
  const running = React.useRef(false)
  const finished = React.useRef(false)

  const found = steps.findIndex((item) => item.id === position.stepId)
  // Поточний крок зник зі списку: майстер продовжує з першого, а не падає.
  const index = Math.max(found, 0)
  const step = steps[index]
  if (!step) throw new Error("useWizard: steps must not be empty")
  const isLast = index === steps.length - 1
  const blockedIndex = steps.findIndex((item) => item.blocked)
  const reachedIndex =
    blockedIndex < 0
      ? position.reachedIndex
      : Math.max(Math.min(position.reachedIndex, blockedIndex - 1), index)

  const move = (target: number) => {
    const stepId = steps[target]?.id
    if (stepId === undefined) return
    const progress = {
      stepId,
      reachedIndex: Math.max(position.reachedIndex, target),
    }
    setPosition(progress)
    setError(null)
    onProgress?.(progress)
  }

  const markInvalid = (invalid: boolean) => {
    setInvalidIds((current) => {
      if (current.has(step.id) === invalid) return current
      const updated = new Set(current)
      if (invalid) updated.add(step.id)
      else updated.delete(step.id)
      return updated
    })
  }

  /** `onNext` поточного кроку й дія після нього; запит один за раз. */
  const runStep = async (proceed: () => void | Promise<void>) => {
    if (running.current || finished.current) return
    running.current = true
    setBusy(true)
    setError(null)
    try {
      const passed = await step.onNext?.()
      markInvalid(passed === false)
      if (passed !== false) await proceed()
    } catch (failure) {
      setError(failure)
    } finally {
      running.current = false
      setBusy(false)
    }
  }

  const next = () =>
    runStep(async () => {
      if (!isLast) {
        move(index + 1)
        return
      }
      await onFinish()
      finished.current = true
    })

  const goTo = (stepId: string) => {
    const target = steps.findIndex((item) => item.id === stepId)
    if (running.current || target < 0 || target > reachedIndex) return
    if (step.locked && target < index) return
    if (target > index)
      void runStep(() => {
        move(target)
      })
    else move(target)
  }

  return {
    steps: steps.map((item) =>
      invalidIds.has(item.id) ? { ...item, invalid: true } : item,
    ),
    step,
    index,
    reachedIndex,
    isFirst: index === 0,
    isLast,
    busy,
    error,
    next,
    back: () => {
      if (!running.current && !step.locked) move(index - 1)
    },
    skip: () => {
      if (running.current) return
      markInvalid(false)
      step.onSkip?.()
      move(index + 1)
    },
    goTo,
  }
}
