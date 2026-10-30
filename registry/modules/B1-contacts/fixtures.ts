/**
 * Демо-дані модуля B1 українською й англійською (SPEC §17) — вони ж шаблон даних для першого запуску
 * (PF12). Коди ЄДРПОУ й РНОКПП і IBAN — з дійсними контрольними цифрами (LC12). Назви — дані, а не
 * рядки інтерфейсу: мова даних (`locale`) окремо від мови інтерфейсу (SPEC §11).
 */
import { edrpouCheckDigit, rnokppCheckDigit } from "@/lib/ua-ids"

import {
  CONTACTS,
  ORGANIZATIONS,
  type Address,
  type BankAccount,
  type Contact,
  type Organization,
  type OrganizationDetail,
  type Segment,
} from "./contract"
import {
  BANKS,
  CITIES,
  domainOf,
  FIRST_NAMES,
  LAST_NAMES,
  latin,
  ORGANIZATION_NAMES,
  localizedOrganizationName,
  POSITIONS,
  POSTAL_CODES,
  SEGMENTS,
  STREETS,
} from "./fixture-data"

export type FixtureLocale = "uk" | "en"

export interface ContactsFixtureOptions {
  readonly locale?: FixtureLocale
  /** Компанія користувача (тенант) запису № i; за замовчуванням — спільний для всіх (`null`). */
  readonly companyOf?: (index: number) => string | null
  /**
   * Відповідальний запису № i (`id` людини компанії запису); за замовчуванням — нікого (`null`).
   * `resource` — організації чи контакти: щоб контакт міг належати не тому, кому його організація.
   */
  readonly responsibleOf?: (
    index: number,
    companyId: string | null,
    resource: typeof ORGANIZATIONS | typeof CONTACTS,
  ) => string | null
}

export interface ContactsFixtures {
  readonly segments: Segment[]
  readonly organizations: Organization[]
  /** Адреси й рахунки за `id` організації — детальний запис (`GET /organizations/:id`). */
  readonly details: ReadonlyMap<string, OrganizationDetail>
  readonly contacts: Contact[]
}

const CONTACT_COUNT = 60

/** IBAN UA з контрольними цифрами ISO 13616 (mod 97). */
function ibanOf(bankCode: string, account: string): string {
  const bban = `${bankCode}${account.padStart(19, "0")}`
  // «UA00» в кінець, літери — числами: U = 30, A = 10.
  const check = 98 - Number(BigInt(`${bban}301000`) % 97n)
  return `UA${String(check).padStart(2, "0")}${bban}`
}

const pad = (n: number, length: number) => String(n).padStart(length, "0")
const at = <T>(list: readonly T[], index: number): T =>
  list[index % list.length]

/** Статус: кожна 7-ма — потенційна, кожна 9-та — неактивна, решта — активні. */
function statusOf(index: number): Organization["status"] {
  if (index > 0 && index % 9 === 0) return "inactive"
  if (index % 7 === 6) return "prospect"
  return "active"
}

function segmentsOf(index: number): string[] {
  const list: string[] = [index % 4 === 3 ? "seg-supplier" : "seg-client"]
  if (index % 5 === 0) list.push("seg-key")
  if (index % 6 === 2) list.push("seg-partner")
  if (statusOf(index) === "prospect") list.push("seg-new")
  return list
}

