import { uaIdIssueKey } from "@/registry/erp/ua-id-input"
import { isApiError } from "@/registry/lib/api"
import type { Palette } from "@/registry/lib/appearance"
import type {
  CompanyKind,
  CompanyProfile,
  CompanyUpdate,
} from "@/registry/lib/company"
import type { ErpUiTranslate } from "@/registry/lib/i18n"
import { validatePhone } from "@/registry/lib/phone"
import {
  validateUaId,
  type UaIdIssue,
  type UaIdKind,
} from "@/registry/lib/ua-ids"

/** Значення форми реквізитів (erp/company-settings): перевірка поля й зміни для `PATCH /company`. */

export interface Fields {
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
export type Key = keyof Fields

export const fieldsOf = (profile: CompanyProfile): Fields => ({
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

/** Перевірка одного поля, як на сервері (SPEC §8.3: при виході з поля й під час виправлення). */
export function checkField(
  t: ErpUiTranslate,
  key: Key,
  all: Fields,
): string | undefined {
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

/** Поля реквізитів для майстра й чек-листа: лише видимі, бо приховане поле нічого не вирішує. */
export function requisiteKeys(values: Fields): Key[] {
  return [
    "name",
    "legalName",
    "kind",
    values.kind === "legal" ? "edrpou" : "rnokpp",
    "vatPayer",
    ...(values.vatPayer ? (["vatIpn"] as const) : []),
    "iban",
    "bankName",
  ]
}

/** Реквізити заповнено за тими самими правилами, що у формі: їх можна покласти в документи. */
export function isRequisitesDone(
  t: ErpUiTranslate,
  profile: CompanyProfile,
): boolean {
  const values = fieldsOf(profile)
  return requisiteKeys(values).every((key) => !checkField(t, key, values))
}

/** Помилки всіх полів перед відправкою. */
export function checkAll(
  t: ErpUiTranslate,
  values: Fields,
): Partial<Record<Key, string>> {
  return Object.fromEntries(
    (Object.keys(values) as Key[])
      .map((key) => [key, checkField(t, key, values)] as const)
      .filter(([, message]) => message),
  )
}

/** Серверні коди полів (422) для цих полів; порожньо — помилка не про поля. */
export function serverFieldErrors(
  t: ErpUiTranslate,
  failure: unknown,
  keys: readonly Key[],
  fieldError: (failure: unknown, field: string) => string | null | undefined,
): Partial<Record<Key, string>> {
  const codes = isApiError(failure) ? failure.fieldErrors : undefined
  const errors: Partial<Record<Key, string>> = {}
  for (const key of keys) {
    const code = codes?.[key]
    if (!code) continue
    errors[key] =
      isUaIdField(key) && UA_ID_ISSUES.includes(code)
        ? t(uaIdIssueKey(key, code as UaIdIssue))
        : (fieldError(failure, key) ?? undefined)
  }
  return errors
}

/** Змінені поля для `PATCH /company`: директор іде парою, порожня палітра — `null`. */
export function patchOf(
  values: Fields,
  changed: readonly Key[],
): CompanyUpdate {
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
  return patch
}
