/**
 * Моки модуля B1 на MSW (ADR-0002, ADR-0003): організації (закріплення, детальний запис з адресами
 * й рахунками — зберігаються разом із записом, ADR-0028), контакти (закріплення), сегменти. Сценарії `success`, `error`, `empty`, `slow`,
 * `conflict`, `forbidden`, `offline` — для кожного ресурсу окремо (`lib/mock-scenarios`, панель
 * розробника), права — `<ресурс>:<дія>` поточного користувача моків.
 *
 *   const contacts = createContactsMocks({ extension: contactsMockExtension })
 *   setupWorker(...platform, ...contacts.handlers)
 *
 * Поля й статуси розширення проекту (`ContactsMockExtension`) — у схемі й у фікстурах: проект з
 * розширенням працює на моках так само, як на бекенді.
 */
import { z } from "zod"

import { withMockValues } from "@/lib/extension-fields"
import type { KeyedChanges } from "@/lib/extensions"
import { createResourceHandlers } from "@/lib/mocks"
import type { ExtensionStatus } from "@/lib/statuses"
import { formatIban, normalizeIban, validateUaId } from "@/lib/ua-ids"

import {
  addressSchema,
  bankAccountSchema,
  CONTACTS,
  contactSchemaFor,
  ORGANIZATIONS,
  organizationCardSchemaFor,
  SEGMENTS,
  segmentSchema,
  type Address,
  type AddressKind,
  type BankAccount,
  type Organization,
  type OrganizationCard,
  type OrganizationSchemaExtension,
} from "./contract"
import type { ContactsMockExtension } from "./extension"
import {
  createContactsFixtures,
  type ContactsFixtureOptions,
  type ContactsFixtures,
  type FixtureLocale,
} from "./fixtures"
import { CONTACTS_RESOURCES } from "./resources"

export interface ContactsMocksOptions extends ContactsFixtureOptions {
  /** Поля й статуси розширення проекту — дані без компонентів. */
  readonly extension?: ContactsMockExtension
  /** Початок адрес API, як у `createResourceHandlers` (за замовчуванням `/api/v1`). */
  readonly baseUrl?: string
}

/** Новий елемент колекції приходить без `id`: його дає сервер. */
const itemId = z.string().default(() => crypto.randomUUID())

/** Той самий IBAN двічі в організації — 422 `duplicate` біля поля; IBAN з помилкою — `invalid`. */
function checkIbans(accounts: readonly BankAccount[], ctx: z.RefinementCtx) {
  const seen = new Set<string>()
  accounts.forEach((account, index) => {
    const issue = validateUaId("iban", account.iban)
    // Той самий рахунок з пробілами чи малими літерами — теж повтор.
    const iban = normalizeIban(account.iban)
    if (issue || seen.has(iban))
      ctx.addIssue({
        code: "custom",
        path: [index, "iban"],
        message: issue ? "invalid" : "duplicate",
      })
    seen.add(iban)
  })
}

const storedDetailSchema = z.object({
  addresses: z
    .array(
      addressSchema.extend({
        id: itemId,
        line: z.string().trim().min(1, "required"),
      }),
    )
    .default([]),
  bankAccounts: z
    .array(bankAccountSchema.extend({ id: itemId }))
    .default([])
    .superRefine(checkIbans),
})

/**
 * Основний рахунок — рівно один, якщо рахунки є: перший позначений, а коли жодного (видалили
 * основний) — перший. `iban` організації — його IBAN: веде сервер, а не форма.
 */
function withPrimaryAccount<T extends OrganizationCard>(record: T): T {
  const primary = Math.max(
    record.bankAccounts.findIndex((account) => account.primary),
    0,
  )
  const bankAccounts = record.bankAccounts.map((account, index) => ({
    ...account,
    primary: index === primary,
  }))
  return { ...record, bankAccounts, iban: bankAccounts[primary]?.iban ?? "" }
}

/** Схема збереженого запису: організація з адресами й рахунками, як її перевіряє сервер. */
const storedOrganizationSchema = (extension?: OrganizationSchemaExtension) =>
  organizationCardSchemaFor(extension, storedDetailSchema.shape).transform(
    withPrimaryAccount,
  )

/** Тип адреси мовою даних: зміна лише типу видна в «було → стало». */
const KIND_MARK = {
  uk: { legal: "юридична", actual: "фактична", postal: "поштова" },
  en: { legal: "registered", actual: "actual", postal: "postal" },
} as const satisfies Record<FixtureLocale, Record<AddressKind, string>>
/** Країна в журналі — лише не Україна: так коротше для більшості адрес. */
const HOME_COUNTRY = "UA"

