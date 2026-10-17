/**
 * Контракт модуля B1 «Контакти й компанії» (SPEC §14, §17; ADR-0002, ADR-0019, ADR-0024, ADR-0025).
 *
 * Ресурси (`/api/v1/<ресурс>`, плоскі параметри списку, відповідь `{ data, total }`):
 * - `organizations` — організації: юрособа (ЄДРПОУ) чи ФОП (РНОКПП). Список віддає запис без
 *   вкладених колекцій; `GET /organizations/:id`, `POST` і `PATCH` — детальний запис з адресами й
 *   банківськими рахунками (ADR-0019). `iban` у записі — основний рахунок для списку й вибору,
 *   його веде сервер з `bankAccounts`.
 * - `contacts` — особи: представник організації (`organizationId`) чи приватна особа (`null`);
 *   контакти організації — `GET /contacts?organizationId=<id>`, з організацією — фільтр
 *   `organizationId_ne=null`.
 * - `segments` — довідник сегментів (кілька в записі: `segments=seg-key&segments=seg-vip` —
 *   «хоч один із»).
 * - Закріплення угорі списку — `PUT`/`DELETE /<ресурс>/:id/pin` для організацій і контактів
 *   (ADR-0024); розмір сторінки списку — `/me/list-settings/<ресурс>`.
 * - Права — `<ресурс>:<дія>`: `read`, `create`, `update`, `delete` (ADR-0014).
 *
 * Поля й статуси розширення проекту (ADR-0020) входять у схему через `organizationSchemaFor` і
 * `contactSchemaFor`: без них zod відкинув би нові поля відповіді.
 */
import { z } from "zod"

import { recordBaseSchema } from "@/lib/api"
import {
  extendSchema,
  type ExtensionField,
  type ExtensionValues,
} from "@/lib/extension-fields"
import type { KeyedChanges } from "@/lib/extensions"
import { statusSchema, type ExtensionStatus } from "@/lib/statuses"

export {
  CONTACTS,
  CONTACTS_RESOURCES,
  ORGANIZATIONS,
  SEGMENTS,
} from "./resources"

/** Юрособа — ЄДРПОУ (8 цифр), ФОП — РНОКПП (10 цифр). */
export const ORGANIZATION_TYPES = ["legal", "fop"] as const
export type OrganizationType = (typeof ORGANIZATION_TYPES)[number]

/** Статуси організації модуля; розширення додає свої (`statuses`). */
export const ORGANIZATION_STATUSES = ["active", "prospect", "inactive"] as const
export type OrganizationStatus = (typeof ORGANIZATION_STATUSES)[number]
/** Статус нової організації, якщо форма його не передала. */
const DEFAULT_ORGANIZATION_STATUS: OrganizationStatus = "active"

export const ADDRESS_KINDS = ["legal", "actual", "postal"] as const
export type AddressKind = (typeof ADDRESS_KINDS)[number]

/** Поля, що є в кожному записі ресурсу: компанія користувача (тенант) і закріплення читачем. */
const recordShape = {
  companyId: z.string().nullable().optional(),
  pinned: z.boolean().optional(),
}

export const segmentSchema = recordBaseSchema.extend({
  name: z.string().trim().min(1),
  companyId: recordShape.companyId,
})
export type Segment = z.infer<typeof segmentSchema>

const organizationShape = recordBaseSchema.extend({
  ...recordShape,
  name: z.string().trim().min(1),
  type: z.enum(ORGANIZATION_TYPES),
  /** ЄДРПОУ чи РНОКПП; порожній — не вказано. */
  code: z.string(),
  /** IBAN основного рахунку (з `bankAccounts`); порожній — рахунків немає. */
  iban: z.string(),
  /** E.164: +380…; порожній — не вказано. */
  phone: z.string(),
  email: z.string(),
  city: z.string(),
  segments: z.array(z.string()).default([]),
})

export const addressSchema = z.object({
  id: z.string(),
  kind: z.enum(ADDRESS_KINDS),
  /** Вулиця, будинок, офіс. */
  line: z.string().trim().min(1),
  city: z.string(),
  postalCode: z.string(),
  /** ISO 3166-1 alpha-2. */
  country: z.string().length(2),
})
export type Address = z.infer<typeof addressSchema>

export const bankAccountSchema = z.object({
  id: z.string(),
  iban: z.string().trim().min(1),
  bankName: z.string(),
  /** ISO 4217. */
  currency: z.string().length(3),
  primary: z.boolean(),
})
export type BankAccount = z.infer<typeof bankAccountSchema>

/** Вкладені колекції детального запису організації (`GET /organizations/:id`). */
export const organizationDetailSchema = z.object({
  addresses: z.array(addressSchema),
  bankAccounts: z.array(bankAccountSchema),
})
export type OrganizationDetail = z.infer<typeof organizationDetailSchema>

const contactShape = recordBaseSchema.extend({
  ...recordShape,
  name: z.string().trim().min(1),
  /** Посада в організації. */
  position: z.string(),
  /** Організація, яку представляє особа; `null` — приватна особа. */
  organizationId: z.string().nullable(),
  phone: z.string(),
  email: z.string(),
  segments: z.array(z.string()).default([]),
})

/** Те, що схема запису бере з розширення проекту: нові поля й статуси. */
export interface OrganizationSchemaExtension {
  readonly fields?: readonly ExtensionField[]
  readonly statuses?: KeyedChanges<ExtensionStatus, OrganizationStatus>
}

export interface ContactSchemaExtension {
  readonly fields?: readonly ExtensionField[]
}

/** Схема організації зі статусами й полями розширення; статус за замовчуванням — `active`. */
export function organizationSchemaFor(extension?: OrganizationSchemaExtension) {
  return extendSchema(
    organizationShape.extend({
      status: statusSchema(ORGANIZATION_STATUSES, extension?.statuses).default(
        DEFAULT_ORGANIZATION_STATUS,
      ),
    }),
    extension?.fields,
  )
}

/** Схема контакту з полями розширення. */
export function contactSchemaFor(extension?: ContactSchemaExtension) {
  return extendSchema(contactShape, extension?.fields)
}

/** Організація в списку й картці; `status` — ключ модуля чи розширення. */
export type Organization = z.output<typeof organizationShape> & {
  status: string
} & ExtensionValues
export type Contact = z.output<typeof contactShape> & ExtensionValues
