/**
 * Моки модуля B1 на MSW (ADR-0002, ADR-0003): організації (закріплення, детальний запис з адресами
 * й рахунками), контакти (закріплення), сегменти. Сценарії `success`, `error`, `empty`, `slow`,
 * `conflict`, `forbidden`, `offline` — для кожного ресурсу окремо (`lib/mock-scenarios`, панель
 * розробника), права — `<ресурс>:<дія>` поточного користувача моків.
 *
 *   const contacts = createContactsMocks({ extension: contactsMockExtension })
 *   setupWorker(...platform, ...contacts.handlers)
 *
 * Поля й статуси розширення проекту (`ContactsMockExtension`) — у схемі й у фікстурах: проект з
 * розширенням працює на моках так само, як на бекенді.
 */
import { withMockValues } from "@/lib/extension-fields"
import type { KeyedChanges } from "@/lib/extensions"
import { createResourceHandlers } from "@/lib/mocks"
import type { ExtensionStatus } from "@/lib/statuses"

import {
  CONTACTS,
  contactSchemaFor,
  ORGANIZATIONS,
  organizationSchemaFor,
  SEGMENTS,
  segmentSchema,
  type Organization,
  type OrganizationDetail,
} from "./contract"
import type { ContactsMockExtension } from "./extension"
import {
  createContactsFixtures,
  type ContactsFixtureOptions,
  type ContactsFixtures,
} from "./fixtures"
import { CONTACTS_RESOURCES } from "./resources"

export interface ContactsMocksOptions extends ContactsFixtureOptions {
  /** Поля й статуси розширення проекту — дані без компонентів. */
  readonly extension?: ContactsMockExtension
  /** Початок адрес API, як у `createResourceHandlers` (за замовчуванням `/api/v1`). */
  readonly baseUrl?: string
}

const NO_DETAIL: OrganizationDetail = { addresses: [], bankAccounts: [] }

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
  // Адреси й рахунки не змінюються з UI модуля — одна копія на весь час моків.
  let details: ContactsFixtures["details"] | null = null
  const detailOf = (id: string) =>
    (details ??= fixtures().details).get(id) ?? NO_DETAIL

  const organizations = createResourceHandlers({
    resource: ORGANIZATIONS,
    baseUrl,
    schema: organizationSchemaFor(extension?.organizations),
    data: () =>
      withMockValues(
        withMockStatuses(
          fixtures().organizations,
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
    },
    detail: (organization) => detailOf(organization.id),
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