/** Колекції в журналі змін — рядками, а не JSON. */
const addressText =
  (locale: FixtureLocale) => (addresses: readonly Address[]) =>
    addresses.map((address) =>
      [
        KIND_MARK[locale][address.kind],
        address.line,
        address.postalCode,
        address.city,
        address.country === HOME_COUNTRY ? "" : address.country,
      ]
        .filter(Boolean)
        .join(" · "),
    )
/** Позначка основного рахунку мовою даних: зміна основного видна в «було → стало». */
const PRIMARY_MARK = { uk: "основний", en: "main" } as const

const accountText =
  (locale: FixtureLocale) => (accounts: readonly BankAccount[]) =>
    accounts.map((account) =>
      [
        formatIban(account.iban),
        account.bankName,
        account.currency,
        account.primary ? PRIMARY_MARK[locale] : "",
      ]
        .filter(Boolean)
        .join(" · "),
    )

const labelOf = (name: string) =>
  CONTACTS_RESOURCES.find((resource) => resource.name === name)?.label

/** Нові статуси розширення з `mockEvery`: кожна N-та організація фікстур отримує цей статус. */
function withMockStatuses<T extends Organization>(
  records: T[],
  statuses?: KeyedChanges<ExtensionStatus, string>,
): T[] {
  const samples = (statuses?.add ?? []).filter(
    (status) => status.mockEvery !== undefined && status.mockEvery > 0,
  )
  if (!samples.length) return records
  return records.map((record, index) => {
    const sample = samples.find(
      (status) => (index + 1) % (status.mockEvery ?? 0) === 0,
    )
    return sample ? { ...record, status: sample.id } : record
  })
}

export function createContactsMocks({
  extension,
  baseUrl,
  ...fixtureOptions
}: ContactsMocksOptions = {}) {
  // Свіжі фікстури на кожне скидання моків: записи змінюються на місці (PATCH, закріплення).
  const fixtures = (): ContactsFixtures =>
    createContactsFixtures(fixtureOptions)
  // Адреси й рахунки — у записі організації: PATCH змінює їх разом із версією (ADR-0028).
  const organizationsWithDetail = () => {
    const { organizations: records, details } = fixtures()
    return records.map((organization) => ({
      ...organization,
      addresses: details.get(organization.id)?.addresses ?? [],
      bankAccounts: details.get(organization.id)?.bankAccounts ?? [],
    }))
  }

  const organizations = createResourceHandlers({
    resource: ORGANIZATIONS,
    baseUrl,
    schema: storedOrganizationSchema(extension?.organizations),
    data: () =>
      withMockValues(
        withMockStatuses(
          organizationsWithDetail(),
          extension?.organizations?.statuses,
        ),
        extension?.organizations?.fields,
      ),
    searchFields: ["name", "code"],
    label: labelOf(ORGANIZATIONS),
    fieldLabels: {
      name: { uk: "Назва", en: "Name" },
      code: { uk: "Код", en: "Code" },
      status: { uk: "Статус", en: "Status" },
      city: { uk: "Місто", en: "City" },
      phone: { uk: "Телефон", en: "Phone" },
      iban: { uk: "IBAN", en: "IBAN" },
      addresses: { uk: "Адреси", en: "Addresses" },
      bankAccounts: { uk: "Рахунки", en: "Bank accounts" },
    },
    detailFields: ["addresses", "bankAccounts"],
    auditValue: {
      addresses: addressText(fixtureOptions.locale ?? "uk"),
      bankAccounts: accountText(fixtureOptions.locale ?? "uk"),
    },
    pins: true,
  })

  const contacts = createResourceHandlers({
    resource: CONTACTS,
    baseUrl,
    schema: contactSchemaFor(extension?.contacts),
    data: () =>
      withMockValues(fixtures().contacts, extension?.contacts?.fields),
    searchFields: ["name", "phone", "email"],
    label: labelOf(CONTACTS),
    fieldLabels: {
      name: { uk: "Ім'я", en: "Name" },
      position: { uk: "Посада", en: "Position" },
      organizationId: { uk: "Організація", en: "Organization" },
      phone: { uk: "Телефон", en: "Phone" },
      email: { uk: "Email", en: "Email" },
    },
    pins: true,
  })

  const segments = createResourceHandlers({
    resource: SEGMENTS,
    baseUrl,
    schema: segmentSchema,
    data: () => fixtures().segments,
    searchFields: ["name"],
    label: labelOf(SEGMENTS),
    fieldLabels: { name: { uk: "Назва", en: "Name" } },
    // Назва сегмента не повторюється в компанії: 422 `duplicate` біля поля форми.
    unique: ["name"],
  })

  return {
    handlers: [
      ...organizations.handlers,
      ...contacts.handlers,
      ...segments.handlers,
    ],
    db: {
      organizations: organizations.db,
      contacts: contacts.db,
      segments: segments.db,
    },
  }
}
