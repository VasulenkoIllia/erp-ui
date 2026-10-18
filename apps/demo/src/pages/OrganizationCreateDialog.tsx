import { zodResolver } from "@hookform/resolvers/zod"
import { useCreate } from "ra-core"
import { useMemo, type RefObject } from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { z } from "zod"

import { FormField, keepFieldFocus } from "@/registry/erp/form"
import { UaIdInput, uaIdIssueKey } from "@/registry/erp/ua-id-input"
import { useApiErrorMessage } from "@/registry/hooks/use-api-error-message"
import { useCompanyId } from "@/registry/hooks/use-company"
import { companyScope } from "@/registry/lib/company-scope"
import { useErpUiT } from "@/registry/lib/i18n"
import { validateUaId } from "@/registry/lib/ua-ids"
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
import { Input } from "@/registry/ui/input"
import { Spinner } from "@/registry/ui/spinner"

import type { Organization } from "@/data/organizations"

import { ORGANIZATIONS } from "./organization-options"

const usePageT = () =>
  useTranslation("demo", { keyPrefix: "pickersPage.create" }).t

/**
 * «Створити нову організацію» з вибору компанії (UI40): назва з тексту пошуку, ЄДРПОУ. Решту
 * реквізитів додають у картці; новий запис стає значенням поля, фокус повертається на поле.
 */
export function OrganizationCreateDialog({
  name,
  onOpenChange,
  onCreated,
  finalFocus,
}: {
  /** Текст пошуку для назви; `null` — діалог закрито. */
  name: string | null
  onOpenChange: (open: boolean) => void
  onCreated: (organization: Organization) => void
  /** Поле вибору: туди повертається фокус. */
  finalFocus?: RefObject<HTMLButtonElement | null>
}) {
  const t = usePageT()
  return (
    <Dialog open={name !== null} onOpenChange={onOpenChange}>
      <DialogContent finalFocus={finalFocus}>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("lead")}</DialogDescription>
        </DialogHeader>
        {name === null ? null : (
          <CreateForm
            initialName={name}
            onCancel={() => {
              onOpenChange(false)
            }}
            onCreated={onCreated}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function useCreateSchema() {
  const kitT = useErpUiT()
  return useMemo(
    () =>
      z.object({
        name: z.string().trim().min(1, kitT("validation.required")),
        code: z.string().superRefine((code, ctx) => {
          const issue = code ? validateUaId("edrpou", code) : "length"
          if (issue)
            ctx.addIssue({
              code: "custom",
              message: kitT(uaIdIssueKey("edrpou", issue)),
            })
        }),
      }),
    [kitT],
  )
}

function CreateForm({
  initialName,
  onCancel,
  onCreated,
}: {
  initialName: string
  onCancel: () => void
  onCreated: (organization: Organization) => void
}) {
  const t = usePageT()
  const errorMessage = useApiErrorMessage()
  const companyId = useCompanyId()
  const [create, { isPending, error }] = useCreate<Organization>()
  const form = useForm({
    mode: "onTouched",
    resolver: zodResolver(useCreateSchema()),
    defaultValues: { name: initialName, code: "" },
  })
  const submit = form.handleSubmit(async ({ name, code }) => {
    const organization = await create(
      ORGANIZATIONS,
      {
        data: {
          name,
          code,
          type: "legal",
          iban: "",
          phone: "",
          email: "",
          city: "",
        },
        meta: companyScope(companyId),
      },
      { returnPromise: true },
    ).catch(() => null)
    if (organization) onCreated(organization)
  })
  return (
    <form
      noValidate
      onSubmit={(event) => void submit(event)}
      className="grid gap-4"
    >
      <FieldGroup>
        <FormField
          control={form.control}
          name="name"
          label={t("name")}
          render={({ field, control }) => <Input {...field} {...control} />}
        />
        <FormField
          control={form.control}
          name="code"
          label={t("code")}
          render={({ field, control }) => (
            <UaIdInput
              kind="edrpou"
              {...control}
              name={field.name}
              value={field.value}
              onValueChange={field.onChange}
              onBlur={field.onBlur}
              ref={field.ref}
            />
          )}
        />
      </FieldGroup>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage(error)}</AlertDescription>
        </Alert>
      ) : null}
      <DialogFooter>
        {/* Запит уже пішов: скасування не зупинить створення на сервері. */}
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          onMouseDown={keepFieldFocus}
          disabled={isPending}
          focusableWhenDisabled
        >
          {t("cancel")}
        </Button>
        <Button
          type="submit"
          onMouseDown={keepFieldFocus}
          disabled={isPending}
          focusableWhenDisabled
        >
          {isPending ? <Spinner aria-hidden /> : null}
          {t("submit")}
        </Button>
      </DialogFooter>
    </form>
  )
}
