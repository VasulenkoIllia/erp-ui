import * as React from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { Controller, useForm } from "react-hook-form"
import { z } from "zod"

import { FormField, keepFieldFocus } from "@/registry/erp/form"
import { useApiErrorMessage } from "@/registry/hooks/use-api-error-message"
import { isApiError } from "@/registry/lib/api"
import { useErpUiT } from "@/registry/lib/i18n"
import {
  DUPLICATE_VIEW_NAME,
  SAVED_VIEW_NAME_MAX,
} from "@/registry/lib/saved-views"
import { Alert, AlertDescription } from "@/registry/ui/alert"
import { Button } from "@/registry/ui/button"
import { Checkbox } from "@/registry/ui/checkbox"
import { DialogFooter } from "@/registry/ui/dialog"
import { Field, FieldLabel } from "@/registry/ui/field"
import { Input } from "@/registry/ui/input"
import { Spinner } from "@/registry/ui/spinner"

/**
 * Форма назви збереженого виду (ADR-0017): «Новий вид» з назвою й «Відкривати за замовчуванням»
 * або «Перейменувати вид». Діалог із заголовком навколо неї — у erp/saved-views-menu (назва діалогу
 * є, навіть коли чанк форми не завантажився); форма вантажиться окремим чанком (react-hook-form,
 * ADR-0009).
 *
 * - Форма на react-hook-form + zod (ADR-0015): назва обов'язкова, до 80 символів.
 * - Назва, яка вже є (422 `duplicate`), — помилка біля поля; інша помилка — над формою, введене
 *   не губиться.
 */

export interface SavedViewNameValues {
  name: string
  isDefault: boolean
}

export interface SavedViewNameFormProps {
  mode: "create" | "rename"
  initialName: string
  /** Зберегти; помилка лишає форму відкритою. */
  onSubmit: (values: SavedViewNameValues) => Promise<void>
  onCancel: () => void
}

export function SavedViewNameForm({
  mode,
  initialName,
  onSubmit,
  onCancel,
}: SavedViewNameFormProps) {
  const t = useErpUiT()
  const errorText = useApiErrorMessage()
  const ids = React.useId()
  const [error, setError] = React.useState<string | null>(null)
  const schema = React.useMemo(
    () =>
      z.object({
        name: z
          .string()
          .trim()
          .min(1, t("validation.required"))
          .max(
            SAVED_VIEW_NAME_MAX,
            t("savedViews.dialog.tooLong", { max: SAVED_VIEW_NAME_MAX }),
          ),
        isDefault: z.boolean(),
      }),
    [t],
  )
  const form = useForm<SavedViewNameValues>({
    mode: "onTouched",
    resolver: zodResolver(schema),
    defaultValues: { name: initialName, isDefault: false },
  })
  const { control, formState } = form

  const submit = form.handleSubmit(async (values) => {
    setError(null)
    try {
      await onSubmit(values)
    } catch (failure: unknown) {
      if (
        isApiError(failure) &&
        failure.fieldErrors?.name === DUPLICATE_VIEW_NAME
      ) {
        form.setError("name", {
          type: "server",
          message: t("savedViews.dialog.duplicate"),
        })
        return
      }
      setError(errorText(failure))
    }
  })

  return (
    <form
      className="grid gap-4"
      noValidate
      onSubmit={(event) => {
        void submit(event)
      }}
    >
      {error ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <FormField
        control={control}
        name="name"
        label={t("savedViews.dialog.name")}
        render={({ field, control: aria }) => (
          <Input {...field} {...aria} autoComplete="off" />
        )}
      />
      {mode === "create" ? (
        <Controller
          control={control}
          name="isDefault"
          render={({ field }) => (
            <Field orientation="horizontal">
              <Checkbox
                id={`${ids}-default`}
                checked={field.value}
                onCheckedChange={field.onChange}
              />
              <FieldLabel htmlFor={`${ids}-default`} className="font-normal">
                {t("savedViews.dialog.isDefault")}
              </FieldLabel>
            </Field>
          )}
        />
      ) : null}
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          onMouseDown={keepFieldFocus}
        >
          {t("savedViews.dialog.cancel")}
        </Button>
        <Button
          type="submit"
          onMouseDown={keepFieldFocus}
          disabled={formState.isSubmitting}
          focusableWhenDisabled
        >
          {formState.isSubmitting ? <Spinner aria-hidden /> : null}
          {t("savedViews.dialog.submit")}
        </Button>
      </DialogFooter>
    </form>
  )
}
