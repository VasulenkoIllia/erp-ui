import * as React from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import {
  useAuthErrorText,
  useErpAuthProvider,
} from "@/registry/erp/auth-layout"
import { PageState, SectionSkeleton } from "@/registry/erp/page-state"
import { useReauth } from "@/registry/erp/reauth-dialog"
import { useCompanyId } from "@/registry/hooks/use-company"
import { useMe } from "@/registry/hooks/use-me"
import { isApiError } from "@/registry/lib/api"
import { SETUP_FACTORS } from "@/registry/lib/account"
import { hasPermission } from "@/registry/lib/auth"
import { companyScope } from "@/registry/lib/company-scope"
import { useErpUiT } from "@/registry/lib/i18n"
import {
  ADMIN_QUERY_KEYS,
  isValidCidr,
  PASSWORD_LIMITS,
  policyReadOnlyReason,
  TWO_FACTOR_MODES,
  type PolicyReadOnlyReason,
  type SecurityPolicy,
  type SecurityPolicyResponse,
} from "@/registry/lib/security-policy"
import { Alert, AlertDescription } from "@/registry/ui/alert"
import { Button } from "@/registry/ui/button"
import { Checkbox } from "@/registry/ui/checkbox"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/registry/ui/field"
import { Input } from "@/registry/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/registry/ui/select"
import { Spinner } from "@/registry/ui/spinner"
import { Textarea } from "@/registry/ui/textarea"

/**
 * Політики безпеки організації для адміністратора (PF01, ADR-0012): обов'язковий другий крок,
 * дозволені способи входу, вимоги до пароля, сесія й автовихід, дозволені адреси.
 * Збереження — після повторного підтвердження; список адрес не може відрізати самого адміністратора.
 */

const PASSWORDLESS = ["email", "sms", "passkey"] as const
const EXPIRY_OPTIONS = [null, 90, 180, 365] as const
const IDLE_OPTIONS = [null, 15, 30, 60, 120] as const

type Errors = Partial<Record<string, string>>

const optionKey = (value: number | null) =>
  value === null ? "off" : String(value)

export function SecurityPolicyForm() {
  const provider = useErpAuthProvider()
  const companyId = useCompanyId()
  const me = useMe()
  const queryKey = [...ADMIN_QUERY_KEYS.securityPolicy, companyScope(companyId)]
  const query = useQuery({
    queryKey,
    queryFn: () => provider.admin.getSecurityPolicy(),
  })
  if (query.isPending) return <SectionSkeleton rows={6} />
  // Помилка — лише без даних: невдале фонове оновлення не прибирає форму з введеним (SPEC §8.3).
  if (!query.data)
    return isApiError(query.error) && query.error.status === 403 ? (
      <PageState kind="forbidden" />
    ) : (
      <PageState
        kind="error"
        onRetry={() => {
          void query.refetch()
        }}
      />
    )
  const { canUpdate } = query.data
  // Причина «лише перегляд» залежить від права з профілю: чекаємо його, щоб форма не блимала.
  if (canUpdate !== true && me.isPending) return <SectionSkeleton rows={6} />
  const readOnlyReason = policyReadOnlyReason(
    canUpdate,
    me.data ? hasPermission(me.data.permissions, "security", "update") : false,
  )
  // Форма живе, поки та сама компанія й той самий режим: фонове оновлення не стирає введене
  // (SPEC §8.3) і не перемонтовує перегляд — його значення беруться прямо з даних.
  return (
    <PolicyForm
      key={`${companyId ?? ""}:${readOnlyReason ?? "edit"}`}
      data={query.data}
      queryKey={queryKey}
      readOnlyReason={readOnlyReason}
    />
  )
}

