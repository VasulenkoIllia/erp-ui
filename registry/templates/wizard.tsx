import * as React from "react"

import { keepFieldFocus, UnsavedChangesGuard } from "@/registry/erp/form"
import { Stepper } from "@/registry/erp/stepper"
import { useApiErrorMessage } from "@/registry/hooks/use-api-error-message"
import type { WizardApi } from "@/registry/hooks/use-wizard"
import { useErpUiT } from "@/registry/lib/i18n"
import { cn } from "@/registry/lib/utils"
import { Alert, AlertDescription } from "@/registry/ui/alert"
import { Button } from "@/registry/ui/button"
import { Spinner } from "@/registry/ui/spinner"

/**
 * Шаблон Wizard (SPEC §7, §8.2, §8.3, §9, §10; ADR-0043): рідкісні складні створення, імпорт,
 * налаштування. Стан — `hooks/use-wizard`, тут лише розкладка.
 *
 * - Склад: необов'язкова шапка (h1 і `exitLabel`), степер, заголовок кроку (h2), помилка, вміст
 *   кроку й кнопки «Назад», «Пропустити», «Далі». На останньому кроці кнопка називає наслідок
 *   (`finishLabel`, SPEC §8.2), а фінальний огляд — `WizardReview`, лише для читання.
 * - Вміст кроку — у формі шаблону: Enter у полі веде далі, тож власного `<form>` крок не має.
 *   Монтується лише поточний крок: введене тримайте над шаблоном (`useForm` одного майстра).
 * - «Далі» ніколи не вимикається через незаповнені поля (SPEC §8.3): перевірка — при натисканні,
 *   помилки біля полів. Під час запиту кнопка зайнята, але фокус лишається на ній.
 * - Після переходу фокус — на заголовку кроку (WCAG 2.4.3), і скрінрідер чує «Крок 2 з 4». Перший
 *   показ фокус не чіпає: його веде сторінка (`usePageHeading`).
 * - Збій лишає людину на кроці: повідомлення з ролю `alert`, введене на місці, «Далі» повторює.
 * - Футер не липкий: на телефоні його перекрила б нижня панель оболонки.
 */
export interface WizardProps {
  readonly wizard: WizardApi
  /** Назва сторінки (h1). Без неї шапку дає сторінка, а кроки стають під її заголовком. */
  readonly title?: string
  readonly description?: React.ReactNode
  readonly headingRef?: React.Ref<HTMLHeadingElement>
  /** Наслідок останнього кроку: «Створити філію», а не «Готово». */
  readonly finishLabel: string
  /** Вийти з майстра: «Пропустити майстер», «Зберегти й вийти». Прогрес береже сторінка. */
  readonly onExit?: () => void
  readonly exitLabel?: string
  /** Незбережене введене: питати перед виходом зі сторінки. */
  readonly dirty?: boolean
  /** Вміст поточного кроку. */
  readonly children: React.ReactNode
  readonly className?: string
}

