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
  const { isDirty, errors, submitCount } = state.form.formState
  const labels: Readonly<Record<string, string>> = Object.fromEntries(
    items.map((item) => [item.id, item.label]),
  )
  const { ref: messageRef, message } = useFormMessage(state, labels)
  const conflictRows = useConflictFields(state, items)
  return (
    <form
      noValidate
      data-slot="record-form-page"
      onSubmit={(event) => void state.submit(event)}
      aria-busy={state.isSaving || undefined}
      className="grid gap-4"
    >
      <UnsavedChangesGuard when={isDirty} />
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
      {readOnly ? null : (
        <SaveBar
          isDirty={isDirty}
          isSaving={state.isSaving}
          onDiscard={state.discard}
        />
      )}
      <ConflictDialog
        open={state.conflict !== null}
        onOpenChange={(open) => {
          if (!open) state.dismissConflict()
        }}
        fields={conflictRows}
        onOverwrite={state.overwrite}
        onReload={state.reload}
      />
    </form>
  )
}
