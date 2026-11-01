import * as React from "react"
import { useBlocker, useCanBlock } from "ra-core"
import {
  Controller,
  get,
  type Control,
  type ControllerFieldState,
  type ControllerRenderProps,
  type FieldErrors,
  type FieldPath,
  type FieldValues,
} from "react-hook-form"

import { ConfirmDialog } from "@/registry/erp/confirm-dialog"
import { useErpUiT } from "@/registry/lib/i18n"
import { Alert, AlertDescription, AlertTitle } from "@/registry/ui/alert"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/registry/ui/field"

/**
 * Форми кіта на react-hook-form + zod (SPEC §4, §8.2, §8.3; ADR-0015).
 *
 * - `useForm({ mode: "onTouched", resolver: zodResolver(schema) })`: перевірка при виході з поля,
 *   далі — під час виправлення, і при відправці (SPEC §8.3). Схему з текстами помилок будуйте в
 *   компоненті з `t` (`useMemo`), щоб повідомлення були мовою інтерфейсу.
 * - `FormField` — підпис над полем, підказка, помилка біля поля, id і aria для доступності.
 *   Поле без прав — `readOnly` (у фокусі й для скрінрідера), не `disabled`. Короткий список
 *   варіантів — `FormSelect` з erp/form-select (окремо: список не їде в кожну сторінку з формою).
 * - «Зберегти» ніколи не вимикається: без змін — підказка, під час запиту — зайнята кнопка
 *   (`disabled` + `focusableWhenDisabled`, щоб фокус не губився). Кнопки форми —
 *   `onMouseDown={keepFieldFocus}`: помилка поля, що з'являється при виході з нього, не зсуває
 *   кнопку посеред кліку.
 * - Довга форма — `FormErrorSummary` угорі й `useForm({ shouldFocusError: false })`: фокус іде на
 *   зведення, звідти — кнопки переходу до полів.
 * - `UnsavedChangesGuard when={isDirty}` — діалог у застосунку при переході й `beforeunload`
 *   при закритті вкладки (SPEC §8.2).
 * - Серверні помилки полів — `setError(name, { type: "server", message })`: введене не губиться.
 */

/** Пропси, які `FormField` дає полю: id, стан помилки, зв'язок із підказкою й помилкою. */
interface FormControlProps {
  id: string
  "aria-invalid"?: true
  "aria-describedby"?: string
  readOnly?: boolean
  disabled?: boolean
}

interface FormFieldProps<
  TValues extends FieldValues,
  TName extends FieldPath<TValues>,
  // Тип після zod (.transform, z.coerce): useForm<Вхід, unknown, Вихід>.
  TTransformed extends FieldValues = TValues,
> {
  control: Control<TValues, unknown, TTransformed>
  name: TName
  label: React.ReactNode
  description?: React.ReactNode
  /** Немає прав на зміну поля — read-only (SPEC §8.3). */
  readOnly?: boolean
  disabled?: boolean
  className?: string
  render: (props: {
    field: ControllerRenderProps<TValues, TName>
    fieldState: ControllerFieldState
    control: FormControlProps
    /** Для поля, яке `<label for>` не називає: `aria-labelledby` редактора тексту. */
    labelId: string
  }) => React.ReactElement
}

function FormField<
  TValues extends FieldValues,
  TName extends FieldPath<TValues>,
  TTransformed extends FieldValues = TValues,
>({
  control,
  name,
  label,
  description,
  readOnly,
  disabled,
  className,
  render,
}: FormFieldProps<TValues, TName, TTransformed>) {
  const id = React.useId()
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const invalid = fieldState.invalid
        const describedBy =
          [description ? `${id}-hint` : "", invalid ? `${id}-error` : ""]
            .filter(Boolean)
            .join(" ") || undefined
        return (
          <Field
            data-invalid={invalid ? true : undefined}
            data-field-name={name}
            className={className}
          >
            <FieldLabel id={`${id}-label`} htmlFor={id}>
              {label}
            </FieldLabel>
            {render({
              field,
              fieldState,
              labelId: `${id}-label`,
              control: {
                id,
                "aria-invalid": invalid ? true : undefined,
                "aria-describedby": describedBy,
                readOnly,
                disabled,
              },
            })}
            {description ? (
              <FieldDescription id={`${id}-hint`}>
                {description}
              </FieldDescription>
            ) : null}
            {invalid ? (
              <FieldError id={`${id}-error`}>
                {fieldState.error?.message}
              </FieldError>
            ) : null}
          </Field>
        )
      }}
    />
  )
}

/**
 * Поле з помилкою в контейнері поля форми — для переходу зі зведення помилок. Спершу
 * `aria-invalid` (у полі телефону першою стоїть кнопка країни), потім перше поле вводу.
 */
function focusField(scope: ParentNode, name: string) {
  const container = scope.querySelector<HTMLElement>(
    `[data-field-name="${CSS.escape(name)}"]`,
  )
  const control =
    container?.querySelector<HTMLElement>("[aria-invalid=true]") ??
    container?.querySelector<HTMLElement>(
      "input:not([type=hidden]), textarea, select, button, [tabindex]",
    )
  // focus() сам прокручує до поля; scroll-padding оболонки лишає його видимим під топбаром.
  control?.focus()
}

interface FormErrorSummaryProps<TValues extends FieldValues> {
  errors: FieldErrors<TValues>
  /** Поля в порядку на формі → підписи; зведення показує лише їх. */
  labels: Partial<Record<FieldPath<TValues>, string>>
  /** `formState.submitCount`: зведення з'являється після спроби відправити й отримує фокус. */
  submitCount: number
  className?: string
}

