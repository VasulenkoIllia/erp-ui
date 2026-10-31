import * as React from "react"
import type { FieldValues, Path } from "react-hook-form"

import { ConfirmDialog } from "@/registry/erp/confirm-dialog"
import {
  ConflictDialog,
  type ConflictField,
} from "@/registry/erp/conflict-dialog"
import {
  FormErrorSummary,
  keepFieldFocus,
  UnsavedChangesGuard,
} from "@/registry/erp/form"
import type {
  RecordFormConflict,
  RecordFormState,
} from "@/registry/hooks/use-record-form"
import type { Keyed } from "@/registry/lib/extensions"
import { useErpUiT, type ErpUiTranslate } from "@/registry/lib/i18n"
import { Alert, AlertDescription } from "@/registry/ui/alert"
import { Button } from "@/registry/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/registry/ui/dialog"
import { FieldGroup } from "@/registry/ui/field"
import { Spinner } from "@/registry/ui/spinner"

/**
 * Форма запису в діалозі (SPEC §8.2, §8.3; ADR-0015, ADR-0026): створення й зміна запису модуля.
 *
 * - Поля — список елементів із ключами (`RecordFormItem`, ключ — ім'я поля форми): модуль зливає
 *   свої з полями розширення (`applyKeyedChanges`, `erp/extension-field-input`), а діалог розкладає
 *   їх сіткою — одна колонка на вузькому контейнері, дві на широкому (`@container`).
 * - Зведення помилок угорі після невдалої спроби (на телефоні форма довга); помилка запиту й помилки
 *   полів, яких у формі немає, — над полями з фокусом. «Зберегти» не вимикається, а поки йде запит —
 *   зайнята. Натискання кнопок не забирає фокус у поля: помилка поля не зсуває кнопку посеред кліку.
 * - Закрити зі зміненими полями (Esc, клік поза діалогом, «Скасувати») — «Закрити без збереження?»;
 *   перехід у застосунку й закриття вкладки — `UnsavedChangesGuard`. Поки йде запит, діалог не
 *   закривається: відповідь (збережено, конфлікт) інакше нікому показати.
 * - Конфлікт 409 — `ConflictDialog` зі зміненими полями: «Ваші зміни» і «Збережено зараз» текстом
 *   поля (`text`), зокрема поля розширення.
 * - Діалог змонтований, лише поки відкритий: `{editing ? <Форма /> : null}`; вкладені діалоги (форма
 *   створення з «Створити…» у виборі запису) — `children`.
 */

export interface RecordFormItemProps {
  label: string
  description?: string
  className?: string
}

export interface RecordFormItem extends Keyed {
  /** Підпис поля: у полі, у зведенні помилок і в порівнянні при конфлікті. */
  readonly label: string
  readonly description?: string
  /** На всю ширину форми. */
  readonly wide?: boolean
  /** Поле форми (`FormField`) з підписом і підказкою з цього елемента: розширення може їх змінити. */
  readonly render: (props: RecordFormItemProps) => React.ReactNode
  /**
   * Значення для порівняння при конфлікті: підпис варіанта, номер телефону, назва запису за `id`;
   * порожнє — `null`. Без нього — значення як є.
   */
  readonly text?: (value: unknown) => React.ReactNode
}

/** Що розширення змінює в полі форми модуля без заміни (`KeyedChanges<…, …, RecordFormItemChange>`). */
export type RecordFormItemChange = Pick<RecordFormItem, "label" | "description">

/** Поля форми сіткою: одна колонка на вузькому контейнері, дві — від 36rem. */
export function RecordFormFields({
  items,
}: {
  items: readonly RecordFormItem[]
}) {
  return (
    <FieldGroup className="@container">
      <div className="grid gap-4 @xl:grid-cols-2">
        {items.map(({ id, label, description, wide, render }) => (
          <React.Fragment key={id}>
            {render({
              label,
              description,
              className: wide ? "@xl:col-span-2" : undefined,
            })}
          </React.Fragment>
        ))}
      </div>
    </FieldGroup>
  )
}

function valueText(value: unknown, t: ErpUiTranslate): string | null {
  if (value === null || value === undefined || value === "") return null
  if (typeof value === "boolean") return t(value ? "common.yes" : "common.no")
  if (typeof value === "string" || typeof value === "number")
    return String(value)
  return Array.isArray(value) && value.length ? value.join(", ") : null
}

/** Рядки порівняння конфлікту: змінені поля в порядку форми. */
function conflictFields<TValues extends FieldValues>(
  conflict: RecordFormConflict<TValues>,
  mine: TValues,
  items: readonly RecordFormItem[],
  t: ErpUiTranslate,
): ConflictField[] {
  const order = (key: string) => {
    const index = items.findIndex((item) => item.id === key)
    return index < 0 ? items.length : index
  }
  return [...conflict.keys]
    .sort((a, b) => order(a) - order(b))
    .map((key) => {
      const item = items.find((candidate) => candidate.id === key)
      const show = (value: unknown) => {
        const shown = item?.text ? item.text(value) : valueText(value, t)
        return shown === null || shown === undefined || shown === ""
          ? t("recordForm.notSet")
          : shown
      }
      return {
        key,
        label: item?.label ?? key,
        mine: show(mine[key]),
        theirs: show(conflict.theirs[key]),
      }
    })
}

