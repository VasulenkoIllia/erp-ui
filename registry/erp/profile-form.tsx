"use client"

import * as React from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import {
  useAuthErrorText,
  useErpAuthProvider,
  useFieldError,
} from "@/registry/erp/auth-layout"
import { AvatarEditor } from "@/registry/erp/avatar-editor"
import {
  FormField,
  keepFieldFocus,
  UnsavedChangesGuard,
} from "@/registry/erp/form"
import { PhoneInput } from "@/registry/erp/phone-input"
import { browserTimezone, TimezoneSelect } from "@/registry/erp/timezone-select"
import { useMe } from "@/registry/hooks/use-me"
import type { ProfileUpdate } from "@/registry/lib/account"
import { useErpUiT } from "@/registry/lib/i18n"
import { validatePhone } from "@/registry/lib/phone"
import { Alert, AlertDescription } from "@/registry/ui/alert"
import { Button } from "@/registry/ui/button"
import { FieldGroup } from "@/registry/ui/field"
import { Input } from "@/registry/ui/input"
import { Spinner } from "@/registry/ui/spinner"
import { Textarea } from "@/registry/ui/textarea"

/**
 * Профіль користувача (PF01, ADR-0012): фото, ім'я, посада, контактний телефон, часовий пояс і
 * підпис для листів. Email і вхід кодом у SMS — у «Безпеці акаунта».
 * Форма — зразок форм кіта (ADR-0015): react-hook-form + zod, FormField, захист незбережених змін.
 */

type Fields = Required<ProfileUpdate>

/** Фото профілю: завантаження з обрізанням і видалення. */
export function ProfilePhoto() {
  const t = useErpUiT()
  const provider = useErpAuthProvider()
  const errorText = useAuthErrorText()
  const { data: me } = useMe()
  if (!me) return null
  return (
    <AvatarEditor
      name={me.name}
      src={me.avatarUrl}
      onSave={(image) =>
        provider.account.uploadAvatar(image).then(
          () => {
            toast.success(t("profile.photoSaved"))
          },
          (failure: unknown) => {
            toast.error(errorText(failure))
            throw failure
          },
        )
      }
      onRemove={() =>
        provider.account.removeAvatar().then(() => {
          toast.success(t("profile.photoRemoved"))
        })
      }
    />
  )
}

/** Схема з текстами мовою інтерфейсу: перевірка при виході з поля й під час відправки (SPEC §8.3). */
function useProfileSchema() {
  const t = useErpUiT()
  return React.useMemo(
    () =>
      z.object({
        name: z.string().trim().min(1, t("auth.fieldErrors.required")),
        position: z.string(),
        phone: z.string().superRefine((phone, ctx) => {
          const issue = phone ? validatePhone(phone) : null
          if (issue)
            ctx.addIssue({
              code: "custom",
              message: t(`validation.phone.${issue}`),
            })
        }),
        timezone: z.string(),
        signature: z.string(),
      }),
    [t],
  )
}

export function ProfileForm() {
  const t = useErpUiT()
  const provider = useErpAuthProvider()
  const fieldError = useFieldError()
  const errorText = useAuthErrorText()
  const { data: me } = useMe()
  const schema = useProfileSchema()
  const initial = React.useMemo<Fields>(
    () => ({
      name: me?.name ?? "",
      position: me?.position ?? "",
      phone: me?.phone ?? "",
      timezone: me?.timezone ?? browserTimezone(),
      signature: me?.signature ?? "",
    }),
    [me],
  )
  // Оновлення профілю з сервера (інша вкладка) видно одразу, а введене користувачем лишається.
  const form = useForm<Fields>({
    mode: "onTouched",
    resolver: zodResolver(schema),
    values: initial,
    resetOptions: { keepDirtyValues: true },
  })
  const { control, formState } = form
  const [error, setError] = React.useState<string | null>(null)

  const submit = form.handleSubmit(async (values) => {
    const changed = (Object.keys(values) as (keyof Fields)[]).filter(
      (key) => formState.dirtyFields[key],
    )
    if (!changed.length) {
      toast.info(t("forms.noChanges"))
      return
    }
    setError(null)
    const patch: ProfileUpdate = Object.fromEntries(
      changed.map((key) => [key, values[key].trim()]),
    )
    try {
      await provider.account.updateProfile(patch)
      form.reset(values)
      toast.success(t("profile.saved"))
    } catch (failure: unknown) {
      let onField = false
      for (const key of changed) {
        const message = fieldError(failure, key)
        if (message) {
          onField = true
          form.setError(key, { type: "server", message })
        }
      }
      if (!onField) setError(errorText(failure))
    }
  })

  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={(event) => {
        void submit(event)
      }}
    >
      <UnsavedChangesGuard when={formState.isDirty} />
      {error ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <FieldGroup className="@container">
        <div className="grid gap-4 @lg:grid-cols-2">
          <FormField
            control={control}
            name="name"
            label={t("profile.name")}
            render={({ field, control: aria }) => (
              <Input {...aria} {...field} autoComplete="name" maxLength={100} />
            )}
          />
          <FormField
            control={control}
            name="position"
            label={t("profile.position")}
            render={({ field, control: aria }) => (
              <Input
                {...aria}
                {...field}
                autoComplete="organization-title"
                maxLength={100}
              />
            )}
          />
          <FormField
            control={control}
            name="phone"
            label={t("profile.phone")}
            description={t("profile.phoneHint")}
            render={({ field, control: aria }) => (
              <PhoneInput
                {...aria}
                ref={field.ref}
                name={field.name}
                value={field.value}
                onValueChange={field.onChange}
                onBlur={field.onBlur}
              />
            )}
          />
          <FormField
            control={control}
            name="timezone"
            label={t("profile.timezone")}
            description={t("profile.timezoneHint")}
            render={({ field, control: aria }) => (
              <TimezoneSelect
                {...aria}
                className="w-full"
                value={field.value}
                onValueChange={field.onChange}
              />
            )}
          />
        </div>
        <FormField
          control={control}
          name="signature"
          label={t("profile.signature")}
          description={t("profile.signatureHint")}
          render={({ field, control: aria }) => (
            <Textarea {...aria} {...field} rows={3} maxLength={1000} />
          )}
        />
      </FieldGroup>
      <Button
        type="submit"
        onMouseDown={keepFieldFocus}
        disabled={formState.isSubmitting}
        focusableWhenDisabled
      >
        {formState.isSubmitting ? <Spinner aria-hidden /> : null}
        {t("profile.save")}
      </Button>
    </form>
  )
}