function detailOf(
  organization: Organization,
  index: number,
  locale: FixtureLocale,
): OrganizationDetail {
  const city = at(CITIES[locale], index)
  const legal: Address = {
    id: `${organization.id}-addr-1`,
    kind: "legal",
    line: `${at(STREETS[locale], index)}, ${String(((index * 7) % 120) + 1)}`,
    city,
    postalCode: at(POSTAL_CODES, index),
    country: "UA",
  }
  const addresses: Address[] = [legal]
  if (index % 3 === 1)
    addresses.push({
      ...legal,
      id: `${organization.id}-addr-2`,
      kind: "actual",
      line: `${at(STREETS[locale], index + 3)}, ${String(((index * 11) % 90) + 2)}`,
    })
  const bank = at(BANKS, index)
  const bankAccounts: BankAccount[] = [
    {
      id: `${organization.id}-acc-1`,
      iban: organization.iban,
      bankName: bank[locale],
      currency: "UAH",
      primary: true,
    },
  ]
  if (index % 4 === 2) {
    const other = at(BANKS, index + 1)
    bankAccounts.push({
      id: `${organization.id}-acc-2`,
      iban: ibanOf(other.code, `26001${pad(81_207 + index * 89, 10)}`),
      bankName: other[locale],
      currency: index % 8 === 2 ? "EUR" : "USD",
      primary: false,
    })
  }
  return { addresses, bankAccounts }
}

function contactsFor(
  organizations: readonly Organization[],
  locale: FixtureLocale,
  companyOf: (index: number) => string | null,
  responsibleOf: NonNullable<ContactsFixtureOptions["responsibleOf"]>,
): Contact[] {
  return Array.from({ length: CONTACT_COUNT }, (_, i) => {
    const first = at(FIRST_NAMES, i)
    const last = at(LAST_NAMES, i * 5 + Math.floor(i / FIRST_NAMES.length))
    // Кожен третій — приватна особа; решта — представники організацій по черзі.
    const organization = i % 3 === 2 ? null : at(organizations, i)
    const name =
      locale === "uk" ? `${first} ${last}` : `${latin(first)} ${latin(last)}`
    const login = `${latin(first).toLowerCase()}.${latin(last).toLowerCase()}`
    const companyId = organization
      ? (organization.companyId ?? null)
      : companyOf(i)
    return {
      id: `contact-${pad(i + 1, 3)}`,
      version: 1,
      name,
      position: organization ? at(POSITIONS[locale], i) : "",
      organizationId: organization?.id ?? null,
      phone: `+38050${pad(3_401_220 + i * 5_317, 7)}`,
      email: organization
        ? `${login}@${domainOf(at(ORGANIZATION_NAMES, i))}`
        : `${login}@example.com`,
      segments: i % 4 === 0 ? ["seg-key"] : [],
      companyId,
      responsibleId: responsibleOf(i, companyId, CONTACTS),
    }
  })
}

export function createContactsFixtures({
  locale = "uk",
  companyOf = () => null,
  responsibleOf = () => null,
}: ContactsFixtureOptions = {}): ContactsFixtures {
  const segments: Segment[] = SEGMENTS.map((segment) => ({
    id: segment.id,
    version: 1,
    name: segment[locale],
    companyId: null,
  }))
  const details = new Map<string, OrganizationDetail>()
  const organizations: Organization[] = ORGANIZATION_NAMES.map((name, i) => {
    const isFop = name.startsWith("ФОП")
    const body = isFop
      ? pad(301_234_560 + i * 7919, 9)
      : pad(4_123_400 + i * 613, 7)
    const check = isFop ? rnokppCheckDigit(body) : edrpouCheckDigit(body)
    const organization: Organization = {
      id: `org-${pad(i + 1, 3)}`,
      version: 1,
      name: localizedOrganizationName(name, locale),
      type: isFop ? "fop" : "legal",
      code: `${body}${String(check)}`,
      iban: ibanOf(at(BANKS, i).code, `26000${pad(52_341 + i * 97, 10)}`),
      phone: `+38067${pad(1_204_310 + i * 4_271, 7)}`,
      email: `office@${domainOf(name)}`,
      city: at(CITIES[locale], i),
      status: statusOf(i),
      segments: segmentsOf(i),
      companyId: companyOf(i),
      responsibleId: responsibleOf(i, companyOf(i), ORGANIZATIONS),
    }
    details.set(organization.id, detailOf(organization, i, locale))
    return organization
  })
  return {
    segments,
    organizations,
    details,
    contacts: contactsFor(organizations, locale, companyOf, responsibleOf),
  }
}
