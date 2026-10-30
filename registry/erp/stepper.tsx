import { CheckIcon, TriangleAlertIcon } from "lucide-react"

import { useErpUiT } from "@/registry/lib/i18n"
import { cn } from "@/registry/lib/utils"
import { Button } from "@/registry/ui/button"
import { Progress } from "@/registry/ui/progress"

/**
 * Степер UI06 (SPEC §7, §9, §10; ADR-0043): де людина в покроковому сценарії. Сам нічого не зберігає,
 * стан дає `hooks/use-wizard` чи сторінка.
 *
 * - Широкий контейнер — усі кроки в ряд; вузький (`@container`) — «Крок 2 з 4» і смуга, бо назви в ряд
 *   на телефон не влазять. На вузькому назву кроку дає заголовок сторінки, а назад веде кнопка.
 * - Стан кроку видно не лише кольором: виконаний — галочка, з помилкою — знак, для скрінрідера текст.
 * - Крок, до якого вже дійшли, з `onStepSelect` — кнопка; решта — текст, у порядку Tab їх немає.
 */
export interface StepperStep {
  readonly id: string
  readonly label: string
  /** Крок можна пропустити. */
  readonly optional?: boolean
  /** На кроці є помилки. */
  readonly invalid?: boolean
}

export interface StepperProps {
  readonly steps: readonly StepperStep[]
  readonly currentId: string
  /** Найдальший відкритий крок; без нього — поточний. */
  readonly reachedIndex?: number
  readonly onStepSelect?: (stepId: string) => void
  readonly className?: string
}

export function Stepper({
  steps,
  currentId,
  reachedIndex,
  onStepSelect,
  className,
}: StepperProps) {
  const t = useErpUiT()
  const currentIndex = Math.max(
    steps.findIndex((step) => step.id === currentId),
    0,
  )
  const reached = Math.max(reachedIndex ?? currentIndex, currentIndex)
  const stepOf = t("wizard.stepOf", {
    current: currentIndex + 1,
    total: steps.length,
  })
  return (
    <div data-slot="stepper" className={cn("@container", className)}>
      <div className="space-y-2 @2xl:hidden">
        <p className="text-sm font-medium">{stepOf}</p>
        <Progress
          aria-label={stepOf}
          value={((currentIndex + 1) / steps.length) * 100}
        />
      </div>
      <ol
        aria-label={t("wizard.stepsLabel")}
        className="hidden items-start gap-2 @2xl:flex"
      >
        {steps.map((step, index) => (
          <StepItem
            key={step.id}
            step={step}
            index={index}
            isCurrent={index === currentIndex}
            isDone={index < reached && index !== currentIndex}
            canOpen={index <= reached && index !== currentIndex}
            isLast={index === steps.length - 1}
            onSelect={onStepSelect}
          />
        ))}
      </ol>
    </div>
  )
}

function StepItem({
  step,
  index,
  isCurrent,
  isDone,
  canOpen,
  isLast,
  onSelect,
}: {
  step: StepperStep
  index: number
  isCurrent: boolean
  isDone: boolean
  canOpen: boolean
  isLast: boolean
  onSelect?: (stepId: string) => void
}) {
  const t = useErpUiT()
  const content = (
    <>
      <StepMarker
        index={index}
        isCurrent={isCurrent}
        isDone={isDone}
        invalid={step.invalid}
      />
      <span className="grid min-w-0 gap-0.5 text-left">
        <span
          className={cn(
            "text-sm font-medium break-words whitespace-normal",
            !isCurrent && !isDone && "text-muted-foreground",
          )}
        >
          {step.label}
        </span>
        {step.optional ? (
          <span className="text-xs font-normal break-words whitespace-normal text-muted-foreground">
            {t("wizard.optional")}
          </span>
        ) : null}
        {step.invalid ? (
          <span className="sr-only">{t("wizard.stepInvalid")}</span>
        ) : isDone ? (
          <span className="sr-only">{t("wizard.stepDone")}</span>
        ) : null}
      </span>
    </>
  )
  return (
    <li
      aria-current={isCurrent ? "step" : undefined}
      className={cn(
        "flex min-w-0 items-start gap-2",
        isLast ? "flex-none" : "flex-1",
      )}
    >
      {canOpen && onSelect ? (
        <Button
          type="button"
          variant="ghost"
          className="h-auto min-h-control min-w-0 items-start justify-start gap-2 p-1 font-normal"
          onClick={() => {
            onSelect(step.id)
          }}
        >
          {content}
        </Button>
      ) : (
        <span className="flex min-w-0 items-start gap-2 p-1">{content}</span>
      )}
      {isLast ? null : (
        <span
          aria-hidden
          className={cn(
            "mt-5 h-px min-w-4 flex-1",
            isDone ? "bg-primary" : "bg-border",
          )}
        />
      )}
    </li>
  )
}

function StepMarker({
  index,
  isCurrent,
  isDone,
  invalid,
}: {
  index: number
  isCurrent: boolean
  isDone: boolean
  invalid?: boolean
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full border text-sm font-medium",
        invalid
          ? "border-destructive text-destructive"
          : isDone
            ? "border-primary bg-primary text-primary-foreground"
            : isCurrent
              ? "border-primary text-primary"
              : "text-muted-foreground",
      )}
    >
      {invalid ? (
        <TriangleAlertIcon className="size-4" />
      ) : isDone ? (
        <CheckIcon className="size-4" />
      ) : (
        index + 1
      )}
    </span>
  )
}