/**
 * Перший текст помилки поля. Поле з рядками (`erp/repeating-rows`) зберігає помилки вкладено: у
 * `root` чи в полях рядків. `ref` — вузол DOM, а не частина помилки.
 */
function firstErrorMessage(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined
  const { message } = error as { message?: unknown }
  if (typeof message === "string") return message
  for (const [key, value] of Object.entries(error)) {
    const nested = key === "ref" ? undefined : firstErrorMessage(value)
    if (nested) return nested
  }
  return undefined
}

/** Зведення помилок угорі довгої форми з переходом до поля (SPEC §8.3). */
function FormErrorSummary<TValues extends FieldValues>({
  errors,
  labels,
  submitCount,
  className,
}: FormErrorSummaryProps<TValues>) {
  const t = useErpUiT()
  const ref = React.useRef<HTMLDivElement>(null)
  const items = (Object.keys(labels) as FieldPath<TValues>[])
    .map((name) => ({
      name,
      label: labels[name],
      message: firstErrorMessage(get(errors, name)),
    }))
    .filter((item) => item.message)
  // Спроба, після якої помилок уже не було (успішна відправка чи все виправлено): помилка, що
  // з'явиться потім при виході з поля, зведення не відкриває — лише наступна невдала спроба.
  const [cleanAt, setCleanAt] = React.useState(0)
  if (items.length === 0 && cleanAt !== submitCount) setCleanAt(submitCount)
  const visible = items.length > 0 && submitCount > cleanAt
  const focusedFor = React.useRef(0)

  React.useEffect(() => {
    // Фокус — лише раз на кожну невдалу спробу, не під час виправлення.
    if (!visible || focusedFor.current === submitCount) return
    focusedFor.current = submitCount
    ref.current?.focus()
  }, [visible, submitCount])

  if (!visible) return null
  return (
    <Alert
      ref={ref}
      tabIndex={-1}
      variant="destructive"
      data-slot="form-error-summary"
      className={className}
    >
      <AlertTitle>
        {t("forms.errorSummary", { count: items.length })}
      </AlertTitle>
      <AlertDescription>
        <ul className="list-disc space-y-1 pl-4">
          {items.map((item) => (
            <li key={item.name}>
              {/* Кнопка, а не посилання "#поле": у застосунку з хеш-роутером якір змінив би адресу. */}
              <button
                type="button"
                className="text-left underline underline-offset-3"
                onClick={(event) => {
                  // Зведення поза <form> — шукаємо поле в документі.
                  focusField(
                    event.currentTarget.closest("form") ?? document,
                    item.name,
                  )
                }}
              >
                {item.label}: {item.message}
              </button>
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  )
}

/**
 * Незбережені зміни (SPEC §8.2): перехід у застосунку — діалог «Вийти без збереження?»,
 * закриття чи перезавантаження вкладки — запит браузера (`beforeunload`).
 * Діалог — лише з роутером, що вміє блокувати перехід (data router; ra-core створює його сам);
 * в іншому роутері лишається `beforeunload`, як у `Form` з ra-core.
 * `when` тримайте увімкненим і під час збереження: після успіху (`reset`) перехід, на який
 * чекав діалог, відбудеться сам, а збій лишить користувача на сторінці з введеним.
 * Один на сторінку: роутер перевіряє лише останній блокувальник, навіть вимкнений, тож другий
 * захист під чистою формою вимкнув би перший.
 */
function UnsavedChangesGuard({ when }: { when: boolean }) {
  const canBlock = useCanBlock()

  React.useEffect(() => {
    if (!when) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
    }
    window.addEventListener("beforeunload", warn)
    return () => {
      window.removeEventListener("beforeunload", warn)
    }
  }, [when])

  return canBlock ? <NavigationGuard when={when} /> : null
}

function NavigationGuard({ when }: { when: boolean }) {
  const t = useErpUiT()
  // Зміна лише якоря (#розділ) форму не закриває — не питаємо.
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      when &&
      (currentLocation.pathname !== nextLocation.pathname ||
        currentLocation.search !== nextLocation.search),
  )
  const blocked = blocker.state === "blocked"

  React.useEffect(() => {
    // Зміни зберегли чи скинули, поки діалог відкритий, — пропускаємо перехід.
    if (blocked && !when) blocker.proceed?.()
  }, [blocked, when, blocker])

  return (
    <ConfirmDialog
      open={blocked}
      title={t("forms.unsavedTitle")}
      description={t("forms.unsavedDescription")}
      confirmLabel={t("forms.unsavedLeave")}
      cancelLabel={t("forms.unsavedStay")}
      destructive
      onClose={() => {
        blocker.reset?.()
      }}
      onConfirm={() => {
        blocker.proceed?.()
      }}
    />
  )
}

/**
 * Кнопки форми не забирають фокус у поля при натисканні мишею: `onMouseDown={keepFieldFocus}`.
 * Поле перевіряється при виході з нього, помилка під ним зсуває кнопку між натисканням і
 * відпусканням, і перший клік губився (ADR-0026, ADR-0027). Клавіатура й дотик працюють як були.
 */
function keepFieldFocus(event: React.MouseEvent) {
  event.preventDefault()
}

export {
  FormErrorSummary,
  FormField,
  keepFieldFocus,
  UnsavedChangesGuard,
  type FormControlProps,
  type FormErrorSummaryProps,
  type FormFieldProps,
}
