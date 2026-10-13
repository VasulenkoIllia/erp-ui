"use client"

import * as React from "react"
import { useQueryClient } from "@tanstack/react-query"
import {
  Building2Icon,
  ImageIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react"
import { toast } from "sonner"

import {
  useAuthErrorText,
  useErpAuthProvider,
  useFieldError,
} from "@/registry/erp/auth-layout"
import { PageState, SectionSkeleton } from "@/registry/erp/page-state"
import { PhoneInput } from "@/registry/erp/phone-input"
import { UaIdInput, uaIdIssueKey } from "@/registry/erp/ua-id-input"
import { useCompanyProfile } from "@/registry/hooks/use-company-profile"
import { useHasPermission } from "@/registry/hooks/use-me"
import { isApiError } from "@/registry/lib/api"
import { PALETTES, type Palette } from "@/registry/lib/appearance"
import {
  COMPANY_IMAGE_MAX_BYTES,
  COMPANY_IMAGE_TYPES,
  COMPANY_KINDS,
  COMPANY_QUERY_KEYS,
  type Branch,
  type CompanyImage,
  type CompanyKind,
  type CompanyProfile,
  type CompanyUpdate,
} from "@/registry/lib/company"
import { useErpUiT } from "@/registry/lib/i18n"
import { formatPhone, validatePhone } from "@/registry/lib/phone"
import {
  ibanBankCode,
  validateUaId,
  type UaIdIssue,
  type UaIdKind,
} from "@/registry/lib/ua-ids"
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
import { Switch } from "@/registry/ui/switch"

/**
 * Налаштування компанії (ADR-0014, основа A1): реквізити для рахунків і документів, логотип і
 * печатка, філії. Читати може кожен у компанії, змінювати — право `company:update`; без нього
 * все лише для перегляду.
 *
 *   <CompanyProfileForm />  <CompanyImages />  <CompanyBranchesSection />
 */

function useRefreshCompany() {
  const queryClient = useQueryClient()
  return () =>
    queryClient.invalidateQueries({ queryKey: COMPANY_QUERY_KEYS.profile })
}

/** Стан завантаження й помилки профілю — однаковий для всіх частин. */
function ProfileState({
  query,
  rows,
  children,
}: {
  query: ReturnType<typeof useCompanyProfile>
  rows: number
  children: (profile: CompanyProfile) => React.ReactNode
}) {
  if (query.isPending) return <SectionSkeleton rows={rows} />
  if (query.isError)
    return isApiError(query.error) && query.error.status === 403 ? (
      <PageState kind="forbidden" className="min-h-40" />
    ) : (
      <PageState
        kind="error"
        className="min-h-40"
        onRetry={() => {
          void query.refetch()
        }}
      />
    )
  return <>{children(query.data)}</>
}

/* ------------------------------ Реквізити ------------------------------ */

interface Fields {
  name: string
  legalName: string
  kind: CompanyKind
  edrpou: string
  rnokpp: string
  vatPayer: boolean
  vatIpn: string
  iban: string
  bankName: string
  address: string
  phone: string
  email: string
  website: string
  directorName: string
  directorPosition: string
  accountant: string
  /** "" — як у бренду. */
  palette: string
}
type Key = keyof Fields

const fieldsOf = (profile: CompanyProfile): Fields => ({
  name: profile.name,
  legalName: profile.legalName,
  kind: profile.kind,
  edrpou: profile.edrpou ?? "",
  rnokpp: profile.rnokpp ?? "",
  vatPayer: profile.vatPayer,
  vatIpn: profile.vatIpn ?? "",
  iban: profile.iban ?? "",
  bankName: profile.bankName ?? "",
  address: profile.address ?? "",
  phone: profile.phone ?? "",
  email: profile.email ?? "",
  website: profile.website ?? "",
  directorName: profile.director?.name ?? "",
  directorPosition: profile.director?.position ?? "",
  accountant: profile.accountant ?? "",
  palette: profile.palette ?? "",
})

const UA_ID_FIELDS = ["edrpou", "rnokpp", "vatIpn", "iban"] as const
const isUaIdField = (key: string): key is UaIdKind =>
  (UA_ID_FIELDS as readonly string[]).includes(key)
const UA_ID_ISSUES: readonly string[] = ["length", "checksum", "country"]
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
/** Пункт «Як у бренду» у виборі палітри (палітри компанії немає). */
const BRAND = "brand"

/** Реквізити компанії: основне, банк, контакти, підписанти, палітра. */
export function CompanyProfileForm() {
  const query = useCompanyProfile()
  return (
    <ProfileState query={query} rows={6}>
      {(profile) => <ProfileFields profile={profile} />}
    </ProfileState>
  )
}

function ProfileFields({ profile }: { profile: CompanyProfile }) {
  const t = useErpUiT()
  const provider = useErpAuthProvider()
  const fieldError = useFieldError()
  const errorText = useAuthErrorText()
  const refresh = useRefreshCompany()
  const canEdit = useHasPermission("company", "update")
  const ids = React.useId()
  const initial = fieldsOf(profile)
  // Лише правки поверх профілю: оновлення з сервера видно одразу.
  const [edits, setEdits] = React.useState<Partial<Fields>>({})
  const values: Fields = { ...initial, ...edits }
  const [errors, setErrors] = React.useState<Partial<Record<Key, string>>>({})
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const legal = values.kind === "legal"
  const changed = (Object.keys(values) as Key[]).filter(
    (key) => values[key] !== initial[key],
  )

  /** Перевірка одного поля, як на сервері (SPEC §8.3: при виході з поля й під час виправлення). */
  const check = (key: Key, all: Fields): string | undefined => {
    const value = all[key]
    if (typeof value !== "string") return undefined
    const text = value.trim()
    const required =
      key === "name" ||
      key === "legalName" ||
      (key === "edrpou" && all.kind === "legal") ||
      (key === "rnokpp" && all.kind === "fop") ||
      (key === "vatIpn" && all.vatPayer)
    if (required && !text) return t("auth.fieldErrors.required")
    if (isUaIdField(key) && text) {
      const issue = validateUaId(key, text)
      if (issue) return t(uaIdIssueKey(key, issue))
    }
    if (key === "phone" && text) {
      const issue = validatePhone(text)
      if (issue) return t(`validation.phone.${issue}`)
    }
    if (key === "email" && text && !EMAIL.test(text))
      return t("auth.fieldErrors.invalid")
    return undefined
  }

  const set = <K extends Key>(key: K, value: Fields[K]) => {
    const next = { ...values, [key]: value }
    setEdits((current) => ({ ...current, [key]: value }))
    // Помилку, що вже показана, знімаємо щойно значення стало правильним.
    if (errors[key])
      setErrors((current) => ({ ...current, [key]: check(key, next) }))
  }
  const blur = (key: Key) => () => {
    setErrors((current) => ({ ...current, [key]: check(key, values) }))
  }

  const describedBy = (key: Key, hint?: boolean) =>
    [hint ? `${ids}-${key}-hint` : "", errors[key] ? `${ids}-${key}-error` : ""]
      .filter(Boolean)
      .join(" ") || undefined
  const invalid = (key: Key) => (errors[key] ? true : undefined)
  const errorOf = (key: Key) =>
    errors[key] ? (
      <FieldError id={`${ids}-${key}-error`}>{errors[key]}</FieldError>
    ) : null

  const text = (
    key: Exclude<Key, "kind" | "vatPayer" | UaIdKind | "phone" | "palette">,
    options: {
      hint?: string
      autoComplete?: string
      type?: string
      inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"]
      maxLength?: number
    } = {},
  ) => (
    <Field data-invalid={invalid(key)}>
      <FieldLabel htmlFor={`${ids}-${key}`}>
        {t(`companySettings.${key}`)}
      </FieldLabel>
      <Input
        id={`${ids}-${key}`}
        type={options.type}
        inputMode={options.inputMode}
        autoComplete={options.autoComplete ?? "off"}
        maxLength={options.maxLength ?? 200}
        value={values[key]}
        disabled={!canEdit}
        aria-invalid={invalid(key)}
        aria-describedby={describedBy(key, Boolean(options.hint))}
        onChange={(event) => {
          set(key, event.target.value)
        }}
        onBlur={blur(key)}
      />
      {options.hint ? (
        <FieldDescription id={`${ids}-${key}-hint`}>
          {options.hint}
        </FieldDescription>
      ) : null}
      {errorOf(key)}
    </Field>
  )

  const uaId = (key: UaIdKind, hint?: string) => (
    <Field data-invalid={invalid(key)}>
      <FieldLabel htmlFor={`${ids}-${key}`}>
        {t(`companySettings.${key}`)}
      </FieldLabel>
      <UaIdInput
        id={`${ids}-${key}`}
        kind={key}
        value={values[key]}
        disabled={!canEdit}
        aria-invalid={invalid(key)}
        aria-describedby={describedBy(key, Boolean(hint))}
        onValueChange={(value) => {
          set(key, value)
        }}
        onBlur={blur(key)}
      />
      {hint ? (
        <FieldDescription id={`${ids}-${key}-hint`}>{hint}</FieldDescription>
      ) : null}
      {errorOf(key)}
    </Field>
  )

  const bankCode =
    values.iban && !validateUaId("iban", values.iban)
      ? ibanBankCode(values.iban)
      : null
  const paletteItems = [
    { value: BRAND, label: t("companySettings.paletteNone") },
    ...PALETTES.map((palette) => ({
      value: palette,
      label: t(`palettes.${palette}`),
    })),
  ]
  const kindItems = COMPANY_KINDS.map((kind) => ({
    value: kind,
    label: t(`companySettings.kinds.${kind}`),
  }))

  return (
    <form
      className="@container space-y-6"
      data-slot="company-profile-form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        const local = Object.fromEntries(
          (Object.keys(values) as Key[])
            .map((key) => [key, check(key, values)] as const)
            .filter(([, message]) => message),
        ) as Partial<Record<Key, string>>
        setErrors(local)
        if (Object.keys(local).length || !changed.length) return
        const patch: CompanyUpdate = {}
        const director = changed.some(
          (key) => key === "directorName" || key === "directorPosition",
        )
        for (const key of changed) {
          if (key === "directorName" || key === "directorPosition") continue
          if (key === "palette") {
            patch.palette = values.palette ? (values.palette as Palette) : null
            continue
          }
          const value = values[key]
          Object.assign(patch, {
            [key]: typeof value === "string" ? value.trim() : value,
          })
        }
        if (director)
          patch.director = {
            name: values.directorName.trim(),
            position: values.directorPosition.trim(),
          }
        setBusy(true)
        setError(null)
        provider.company
          .update(patch)
          .then(async () => {
            await refresh()
            setEdits({})
            toast.success(t("companySettings.saved"))
          })
          .catch((failure: unknown) => {
            const codes = isApiError(failure) ? failure.fieldErrors : undefined
            const server: Partial<Record<Key, string>> = {}
            for (const key of Object.keys(values) as Key[]) {
              const code = codes?.[key]
              if (!code) continue
              server[key] =
                isUaIdField(key) && UA_ID_ISSUES.includes(code)
                  ? t(uaIdIssueKey(key, code as UaIdIssue))
                  : (fieldError(failure, key) ?? undefined)
            }
            if (Object.keys(server).length) setErrors(server)
            else setError(errorText(failure))
          })
          .finally(() => {
            setBusy(false)
          })
      }}
    >
      {canEdit ? null : (
        <Alert>
          <AlertDescription>{t("companySettings.readOnly")}</AlertDescription>
        </Alert>
      )}
      {error ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <FieldSet className="gap-4">
        <FieldLegend>{t("companySettings.sections.main")}</FieldLegend>
        <div className="grid gap-4 @lg:grid-cols-2">
          {text("name", {
            hint: t("companySettings.nameHint"),
            autoComplete: "organization",
            maxLength: 100,
          })}
          {text("legalName", { hint: t("companySettings.legalNameHint") })}
          <Field>
            <FieldLabel htmlFor={`${ids}-kind`}>
              {t("companySettings.kind")}
            </FieldLabel>
            <Select
              items={kindItems}
              value={values.kind}
              disabled={!canEdit}
              onValueChange={(value: string | null) => {
                if (value) set("kind", value as CompanyKind)
              }}
            >
              <SelectTrigger id={`${ids}-kind`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {kindItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {legal ? uaId("edrpou") : uaId("rnokpp")}
        </div>
        <Field orientation="horizontal">
          <Switch
            id={`${ids}-vatPayer`}
            checked={values.vatPayer}
            disabled={!canEdit}
            onCheckedChange={(checked) => {
              set("vatPayer", checked)
              if (!checked)
                setErrors((current) => ({ ...current, vatIpn: undefined }))
            }}
          />
          <FieldLabel htmlFor={`${ids}-vatPayer`}>
            {t("companySettings.vatPayer")}
          </FieldLabel>
        </Field>
        {values.vatPayer ? (
          <div className="grid gap-4 @lg:grid-cols-2">{uaId("vatIpn")}</div>
        ) : null}
      </FieldSet>

      <FieldSet className="gap-4">
        <FieldLegend>{t("companySettings.sections.bank")}</FieldLegend>
        <div className="grid gap-4 @lg:grid-cols-2">
          {uaId(
            "iban",
            bankCode
              ? t("companySettings.bankCode", { code: bankCode })
              : undefined,
          )}
          {text("bankName")}
        </div>
      </FieldSet>

      <FieldSet className="gap-4">
        <FieldLegend>{t("companySettings.sections.contacts")}</FieldLegend>
        <div className="grid gap-4 @lg:grid-cols-2">
          <div className="@lg:col-span-2">
            {text("address", {
              autoComplete: "street-address",
              maxLength: 300,
            })}
          </div>
          <Field data-invalid={invalid("phone")}>
            <FieldLabel htmlFor={`${ids}-phone`}>
              {t("companySettings.phone")}
            </FieldLabel>
            <PhoneInput
              id={`${ids}-phone`}
              value={values.phone}
              disabled={!canEdit}
              aria-invalid={invalid("phone")}
              aria-describedby={describedBy("phone")}
              onValueChange={(value) => {
                set("phone", value)
              }}
              onBlur={blur("phone")}
            />
            {errorOf("phone")}
          </Field>
          {text("email", {
            type: "email",
            inputMode: "email",
            autoComplete: "email",
          })}
          {text("website", { inputMode: "url", autoComplete: "url" })}
        </div>
      </FieldSet>

      <FieldSet className="gap-4">
        <FieldLegend>{t("companySettings.sections.signers")}</FieldLegend>
        <div className="grid gap-4 @lg:grid-cols-2">
          {text("directorName", { maxLength: 100 })}
          {text("directorPosition", { maxLength: 100 })}
          {text("accountant", { maxLength: 100 })}
        </div>
      </FieldSet>

      <FieldSet className="gap-4">
        <FieldLegend>{t("companySettings.sections.appearance")}</FieldLegend>
        <div className="grid gap-4 @lg:grid-cols-2">
          <Field>
            <FieldLabel htmlFor={`${ids}-palette`}>
              {t("companySettings.palette")}
            </FieldLabel>
            <Select
              items={paletteItems}
              value={values.palette || BRAND}
              disabled={!canEdit}
              onValueChange={(value: string | null) => {
                set("palette", !value || value === BRAND ? "" : value)
              }}
            >
              <SelectTrigger
                id={`${ids}-palette`}
                className="w-full"
                aria-describedby={`${ids}-palette-hint`}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {paletteItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription id={`${ids}-palette-hint`}>
              {t("companySettings.paletteHint")}
            </FieldDescription>
          </Field>
        </div>
      </FieldSet>

      {canEdit ? (
        <Button type="submit" disabled={busy || !changed.length}>
          {busy ? <Spinner aria-hidden /> : null}
          {t("companySettings.save")}
        </Button>
      ) : null}
    </form>
  )
}

/* ------------------------------ Логотип і печатка ------------------------------ */

/** Логотип і печатка з підписом: завантажити, замінити, видалити (без обрізання). */
export function CompanyImages() {
  const query = useCompanyProfile()
  return (
    <ProfileState query={query} rows={2}>
      {(profile) => (
        <div className="@container" data-slot="company-images">
          <div className="grid gap-6 @lg:grid-cols-2">
            <ImageField kind="logo" profile={profile} />
            <ImageField kind="stamp" profile={profile} />
          </div>
        </div>
      )}
    </ProfileState>
  )
}

function ImageField({
  kind,
  profile,
}: {
  kind: CompanyImage
  profile: CompanyProfile
}) {
  const t = useErpUiT()
  const provider = useErpAuthProvider()
  const errorText = useAuthErrorText()
  const fieldError = useFieldError()
  const refresh = useRefreshCompany()
  const canEdit = useHasPermission("company", "update")
  const ids = React.useId()
  const input = React.useRef<HTMLInputElement>(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string>()
  const url = kind === "logo" ? profile.logoUrl : profile.stampUrl
  const what = t(`companySettings.${kind}`)

  const run = (action: () => Promise<unknown>, done: string) => {
    setBusy(true)
    setError(undefined)
    action()
      .then(async () => {
        await refresh()
        toast.success(done)
      })
      .catch((failure: unknown) => {
        const code = isApiError(failure) ? failure.fieldErrors?.file : undefined
        if (code === "type") setError(t("companySettings.fileType"))
        else if (code === "tooLarge") setError(t("companySettings.fileSize"))
        else if (code) setError(fieldError(failure, "file") ?? undefined)
        else toast.error(errorText(failure))
      })
      .finally(() => {
        setBusy(false)
      })
  }

  return (
    <div className="space-y-3" data-invalid={error ? true : undefined}>
      <div className="space-y-1">
        <p className="text-sm font-medium" id={`${ids}-label`}>
          {what}
        </p>
        <p className="text-sm text-muted-foreground" id={`${ids}-hint`}>
          {t(`companySettings.${kind}Hint`)}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted">
          {url ? (
            <img
              src={url}
              alt={t("companySettings.imageOf", { what, name: profile.name })}
              className="size-full object-contain p-2"
            />
          ) : kind === "logo" ? (
            <Building2Icon
              aria-hidden
              className="size-8 text-muted-foreground"
            />
          ) : (
            <ImageIcon aria-hidden className="size-8 text-muted-foreground" />
          )}
        </div>
        {canEdit ? (
          <div className="flex flex-wrap gap-2">
            <input
              ref={input}
              type="file"
              accept={COMPANY_IMAGE_TYPES.join(",")}
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ""
                if (!file) return
                if (
                  !(COMPANY_IMAGE_TYPES as readonly string[]).includes(
                    file.type,
                  )
                ) {
                  setError(t("companySettings.fileType"))
                  return
                }
                if (file.size > COMPANY_IMAGE_MAX_BYTES) {
                  setError(t("companySettings.fileSize"))
                  return
                }
                run(
                  () => provider.company.uploadImage(kind, file),
                  t("companySettings.uploaded"),
                )
              }}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              aria-label={
                url
                  ? t("companySettings.replaceFor", { what })
                  : t("companySettings.uploadFor", { what })
              }
              aria-describedby={`${ids}-hint${error ? ` ${ids}-error` : ""}`}
              onClick={() => {
                input.current?.click()
              }}
            >
              {busy ? <Spinner aria-hidden /> : <UploadIcon aria-hidden />}
              {url ? t("companySettings.replace") : t("companySettings.upload")}
            </Button>
            {url ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                aria-label={t("companySettings.removeFor", { what })}
                onClick={() => {
                  run(
                    () => provider.company.removeImage(kind),
                    t("companySettings.removed"),
                  )
                }}
              >
                <Trash2Icon aria-hidden />
                {t("companySettings.remove")}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      {error ? (
        <FieldError id={`${ids}-error`} role="alert">
          {error}
        </FieldError>
      ) : null}
    </div>
  )
}

/* ------------------------------ Філії ------------------------------ */

type BranchInput = Omit<Branch, "id">

/** Філії компанії: додати, змінити, видалити. */
export function CompanyBranchesSection() {
  const t = useErpUiT()
  const provider = useErpAuthProvider()
  const errorText = useAuthErrorText()
  const refresh = useRefreshCompany()
  const canEdit = useHasPermission("company", "update")
  const query = useCompanyProfile()
  const [editing, setEditing] = React.useState<Branch | "new" | null>(null)
  const [removing, setRemoving] = React.useState<Branch | null>(null)
  const [busy, setBusy] = React.useState(false)

  return (
    <ProfileState query={query} rows={2}>
      {(profile) => (
        <div className="@container space-y-4" data-slot="company-branches">
          {profile.branches.length ? (
            <ul
              className="divide-y rounded-lg border"
              aria-label={t("companySettings.branchesTitle")}
            >
              {profile.branches.map((branch) => (
                <li
                  key={branch.id}
                  className="flex flex-col gap-3 p-3 @lg:flex-row @lg:items-center"
                >
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="text-sm font-medium">
                      {branch.code
                        ? `${branch.name} · ${branch.code}`
                        : branch.name}
                    </p>
                    {branch.address || branch.phone ? (
                      <p className="text-sm text-muted-foreground">
                        {[
                          branch.address,
                          branch.phone ? formatPhone(branch.phone) : "",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    ) : null}
                  </div>
                  {canEdit ? (
                    <div className="flex gap-2 @lg:shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        aria-label={t("companySettings.editBranchFor", {
                          name: branch.name,
                        })}
                        onClick={() => {
                          setEditing(branch)
                        }}
                      >
                        <PencilIcon aria-hidden />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={t("companySettings.removeBranchFor", {
                          name: branch.name,
                        })}
                        onClick={() => {
                          setRemoving(branch)
                        }}
                      >
                        <Trash2Icon aria-hidden />
                      </Button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t("companySettings.branchesEmpty")}
            </p>
          )}
          {canEdit ? (
            <Button
              variant="outline"
              onClick={() => {
                setEditing("new")
              }}
            >
              <PlusIcon aria-hidden />
              {t("companySettings.addBranch")}
            </Button>
          ) : null}

          {editing ? (
            <BranchDialog
              branch={editing === "new" ? null : editing}
              onClose={() => {
                setEditing(null)
              }}
              onSaved={() => {
                setEditing(null)
                toast.success(t("companySettings.branchSaved"))
                void refresh()
              }}
            />
          ) : null}

          <Dialog
            open={removing !== null}
            onOpenChange={(next) => {
              if (!next) setRemoving(null)
            }}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {t("companySettings.removeBranchTitle", {
                    name: removing?.name ?? "",
                  })}
                </DialogTitle>
                <DialogDescription>
                  {t("companySettings.removeBranchDescription")}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setRemoving(null)
                  }}
                >
                  {t("auth.account.cancel")}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={busy}
                  onClick={() => {
                    if (!removing) return
                    setBusy(true)
                    provider.company
                      .removeBranch(removing.id)
                      .then(async () => {
                        setRemoving(null)
                        await refresh()
                        toast.success(t("companySettings.branchRemoved"))
                      })
                      .catch((failure: unknown) => {
                        toast.error(errorText(failure))
                      })
                      .finally(() => {
                        setBusy(false)
                      })
                  }}
                >
                  {busy ? <Spinner aria-hidden /> : null}
                  {t("companySettings.remove")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}
    </ProfileState>
  )
}

function BranchDialog({
  branch,
  onClose,
  onSaved,
}: {
  branch: Branch | null
  onClose: () => void
  onSaved: () => void
}) {
  const t = useErpUiT()
  const provider = useErpAuthProvider()
  const errorText = useAuthErrorText()
  const fieldError = useFieldError()
  const ids = React.useId()
  const [values, setValues] = React.useState<Required<BranchInput>>({
    name: branch?.name ?? "",
    code: branch?.code ?? "",
    address: branch?.address ?? "",
    phone: branch?.phone ?? "",
  })
  const [nameError, setNameError] = React.useState<string>()
  const [phoneError, setPhoneError] = React.useState<string>()
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const set = (key: keyof BranchInput) => (value: string) => {
    setValues((current) => ({ ...current, [key]: value }))
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent>
        <form
          className="grid gap-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            const nameIssue = values.name.trim()
              ? undefined
              : t("auth.fieldErrors.required")
            const phoneIssue = values.phone ? validatePhone(values.phone) : null
            setNameError(nameIssue)
            setPhoneError(
              phoneIssue ? t(`validation.phone.${phoneIssue}`) : undefined,
            )
            if (nameIssue || phoneIssue) return
            const input: BranchInput = {
              name: values.name.trim(),
              code: values.code.trim(),
              address: values.address.trim(),
              phone: values.phone.trim(),
            }
            setBusy(true)
            setError(null)
            ;(branch
              ? provider.company.updateBranch(branch.id, input)
              : provider.company.createBranch(input)
            )
              .then(onSaved)
              .catch((failure: unknown) => {
                const message = fieldError(failure, "name")
                if (message) setNameError(message)
                else setError(errorText(failure))
              })
              .finally(() => {
                setBusy(false)
              })
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {branch
                ? t("companySettings.editBranchTitle")
                : t("companySettings.addBranchTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("companySettings.branchesDescription")}
            </DialogDescription>
          </DialogHeader>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <Field data-invalid={nameError ? true : undefined}>
            <FieldLabel htmlFor={`${ids}-name`}>
              {t("companySettings.branchName")}
            </FieldLabel>
            <Input
              id={`${ids}-name`}
              value={values.name}
              maxLength={100}
              autoComplete="off"
              aria-invalid={nameError ? true : undefined}
              aria-describedby={nameError ? `${ids}-name-error` : undefined}
              onChange={(event) => {
                set("name")(event.target.value)
              }}
            />
            {nameError ? (
              <FieldError id={`${ids}-name-error`}>{nameError}</FieldError>
            ) : null}
          </Field>
          <Field>
            <FieldLabel htmlFor={`${ids}-code`}>
              {t("companySettings.branchCode")}
            </FieldLabel>
            <Input
              id={`${ids}-code`}
              value={values.code}
              maxLength={20}
              autoComplete="off"
              onChange={(event) => {
                set("code")(event.target.value)
              }}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${ids}-address`}>
              {t("companySettings.branchAddress")}
            </FieldLabel>
            <Input
              id={`${ids}-address`}
              value={values.address}
              maxLength={300}
              autoComplete="off"
              onChange={(event) => {
                set("address")(event.target.value)
              }}
            />
          </Field>
          <Field data-invalid={phoneError ? true : undefined}>
            <FieldLabel htmlFor={`${ids}-phone`}>
              {t("companySettings.branchPhone")}
            </FieldLabel>
            <PhoneInput
              id={`${ids}-phone`}
              value={values.phone}
              aria-invalid={phoneError ? true : undefined}
              aria-describedby={phoneError ? `${ids}-phone-error` : undefined}
              onValueChange={set("phone")}
            />
            {phoneError ? (
              <FieldError id={`${ids}-phone-error`}>{phoneError}</FieldError>
            ) : null}
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t("auth.account.cancel")}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? <Spinner aria-hidden /> : null}
              {t("companySettings.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