export interface RecordFormDialogProps<TValues extends FieldValues> {
  /** Закрити: після збереження, «Скасувати» без змін чи «Закрити без збереження». */
  readonly onClose: () => void
  readonly title: string
  readonly description?: string
  /** Підпис кнопки відправки: «Створити» чи «Зберегти». */
  readonly submitLabel: string
  /** Форма й збереження з `useRecordForm`. */
  readonly state: RecordFormState<TValues>
  readonly items: readonly RecordFormItem[]
  /**
   * Куди повернути фокус після закриття: кнопка, що відкрила діалог. Без неї — елемент у фокусі
   * під час відкриття, а Safari кнопку кліком не фокусує.
   */
  readonly finalFocus?: React.RefObject<HTMLElement | null>
  /**
   * Діалог усередині іншої форми запису: перехід охороняє зовнішня (React Router тримає один захист
   * переходу), поки вкладений відкритий.
   */
  readonly nested?: boolean
  /** Вкладені діалоги: форма створення з «Створити…» у виборі запису. */
  readonly children?: React.ReactNode
}

/** Порівняння конфлікту лишається, поки діалог зникає: інакше таблиця порожніє посеред анімації. */
export function useConflictFields<TValues extends FieldValues>(
  state: RecordFormState<TValues>,
  items: readonly RecordFormItem[],
): ConflictField[] {
  const t = useErpUiT()
  const [shown, setShown] = React.useState<{
    conflict: RecordFormConflict<TValues>
    fields: ConflictField[]
  } | null>(null)
  if (state.conflict && state.conflict !== shown?.conflict)
    setShown({
      conflict: state.conflict,
      fields: conflictFields(state.conflict, state.form.getValues(), items, t),
    })
  return shown?.fields ?? []
}

/**
 * Помилка над формою: запиту (не поля) чи полів, яких у формі немає (розширення сховало поле, а
 * сервер його не прийняв). Отримує фокус, щойно з'являється: на телефоні вона вгорі довгої форми.
 */
export function useFormMessage<TValues extends FieldValues>(
  state: RecordFormState<TValues>,
  labels: Readonly<Record<string, string>>,
) {
  const t = useErpUiT()
  const ref = React.useRef<HTMLDivElement>(null)
  const orphans = Object.keys(state.form.formState.errors).filter(
    (key) => !Object.hasOwn(labels, key),
  )
  const message =
    state.error ??
    (orphans.length
      ? t("recordForm.hiddenFields", { fields: orphans.join(", ") })
      : null)
  React.useEffect(() => {
    if (message) ref.current?.focus()
  }, [message])
  return { ref, message }
}

export function RecordFormDialog<TValues extends FieldValues>({
  onClose,
  title,
  description,
  submitLabel,
  state,
  items,
  finalFocus,
  nested = false,
  children,
}: RecordFormDialogProps<TValues>) {
  const t = useErpUiT()
  const [isConfirmingClose, setConfirmingClose] = React.useState(false)
  const { isDirty, errors, submitCount } = state.form.formState
  const requestClose = () => {
    if (state.isSaving) return
    if (isDirty) setConfirmingClose(true)
    else onClose()
  }
  // Ключ елемента — ім'я поля форми (`RecordFormItem`).
  const labels: Readonly<Record<string, string>> = Object.fromEntries(
    items.map((item) => [item.id, item.label]),
  )
  const { ref: messageRef, message } = useFormMessage(state, labels)
  const conflictRows = useConflictFields(state, items)
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) requestClose()
      }}
    >
      <DialogContent className="sm:max-w-2xl" finalFocus={finalFocus}>
        <form
          noValidate
          onSubmit={(event) => void state.submit(event)}
          aria-busy={state.isSaving || undefined}
          className="grid gap-4"
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description ? (
              <DialogDescription>{description}</DialogDescription>
            ) : null}
          </DialogHeader>
          {/* Відкритий вкладений діалог — теж незбережене введення. */}
          {nested ? null : (
            <UnsavedChangesGuard when={isDirty || children != null} />
          )}
          {message ? (
            <Alert
              ref={messageRef}
              tabIndex={-1}
              variant="destructive"
              role="alert"
            >
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          ) : null}
          <FormErrorSummary
            errors={errors}
            labels={labels as Partial<Record<Path<TValues>, string>>}
            submitCount={submitCount}
          />
          <RecordFormFields items={items} />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={requestClose}
              onMouseDown={keepFieldFocus}
              disabled={state.isSaving}
              focusableWhenDisabled
            >
              {t("recordForm.cancel")}
            </Button>
            <Button
              type="submit"
              onMouseDown={keepFieldFocus}
              disabled={state.isSaving}
              focusableWhenDisabled
            >
              {state.isSaving ? <Spinner aria-hidden /> : null}
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
        {/* Вкладені діалоги: Base UI тримає фокус у них і повертає у форму. */}
        <ConflictDialog
          open={state.conflict !== null}
          onOpenChange={(open) => {
            if (!open) state.dismissConflict()
          }}
          fields={conflictRows}
          onOverwrite={state.overwrite}
          onReload={state.reload}
        />
        <ConfirmDialog
          open={isConfirmingClose}
          title={t("recordForm.discardTitle")}
          description={t("recordForm.discardDescription")}
          confirmLabel={t("recordForm.discardConfirm")}
          cancelLabel={t("recordForm.discardCancel")}
          destructive
          onClose={() => {
            setConfirmingClose(false)
          }}
          onConfirm={() => {
            setConfirmingClose(false)
            onClose()
          }}
        />
        {children}
      </DialogContent>
    </Dialog>
  )
}
