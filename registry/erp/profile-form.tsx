"use client"

import * as React from "react"
import { toast } from "sonner"

import {
  useAuthErrorText,
  useErpAuthProvider,
  useFieldError,
} from "@/registry/erp/auth-layout"
import { AvatarEditor } from "@/registry/erp/avatar-editor"
import { PhoneInput } from "@/registry/erp/phone-input"
import { browserTimezone, TimezoneSelect } from "@/registry/erp/timezone-select"
import { useMe } from "@/registry/hooks/use-me"
import type { ProfileUpdate } from "@/registry/lib/account"
import { useErpUiT } from "@/registry/lib/i18n"
import { validatePhone } from "@/registry/lib/phone"
import { Alert, AlertDescription } from "@/registry/ui/alert"
import { Button } from "@/registry/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/registry/ui/field"
import { Input } from "@/registry/ui/input"
import { Spinner } from "@/registry/ui/spinner"
import { Textarea } from "@/registry/ui/textarea"

/**
 * Профіль користувача (PF01, ADR-0012): фото, ім'я, посада, контактний телефон, часовий пояс і
 * підпис для листів. Email і вхід кодом у SMS — у «Безпеці акаунта».
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

export function ProfileForm() {
  const t = useErpUiT()
  const provider = useErpAuthProvider()
  const fieldError = useFieldError()
  const errorText = useAuthErrorText()
  const { data: me } = useMe()
  const ids = React.useId()
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
  // Лише правки поверх профілю: оновлення з сервера (інша вкладка) видно одразу.
  const [edits, setEdits] = React.useState<Partial<Fields>>({})
  const values: Fields = { ...initial, ...edits }
  const [fields, setFields] = React.useState<
    Partial<Record<keyof Fields, string>>
  >({})
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const set = (key: keyof Fields) => (value: string) => {
    setEdits((current) => ({ ...current, [key]: value }))
    setFields((current) => ({ ...current, [key]: undefined }))
  }
  const changed = (Object.keys(values) as (keyof Fields)[]).filter(
    (key) => values[key] !== initial[key],
  )

  const describedBy = (key: keyof Fields, hint?: boolean) =>
    [hint ? `${ids}-${key}-hint` : "", fields[key] ? `${ids}-${key}-error` : ""]
      .filter(Boolean)
      .join(" ") || undefined

  const errorOf = (key: keyof Fields) =>
    fields[key] ? (
      <FieldError id={`${ids}-${key}-error`}>{fields[key]}</FieldError>
    ) : null

  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        const local: Partial<Record<keyof Fields, string>> = {}
        if (!values.name.trim()) local.name = t("auth.fieldErrors.required")
        const phoneIssue = values.phone ? validatePhone(values.phone) : null
        if (phoneIssue) local.phone = t(`validation.phone.${phoneIssue}`)
        setFields(local)
        if (Object.keys(local).length || !changed.length) return
        setBusy(true)
        setError(null)
        const patch: ProfileUpdate = Object.fromEntries(
          changed.map((key) => [key, values[key].trim()]),
        )
        provider.account
          .updateProfile(patch)
          .then(() => {
            setEdits({})
            toast.success(t("profile.saved"))
          })
          .catch((failure: unknown) => {
            const server = Object.fromEntries(
              changed
                .map((key) => [key, fieldError(failure, key)] as const)
                .filter(([, message]) => message !== null),
            ) as Partial<Record<keyof Fields, string>>
            if (Object.keys(server).length) setFields(server)
            else setError(errorText(failure))
          })
          .finally(() => {
            setBusy(false)
          })
      }}
    >
      {error ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <FieldGroup className="@container">
        <div className="grid gap-4 @lg:grid-cols-2">
          <Field data-invalid={fields.name ? true : undefined}>
            <FieldLabel htmlFor={`${ids}-name`}>{t("profile.name")}</FieldLabel>
            <Input
              id={`${ids}-name`}
              autoComplete="name"
              maxLength={100}
              value={values.name}
              aria-invalid={fields.name ? true : undefined}
              aria-describedby={describedBy("name")}
              onChange={(event) => {
                set("name")(event.target.value)
              }}
            />
            {errorOf("name")}
          </Field>
          <Field data-invalid={fields.position ? true : undefined}>
            <FieldLabel htmlFor={`${ids}-position`}>
              {t("profile.position")}
            </FieldLabel>
            <Input
              id={`${ids}-position`}
              autoComplete="organization-title"
              maxLength={100}
              value={values.position}
              aria-invalid={fields.position ? true : undefined}
              aria-describedby={describedBy("position")}
              onChange={(event) => {
                set("position")(event.target.value)
              }}
            />
            {errorOf("position")}
          </Field>
          <Field data-invalid={fields.phone ? true : undefined}>
            <FieldLabel htmlFor={`${ids}-phone`}>
              {t("profile.phone")}
            </FieldLabel>
            <PhoneInput
              id={`${ids}-phone`}
              value={values.phone}
              onValueChange={set("phone")}
              aria-invalid={fields.phone ? true : undefined}
              aria-describedby={describedBy("phone", true)}
            />
            <FieldDescription id={`${ids}-phone-hint`}>
              {t("profile.phoneHint")}
            </FieldDescription>
            {errorOf("phone")}
          </Field>
          <Field data-invalid={fields.timezone ? true : undefined}>
            <FieldLabel htmlFor={`${ids}-timezone`}>
              {t("profile.timezone")}
            </FieldLabel>
            <TimezoneSelect
              id={`${ids}-timezone`}
              className="w-full"
              value={values.timezone}
              onValueChange={set("timezone")}
              aria-invalid={fields.timezone ? true : undefined}
              aria-describedby={describedBy("timezone", true)}
            />
            <FieldDescription id={`${ids}-timezone-hint`}>
              {t("profile.timezoneHint")}
            </FieldDescription>
            {errorOf("timezone")}
          </Field>
        </div>
        <Field data-invalid={fields.signature ? true : undefined}>
          <FieldLabel htmlFor={`${ids}-signature`}>
            {t("profile.signature")}
          </FieldLabel>
          <Textarea
            id={`${ids}-signature`}
            rows={3}
            maxLength={1000}
            value={values.signature}
            aria-invalid={fields.signature ? true : undefined}
            aria-describedby={describedBy("signature", true)}
            onChange={(event) => {
              set("signature")(event.target.value)
            }}
          />
          <FieldDescription id={`${ids}-signature-hint`}>
            {t("profile.signatureHint")}
          </FieldDescription>
          {errorOf("signature")}
        </Field>
      </FieldGroup>
      <Button type="submit" disabled={busy || !changed.length}>
        {busy ? <Spinner aria-hidden /> : null}
        {t("profile.save")}
      </Button>
    </form>
  )
}