export function Wizard({
  wizard,
  title,
  description,
  headingRef,
  finishLabel,
  onExit,
  exitLabel,
  dirty = false,
  children,
  className,
}: WizardProps) {
  const t = useErpUiT()
  const errorMessage = useApiErrorMessage()
  const stepHeading = React.useRef<HTMLHeadingElement>(null)
  const headingId = React.useId()
  const { step, error } = wizard
  const shownStep = React.useRef(step.id)
  React.useEffect(() => {
    if (shownStep.current === step.id) return
    shownStep.current = step.id
    stepHeading.current?.focus()
  }, [step.id])

  return (
    <div
      data-slot="wizard"
      className={cn("@container mx-auto w-full max-w-3xl space-y-6", className)}
    >
      {title ? (
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <h1
              ref={headingRef}
              tabIndex={-1}
              className="text-2xl font-semibold break-words focus-visible:outline-none"
            >
              {title}
            </h1>
            {description ? (
              <div className="text-muted-foreground">{description}</div>
            ) : null}
          </div>
          {onExit && exitLabel ? (
            <Button type="button" variant="ghost" onClick={onExit}>
              {exitLabel}
            </Button>
          ) : null}
        </header>
      ) : null}
      <Stepper
        steps={wizard.steps}
        currentId={step.id}
        reachedIndex={wizard.reachedIndex}
        onStepSelect={step.locked ? undefined : wizard.goTo}
      />
      <form
        noValidate
        className="space-y-6"
        onSubmit={(event) => {
          event.preventDefault()
          // Форма діалога на кроці: її подія доходить сюди крізь портал, але це не «Далі».
          if (event.target === event.currentTarget) void wizard.next()
        }}
      >
        <section aria-labelledby={headingId} className="space-y-4">
          <div className="space-y-1">
            <h2
              ref={stepHeading}
              id={headingId}
              tabIndex={-1}
              className="text-lg font-semibold break-words focus-visible:outline-none"
            >
              <span className="sr-only">
                {t("wizard.stepOf", {
                  current: wizard.index + 1,
                  total: wizard.steps.length,
                })}
                {". "}
              </span>
              {step.label}
            </h2>
            {step.description ? (
              <p className="text-sm text-muted-foreground">
                {step.description}
              </p>
            ) : null}
          </div>
          {error ? (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{errorMessage(error)}</AlertDescription>
            </Alert>
          ) : null}
          {children}
        </section>
        <div
          data-slot="wizard-footer"
          className="flex flex-wrap items-center justify-between gap-2 border-t pt-4"
        >
          {wizard.isFirst || step.locked ? (
            <span />
          ) : (
            <Button
              type="button"
              variant="outline"
              disabled={wizard.busy}
              focusableWhenDisabled
              onMouseDown={keepFieldFocus}
              onClick={wizard.back}
            >
              {t("wizard.back")}
            </Button>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            {step.optional && !wizard.isLast ? (
              <Button
                type="button"
                variant="ghost"
                disabled={wizard.busy}
                focusableWhenDisabled
                onMouseDown={keepFieldFocus}
                onClick={wizard.skip}
              >
                {t("wizard.skip")}
              </Button>
            ) : null}
            <Button
              type="submit"
              disabled={wizard.busy}
              focusableWhenDisabled
              onMouseDown={keepFieldFocus}
            >
              {wizard.busy ? <Spinner aria-hidden /> : null}
              {wizard.isLast
                ? finishLabel
                : (step.nextLabel ?? t("wizard.next"))}
            </Button>
          </div>
        </div>
      </form>
      <UnsavedChangesGuard when={dirty} />
    </div>
  )
}

export interface WizardReviewItem {
  readonly label: string
  /** Значення; порожнє — «Не вказано». */
  readonly value?: React.ReactNode
}

export interface WizardReviewSection {
  /** Крок, до якого веде «Змінити». */
  readonly stepId: string
  readonly title: string
  readonly items: readonly WizardReviewItem[]
}

/** Фінальний огляд лише для читання (SPEC §7): значення кроків і «Змінити» біля кожного. */
export function WizardReview({
  sections,
  onEdit,
}: {
  sections: readonly WizardReviewSection[]
  onEdit: (stepId: string) => void
}) {
  const t = useErpUiT()
  return (
    <div data-slot="wizard-review" className="@container space-y-6">
      {sections.map((section) => (
        <section key={section.stepId} className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-medium">{section.title}</h3>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={t("wizard.editStep", { step: section.title })}
              onClick={() => {
                onEdit(section.stepId)
              }}
            >
              {t("wizard.edit")}
            </Button>
          </div>
          <dl className="grid gap-x-4 gap-y-2 @lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            {section.items.map((item) => (
              <div key={item.label} className="contents">
                <dt className="text-sm text-muted-foreground">{item.label}</dt>
                <dd className="min-w-0 text-sm break-words">
                  {item.value === undefined ||
                  item.value === null ||
                  item.value === "" ? (
                    <span className="text-muted-foreground">
                      {t("wizard.notSet")}
                    </span>
                  ) : (
                    item.value
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  )
}
