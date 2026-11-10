/**
 * Реквізити сторони документа (UI45, ADR-0068): хто виступає замовником і виконавцем, з реквізитами UA,
 * підписантом, «в особі» й «діє на підставі». Сторона — знімок у документі: зміна картки контрагента чи
 * профілю компанії підписаного документа не змінює.
 *
 * - Юрособа має ЄДРПОУ (8 цифр), ФОП — РНОКПП (10 цифр), як у профілі компанії (`lib/company`).
 * - «В особі» — посада й ПІБ підписанта в родовому відмінку одним полем, вручну («директора Коваль Олени
 *   Вікторівни»; рішення власника 09.11.2026). ФОП діє сам: посади й «в особі» в нього немає.
 * - ПІБ — у порядку «Прізвище Ім'я По батькові», з нього підпис «Олена КОВАЛЬ» (SPEC §11).
 * - Порожнє поле — не вказано: на аркуші такого рядка немає.
 * - Блоки аркуша й форма чекають рядки в кожному полі: дані сервера — після `partyDetailsSchema.parse`.
 * - Нове поле сторони додається необов'язковим із порожнім значенням за замовчуванням: обов'язкове
 *   ламало б сторони, які проекти будують самі (мажорна версія, правило 8).
 */
import { z } from "zod"

import {
  COMPANY_KINDS,
  type CompanyKind,
  type CompanyProfile,
} from "@/registry/lib/company"

/** Ролі сторін: наша компанія виступає однією з них, контрагент — другою. */
export const PARTY_ROLES = ["customer", "contractor"] as const
export type PartyRole = (typeof PARTY_ROLES)[number]

export const otherPartyRole = (role: PartyRole): PartyRole =>
  role === "customer" ? "contractor" : "customer"

const text = z.string().default("")

/** Сторона у відповіді сервера: поля, яких бекенд не віддає, — порожні. */
export const partyDetailsSchema = z.object({
  kind: z.enum(COMPANY_KINDS),
  /** Повна назва для документів: ТОВ «Зоряна логістика», ФОП Коваленко Олена Вікторівна. */
  name: text,
  /** ЄДРПОУ юрособи чи РНОКПП ФОП. */
  code: text,
  /** ІПН платника ПДВ; порожній — не платник. */
  vatIpn: text,
  iban: text,
  bankName: text,
  address: text,
  phone: text,
  email: text,
  /** Посада підписанта юрособи: «Директор». */
  signerPosition: text,
  /** ПІБ підписанта: «Коваль Олена Вікторівна»; у ФОП — він сам. */
  signerName: text,
  /** Посада й ПІБ у родовому відмінку: «директора Коваль Олени Вікторівни». */
  representedBy: text,
  /** «Діє на підставі»: «Статуту», «Виписки з ЄДР», «Довіреності № 12 від 01.10.2026». */
  basis: text,
})
export type PartyDetails = z.output<typeof partyDetailsSchema>
export type PartyField = keyof PartyDetails
type PartyTextField = Exclude<PartyField, "kind">

/** Текстові поля сторони в порядку форми. */
export const PARTY_TEXT_FIELDS = [
  "name",
  "code",
  "vatIpn",
  "iban",
  "bankName",
  "address",
  "phone",
  "email",
  "signerPosition",
  "signerName",
  "representedBy",
  "basis",
] as const satisfies readonly PartyTextField[]

/** Поле схеми без місця в списку — помилка типів тут, а не порожнє поле на аркуші. */
type MissingPartyField = Exclude<
  PartyTextField,
  (typeof PARTY_TEXT_FIELDS)[number]
>
const allPartyFieldsListed: [MissingPartyField] extends [never] ? true : never =
  true
void allPartyFieldsListed

/** Поля лише юрособи: ФОП підписує сам, без посади й «в особі». */
export const LEGAL_ONLY_PARTY_FIELDS = [
  "signerPosition",
  "representedBy",
] as const satisfies readonly PartyTextField[]

export const isPartyFieldShown = (field: PartyField, kind: CompanyKind) =>
  kind === "legal" ||
  !(LEGAL_ONLY_PARTY_FIELDS as readonly PartyField[]).includes(field)

