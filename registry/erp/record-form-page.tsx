import type * as React from "react"
import type { FieldValues, Path } from "react-hook-form"

import { ConflictDialog } from "@/registry/erp/conflict-dialog"
import { FormErrorSummary, UnsavedChangesGuard } from "@/registry/erp/form"
import {
  RecordFormFields,
  useConflictFields,
  useFormMessage,
  type RecordFormItem,
} from "@/registry/erp/record-form"
import { SaveBar } from "@/registry/erp/save-bar"
import type { RecordFormState } from "@/registry/hooks/use-record-form"
import { Alert, AlertDescription } from "@/registry/ui/alert"

/**
 * Форма запису на сторінці з липкою панеллю збереження (PF11, ADR-0047): налаштування компанії, запис
 * без діалогу. Той самий `useRecordForm` і ті самі поля, що в `RecordFormDialog` (ADR-0026): зведення
 * помилок, помилка над формою, конфлікт, захист незбережених змін. Без права змінювати — `readOnly`: поля
 * лишаються для читання (передайте їм `readOnly`), панелі немає. Запис, який сторінка перечитує, передайте
 * в `useRecordForm` із `followRecord`: форма живе довше за запит.
 */
export interface RecordFormPageProps<TValues extends FieldValues> {
  readonly state: RecordFormState<TValues>
  readonly items: readonly RecordFormItem[]
  readonly readOnly?: boolean
}

export function RecordFormPage<TValues extends FieldValues>({
  state,
  items,
  readOnly = false,
}: RecordFormPageProps<TValues>) {
  const labels: Readonly<Record<string, string>> = Object.fromEntries(
    items.map((item) => [item.id, item.label]),
  )
  return (
    <RecordFormFrame
      slot="record-form-page"
      className="grid gap-4"
      state={state}
      labels={labels}
      conflictItems={items}
      readOnly={readOnly}
    >
      <RecordFormFields items={items} />
    </RecordFormFrame>
  )
}

export interface RecordFormFrameProps<TValues extends FieldValues> {
  /** `data-slot` форми: `invoice-form`, `payment-form`. */
  readonly slot: string
  readonly state: RecordFormState<TValues>
  /** Підписи полів для зведення помилок і помилок сервера: поля шапки й свої блоки форми (рядки, суми). */
  readonly labels: Readonly<Record<string, string>>
  /** Поля для порівняння при конфлікті 409; без них діалогу конфлікту немає (форма лише створює). */
  readonly conflictItems?: readonly RecordFormItem[] | undefined
  /** Лише для читання: без панелі збереження й без «Закрити без збереження?». */
  readonly readOnly?: boolean
  /** Чому форма лише для читання: смуга над полями. */
  readonly readOnlyReason?: string | undefined
  /** Підпис «Зберегти» панелі. */
  readonly submitLabel?: string | undefined
  readonly className?: string
  /** Поля й свої блоки форми (рядки документа, рахунки оплати) у порядку показу. */
  readonly children: React.ReactNode
}

const NO_ITEMS: readonly RecordFormItem[] = []

/**
 * Рамка форми запису на сторінці (ADR-0047, ADR-0086): `<form>` із захистом незбережених змін, смугою
 * «лише для читання», помилкою запиту над формою з фокусом, зведенням помилок, липкою панеллю збереження й
 * порівнянням при конфлікті. Поля — дітьми: так форма документа ставить рядки між полями й панеллю.
 */
export function RecordFormFrame<TValues extends FieldValues>({
  slot,
  state,
  labels,
  conflictItems,
  readOnly = false,
  readOnlyReason,
  submitLabel,
  className,
  children,
}: RecordFormFrameProps<TValues>) {
  const { isDirty, errors, submitCount } = state.form.formState
  const { ref: messageRef, message } = useFormMessage(state, labels)
  const conflictRows = useConflictFields(state, conflictItems ?? NO_ITEMS)
  return (
    <form
      noValidate
      data-slot={slot}
      onSubmit={(event) => void state.submit(event)}
      aria-busy={state.isSaving || undefined}
      className={className}
    >
      <UnsavedChangesGuard when={isDirty && !readOnly} />
      {readOnlyReason ? (
        <Alert>
          <AlertDescription>{readOnlyReason}</AlertDescription>
        </Alert>
      ) : null}
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
      {children}
      {readOnly ? null : (
        <SaveBar
          isDirty={isDirty}
          isSaving={state.isSaving}
          onDiscard={state.discard}
          {...(submitLabel === undefined ? {} : { submitLabel })}
        />
      )}
      {conflictItems ? (
        <ConflictDialog
          open={state.conflict !== null}
          onOpenChange={(open) => {
            if (!open) state.dismissConflict()
          }}
          fields={conflictRows}
          onOverwrite={state.overwrite}
          onReload={state.reload}
        />
      ) : null}
    </form>
  )
}