function PolicyForm({
  data,
  queryKey,
  readOnlyReason,
}: {
  data: SecurityPolicyResponse
  queryKey: readonly unknown[]
  readOnlyReason?: PolicyReadOnlyReason
}) {
  const t = useErpUiT()
  const provider = useErpAuthProvider()
  const queryClient = useQueryClient()
  const errorText = useAuthErrorText()
  const { guard, dialog } = useReauth()
  const ids = React.useId()
  const [draft, setPolicy] = React.useState<SecurityPolicy>(data.policy)
  const [draftIp, setIpText] = React.useState(
    data.policy.ipAllowlist.join("\n"),
  )
  const [errors, setErrors] = React.useState<Errors>({})
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const { options } = data
  const isReadOnly = readOnlyReason !== undefined
  // Лише перегляд (ADR-0033): поля в порядку Tab, причина — у кожній групі; значення — свіжі з
  // сервера, без копії в стані.
  const readOnlyId = isReadOnly ? `${ids}-read-only` : undefined
  const policy = isReadOnly ? data.policy : draft
  const ipText = isReadOnly ? data.policy.ipAllowlist.join("\n") : draftIp

  const patch = (next: Partial<SecurityPolicy>) => {
    setPolicy((current) => ({ ...current, ...next }))
  }
  const toggle = <T extends string>(list: T[], value: T, on: boolean) =>
    on ? [...new Set([...list, value])] : list.filter((item) => item !== value)

  const ipLines = ipText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)

  const validate = (): Errors => {
    const local: Errors = {}
    if (policy.twoFactor === "roles" && !policy.twoFactorRoles.length)
      local.twoFactorRoles = t("securityPolicy.rolesRequired")
    if (!policy.allowedFactors.length)
      local.allowedFactors = t("securityPolicy.factorsRequired")
    const badLine = ipLines.findIndex((line) => !isValidCidr(line))
    if (badLine >= 0)
      local.ipAllowlist = t("securityPolicy.ipInvalid", {
        line: badLine + 1,
        value: ipLines[badLine],
      })
    return local
  }

  /** Помилки сервера → тексти біля полів. */
  const serverErrors = (failure: unknown): Errors | null => {
    if (!isApiError(failure) || !failure.fieldErrors) return null
    const result: Errors = {}
    for (const [key, code] of Object.entries(failure.fieldErrors)) {
      const line = /^ipAllowlist\.(\d+)$/.exec(key)
      if (line)
        result.ipAllowlist = t("securityPolicy.ipInvalid", {
          line: Number(line[1]) + 1,
          value: ipLines[Number(line[1])] ?? "",
        })
      else if (key === "ipAllowlist" && code === "excludesCurrent")
        result.ipAllowlist = t("securityPolicy.excludesCurrent", {
          ip: options.currentIp ?? "",
        })
      else if (key === "twoFactorRoles")
        result.twoFactorRoles = t("securityPolicy.rolesRequired")
      else if (key === "allowedFactors")
        result.allowedFactors = t("securityPolicy.factorsRequired")
      else result[key.split(".")[0] ?? key] = t("auth.fieldErrors.invalid")
    }
    return result
  }

  const number =
    (apply: (value: number) => Partial<SecurityPolicy>) =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = event.target.valueAsNumber
      if (!Number.isNaN(value)) patch(apply(Math.round(value)))
    }

  const errorText_ = (key: string) =>
    errors[key] ? (
      <FieldError id={`${ids}-${key}-error`}>{errors[key]}</FieldError>
    ) : null

  return (
    <form
      className="@container space-y-8"
      noValidate
      data-slot="security-policy-form"
      onSubmit={(event) => {
        event.preventDefault()
        if (isReadOnly) return
        const local = validate()
        setErrors(local)
        if (Object.keys(local).length) return
        setBusy(true)
        setError(null)
        const next = { ...policy, ipAllowlist: ipLines }
        guard(() => provider.admin.updateSecurityPolicy(next))
          .then((saved) => {
            queryClient.setQueryData<SecurityPolicyResponse>(queryKey, (old) =>
              old ? { ...old, policy: saved } : old,
            )
            // Сторінка входу бере довжину пароля, сесію й автовихід із `/auth/methods`.
            void queryClient.invalidateQueries({
              queryKey: ["erp-ui", "auth-methods"],
            })
            toast.success(t("securityPolicy.saved"))
          })
          .catch((failure: unknown) => {
            const fields = serverErrors(failure)
            if (fields) setErrors(fields)
            else if (failure) setError(errorText(failure))
          })
          .finally(() => {
            setBusy(false)
          })
      }}
    >
      {readOnlyReason ? (
        <Alert role="note" id={readOnlyId}>
          <AlertDescription>
            {readOnlyReason === "platform"
              ? t("securityPolicy.readOnlyPlatform")
              : t("securityPolicy.readOnly")}
          </AlertDescription>
        </Alert>
      ) : null}
      {error ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <FieldSet aria-describedby={readOnlyId}>
        <FieldLegend>{t("securityPolicy.twoFactorTitle")}</FieldLegend>
        <Field>
          <FieldLabel htmlFor={`${ids}-two-factor`}>
            {t("securityPolicy.twoFactorLabel")}
          </FieldLabel>
          <Select
            items={TWO_FACTOR_MODES.map((mode) => ({
              value: mode,
              label: t(`securityPolicy.twoFactor.${mode}`),
            }))}
            value={policy.twoFactor}
            readOnly={isReadOnly}
            onValueChange={(value: SecurityPolicy["twoFactor"] | null) => {
              if (value) patch({ twoFactor: value })
            }}
          >
            <SelectTrigger id={`${ids}-two-factor`} className="w-full @lg:w-72">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TWO_FACTOR_MODES.map((mode) => (
                <SelectItem key={mode} value={mode}>
                  {t(`securityPolicy.twoFactor.${mode}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription>
            {t("securityPolicy.twoFactorHint")}
          </FieldDescription>
        </Field>
        {policy.twoFactor === "roles" ? (
          <CheckboxGroup
            readOnly={isReadOnly}
            legend={t("securityPolicy.rolesLabel")}
            error={errors.twoFactorRoles}
            errorId={`${ids}-twoFactorRoles-error`}
            items={options.roles.map((role) => ({
              value: role.id,
              label: role.name,
              checked: policy.twoFactorRoles.includes(role.id),
            }))}
            onChange={(value, on) => {
              patch({
                twoFactorRoles: toggle(policy.twoFactorRoles, value, on),
              })
            }}
          />
        ) : null}
        <CheckboxGroup
          readOnly={isReadOnly}
          legend={t("securityPolicy.factorsLabel")}
          error={errors.allowedFactors}
          errorId={`${ids}-allowedFactors-error`}
          items={SETUP_FACTORS.map((factor) => ({
            value: factor,
            label: t(`auth.factors.types.${factor}`),
            checked: policy.allowedFactors.includes(factor),
          }))}
          onChange={(value, on) => {
            patch({ allowedFactors: toggle(policy.allowedFactors, value, on) })
          }}
        />
      </FieldSet>

      <FieldSet aria-describedby={readOnlyId}>
        <FieldLegend>{t("securityPolicy.methodsTitle")}</FieldLegend>
        <CheckboxGroup
          readOnly={isReadOnly}
          legend={t("securityPolicy.passwordlessLabel")}
          items={PASSWORDLESS.map((method) => ({
            value: method,
            label: t(`securityPolicy.passwordless.${method}`),
            checked: policy.passwordless.includes(method),
          }))}
          onChange={(value, on) => {
            patch({ passwordless: toggle(policy.passwordless, value, on) })
          }}
        />
        {options.providers.length ? (
          <CheckboxGroup
            readOnly={isReadOnly}
            legend={t("securityPolicy.ssoLabel")}
            items={options.providers.map((item) => ({
              value: item.id,
              label: item.name,
              checked: policy.ssoProviders.includes(item.id),
            }))}
            onChange={(value, on) => {
              patch({ ssoProviders: toggle(policy.ssoProviders, value, on) })
            }}
          />
        ) : null}
      </FieldSet>

      <FieldSet aria-describedby={readOnlyId}>
        <FieldLegend>{t("securityPolicy.passwordTitle")}</FieldLegend>
        <div className="grid gap-4 @lg:grid-cols-3">
          <Field>
            <FieldLabel htmlFor={`${ids}-min`}>
              {t("securityPolicy.minLength")}
            </FieldLabel>
            <Input
              id={`${ids}-min`}
              type="number"
              inputMode="numeric"
              min={PASSWORD_LIMITS.min}
              max={PASSWORD_LIMITS.max}
              value={policy.password.minLength}
              readOnly={isReadOnly}
              onChange={number((minLength) => ({
                password: { ...policy.password, minLength },
              }))}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${ids}-expiry`}>
              {t("securityPolicy.expiryLabel")}
            </FieldLabel>
            <Select
              items={EXPIRY_OPTIONS.map((days) => ({
                value: optionKey(days),
                label:
                  days === null
                    ? t("securityPolicy.never")
                    : t("securityPolicy.days", { count: days }),
              }))}
              value={optionKey(policy.password.expiryDays)}
              readOnly={isReadOnly}
              onValueChange={(value: string | null) => {
                patch({
                  password: {
                    ...policy.password,
                    expiryDays:
                      !value || value === "off" ? null : Number(value),
                  },
                })
              }}
            >
              <SelectTrigger id={`${ids}-expiry`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPIRY_OPTIONS.map((days) => (
                  <SelectItem key={optionKey(days)} value={optionKey(days)}>
                    {days === null
                      ? t("securityPolicy.never")
                      : t("securityPolicy.days", { count: days })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor={`${ids}-reuse`}>
              {t("securityPolicy.preventReuse")}
            </FieldLabel>
            <Input
              id={`${ids}-reuse`}
              type="number"
              inputMode="numeric"
              min={0}
              max={24}
              value={policy.password.preventReuse}
              readOnly={isReadOnly}
              aria-describedby={`${ids}-reuse-hint`}
              onChange={number((preventReuse) => ({
                password: { ...policy.password, preventReuse },
              }))}
            />
            <FieldDescription id={`${ids}-reuse-hint`}>
              {t("securityPolicy.preventReuseHint")}
            </FieldDescription>
          </Field>
        </div>
      </FieldSet>

      <FieldSet aria-describedby={readOnlyId}>
        <FieldLegend>{t("securityPolicy.sessionTitle")}</FieldLegend>
        <div className="grid gap-4 @lg:grid-cols-3">
          <Field>
            <FieldLabel htmlFor={`${ids}-session`}>
              {t("securityPolicy.sessionMinutes")}
            </FieldLabel>
            <Input
              id={`${ids}-session`}
              type="number"
              inputMode="numeric"
              min={5}
              max={1440}
              value={policy.sessionMinutes}
              readOnly={isReadOnly}
              onChange={number((sessionMinutes) => ({ sessionMinutes }))}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${ids}-idle`}>
              {t("securityPolicy.idleLabel")}
            </FieldLabel>
            <Select
              items={IDLE_OPTIONS.map((minutes) => ({
                value: optionKey(minutes),
                label:
                  minutes === null
                    ? t("securityPolicy.off")
                    : t("securityPolicy.minutes", { count: minutes }),
              }))}
              value={optionKey(policy.idleTimeoutMinutes)}
              readOnly={isReadOnly}
              onValueChange={(value: string | null) => {
                patch({
                  idleTimeoutMinutes:
                    !value || value === "off" ? null : Number(value),
                })
              }}
            >
              <SelectTrigger id={`${ids}-idle`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {IDLE_OPTIONS.map((minutes) => (
                  <SelectItem
                    key={optionKey(minutes)}
                    value={optionKey(minutes)}
                  >
                    {minutes === null
                      ? t("securityPolicy.off")
                      : t("securityPolicy.minutes", { count: minutes })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor={`${ids}-trusted`}>
              {t("securityPolicy.trustedDays")}
            </FieldLabel>
            <Input
              id={`${ids}-trusted`}
              type="number"
              inputMode="numeric"
              min={0}
              max={90}
              value={policy.trustedDeviceDays}
              readOnly={isReadOnly}
              aria-describedby={`${ids}-trusted-hint`}
              onChange={number((trustedDeviceDays) => ({ trustedDeviceDays }))}
            />
            <FieldDescription id={`${ids}-trusted-hint`}>
              {t("securityPolicy.trustedHint")}
            </FieldDescription>
          </Field>
        </div>
      </FieldSet>

      <FieldSet aria-describedby={readOnlyId}>
        <FieldLegend>{t("securityPolicy.ipTitle")}</FieldLegend>
        <Field data-invalid={errors.ipAllowlist ? true : undefined}>
          <FieldLabel htmlFor={`${ids}-ip`}>
            {t("securityPolicy.ipLabel")}
          </FieldLabel>
          <Textarea
            id={`${ids}-ip`}
            rows={4}
            spellCheck={false}
            className="font-mono"
            value={ipText}
            readOnly={isReadOnly}
            aria-invalid={errors.ipAllowlist ? true : undefined}
            aria-describedby={`${ids}-ip-hint${errors.ipAllowlist ? ` ${ids}-ipAllowlist-error` : ""}`}
            onChange={(event) => {
              setIpText(event.target.value)
              setErrors((current) => ({ ...current, ipAllowlist: undefined }))
            }}
          />
          <FieldDescription id={`${ids}-ip-hint`}>
            {t("securityPolicy.ipHint")}
            {options.currentIp
              ? ` ${t("securityPolicy.ipCurrent", { ip: options.currentIp })}`
              : null}
          </FieldDescription>
          {errorText_("ipAllowlist")}
          {!isReadOnly &&
          options.currentIp &&
          !ipLines.includes(options.currentIp) ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit"
              onClick={() => {
                setIpText((text) =>
                  [text.trim(), options.currentIp].filter(Boolean).join("\n"),
                )
                setErrors((current) => ({ ...current, ipAllowlist: undefined }))
              }}
            >
              {t("securityPolicy.addCurrentIp")}
            </Button>
          ) : null}
        </Field>
      </FieldSet>

      {isReadOnly ? null : (
        <Button type="submit" disabled={busy}>
          {busy ? <Spinner aria-hidden /> : null}
          {t("securityPolicy.save")}
        </Button>
      )}
      {dialog}
    </form>
  )
}

/** Група прапорців із підписом і помилкою групи. */
function CheckboxGroup<T extends string>({
  legend,
  items,
  onChange,
  error,
  errorId,
  readOnly,
}: {
  legend: string
  items: { value: T; label: string; checked: boolean }[]
  onChange: (value: T, checked: boolean) => void
  error?: string
  errorId?: string
  /** Лише перегляд — у порядку Tab (ADR-0033); галочка Base UI — `span`, поле її не блокує. */
  readOnly?: boolean
}) {
  const ids = React.useId()
  return (
    <FieldSet
      data-invalid={error ? true : undefined}
      aria-describedby={error ? errorId : undefined}
      className="gap-2"
    >
      <FieldLegend variant="label">{legend}</FieldLegend>
      {/* Між рядками — щоб галочки після переносу не стояли ближче 24 px одна від одної (WCAG 2.5.8). */}
      <div className="flex flex-wrap gap-x-6 gap-y-3">
        {items.map((item) => (
          <Field key={item.value} orientation="horizontal" className="w-auto">
            <Checkbox
              id={`${ids}-${item.value}`}
              checked={item.checked}
              readOnly={readOnly}
              onCheckedChange={(checked) => {
                onChange(item.value, checked)
              }}
            />
            <FieldLabel
              htmlFor={`${ids}-${item.value}`}
              className="font-normal"
            >
              {item.label}
            </FieldLabel>
          </Field>
        ))}
      </div>
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
    </FieldSet>
  )
}