/** Порожня сторона нового документа. */
export function emptyPartyDetails(kind: CompanyKind = "legal"): PartyDetails {
  return {
    kind,
    name: "",
    code: "",
    vatIpn: "",
    iban: "",
    bankName: "",
    address: "",
    phone: "",
    email: "",
    signerPosition: "",
    signerName: "",
    representedBy: "",
    basis: "",
  }
}

const isBlank = (value: string | undefined) => !value?.trim()

export interface PartyFill {
  values: PartyDetails
  /** Поля, які заповнило джерело; вид — коли змінився разом із кодом. */
  filled: PartyField[]
}

/**
 * Заповнює лише порожні поля сторони з джерела (профіль компанії, картка контрагента): введене людиною
 * не перезаписується. Вид іде разом із кодом: береться з джерела, лише коли код ще порожній. Поля
 * юрособи у ФОП не заповнюються.
 */
export function fillEmptyPartyFields(
  current: PartyDetails,
  source: Partial<PartyDetails>,
): PartyFill {
  const filled: PartyField[] = []
  const takesKind =
    isBlank(current.code) &&
    !isBlank(source.code) &&
    source.kind !== undefined &&
    source.kind !== current.kind
  const kind = takesKind && source.kind ? source.kind : current.kind
  if (kind !== current.kind) filled.push("kind")
  const values: PartyDetails = { ...current, kind }
  for (const field of PARTY_TEXT_FIELDS) {
    const next = source[field]?.trim()
    if (!next || !isBlank(current[field]) || !isPartyFieldShown(field, kind))
      continue
    values[field] = next
    filled.push(field)
  }
  return { values, filled }
}

/**
 * Повна сторона з часткових реквізитів (профіль компанії, картка клієнта, засів моків): вид — з джерела,
 * решта полів порожні. Поля юрособи у ФОП не беруться.
 */
export function partyDetailsFrom(source: Partial<PartyDetails>): PartyDetails {
  return fillEmptyPartyFields(emptyPartyDetails(source.kind), source).values
}

/** «ФОП Коваленко Олена Вікторівна» → ПІБ: так підписант ФОП береться з назви. */
const FOP_NAME_PREFIX = /^(?:ФОП|фізична\s+особа[\s-]+підприємець)\s+/iu

/** Сторона з профілю компанії (A1, `lib/company`): ІПН — лише платника ПДВ. */
export function partyFromCompany(
  company: Pick<
    CompanyProfile,
    | "legalName"
    | "kind"
    | "edrpou"
    | "rnokpp"
    | "vatPayer"
    | "vatIpn"
    | "iban"
    | "bankName"
    | "address"
    | "phone"
    | "email"
    | "director"
  >,
): Partial<PartyDetails> {
  const fop = company.kind === "fop"
  return {
    kind: company.kind,
    name: company.legalName,
    code: (fop ? company.rnokpp : company.edrpou) ?? "",
    vatIpn: company.vatPayer ? (company.vatIpn ?? "") : "",
    iban: company.iban ?? "",
    bankName: company.bankName ?? "",
    address: company.address ?? "",
    phone: company.phone ?? "",
    email: company.email ?? "",
    signerPosition: company.director?.position ?? "",
    signerName:
      company.director?.name ??
      (fop ? company.legalName.replace(FOP_NAME_PREFIX, "") : ""),
  }
}

/**
 * Підпис на документі «Олена КОВАЛЬ» (SPEC §11, ДСТУ 4163): ім'я й прізвище великими з ПІБ у порядку
 * «Прізвище Ім'я По батькові». Одне слово — прізвище великими; порожньо — порожньо.
 */
export function signatureName(fullName: string): string {
  const [surname, given] = fullName.trim().split(/\s+/u)
  if (!surname) return ""
  const upper = surname.toLocaleUpperCase("uk")
  return given ? `${given} ${upper}` : upper
}

/** Сторони за ролями: наша компанія — `ourRole`, контрагент — друга роль. */
export function partiesByRole<T>(
  ourRole: PartyRole,
  ours: T,
  theirs: T,
): Record<PartyRole, T> {
  return ourRole === "customer"
    ? { customer: ours, contractor: theirs }
    : { customer: theirs, contractor: ours }
}
