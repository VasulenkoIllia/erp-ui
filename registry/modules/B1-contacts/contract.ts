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
 * - Права — `<ресурс>:<дія>`: `read`, `create`, `update`, `delete` (ADR-0014); організації й контакти —
 *   ще й `read:own`, `update:own`, `delete:own`, лише свої записи (ADR-0039).
 * - Відповідальний — `responsibleId` організації й контакту: `id` людини з довідника `users` чи `null`
 *   (нічий запис). `POST` без нього — автор; `PATCH` з іншим значенням — передача колезі, окремого
 *   права немає; чужа компанія, заблокована людина чи людина без права бачити ресурс — 422
 *   `responsibleId: invalid`. Бекенд без поля працює: у списку й картці «—», розширення ховає поле.
 *
 * Поля й статуси розширення проекту (ADR-0020) входять у схему через `organizationSchemaFor` і
 * `contactSchemaFor`: без них zod відкинув би нові поля відповіді. Ця ж схема розбирає `current`
 * конфлікту 409 у формах (ADR-0026): порівняння показує й поля розширення.
 *
 * Створення — `POST` з усіма полями форми; зміна — `PATCH` лише змінених полів з `version`.
 *
 * Адреси й рахунки (ADR-0028) змінюються `PATCH /organizations/:id` з усією колекцією
 * (`addresses` чи `bankAccounts`) і `version`: колекція замінюється цілком, тож версія не дає затерти
 * чужу зміну (409 з `current`). Новий елемент — без `id`, його дає сервер. Основний рахунок — рівно
 * один, якщо рахунки є: сервер робить основним перший, коли жоден не позначений (видалили основний),
 * і лишає перший позначений, коли їх кілька; `iban` організації — його IBAN. Помилки елемента — 422
 * `fieldErrors` з шляхом `bankAccounts.<індекс>.iban` (`invalid`, `duplicate` — той самий IBAN двічі).
 */
import { z } from "zod"

import { recordBaseSchema } from "@/lib/api"
import type { LocalizedText } from "@/lib/auth"
import {
  extendSchema,
  type ExtensionField,
  type ExtensionValues,
} from "@/lib/extension-fields"
import { statusSchema, type ExtensionStatusChanges } from "@/lib/statuses"

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
export const DEFAULT_ORGANIZATION_STATUS: OrganizationStatus = "active"

export const ADDRESS_KINDS = ["legal", "actual", "postal"] as const
export type AddressKind = (typeof ADDRESS_KINDS)[number]

/** Поля, що є в кожному записі ресурсу: компанія користувача (тенант) і закріплення читачем. */
const recordShape = {
  companyId: z.string().nullable().optional(),
  pinned: z.boolean().optional(),
}

/** Ключ поля відповідального: той самий у колонці, фільтрі, шапці картки й формі. */
export const RESPONSIBLE_ID = "responsibleId" as const

/** Поле відповідального — запис із довідника `users`, як поле-запис розширення (ADR-0030). */
export const responsibleExtensionField = (label: LocalizedText) =>
  ({
    id: RESPONSIBLE_ID,
    type: "record",
    label,
    resource: "users",
    labelField: "name",
    descriptionField: "email",
  }) satisfies ExtensionField

/** Організація й контакт мають відповідального: «свої» записи (ADR-0039); сегмент — ні. */
const responsibleShape = {
  [RESPONSIBLE_ID]: z.string().nullable().optional(),
}

export const segmentSchema = recordBaseSchema.extend({
  name: z.string().trim().min(1),
  companyId: recordShape.companyId,
})
export type Segment = z.infer<typeof segmentSchema>

const organizationShape = recordBaseSchema.extend({
  ...recordShape,
  ...responsibleShape,
  name: z.string().trim().min(1),
  type: z.enum(ORGANIZATION_TYPES),
  /** ЄДРПОУ чи РНОКПП; порожній — не вказано. */
  code: z.string(),
  /**
   * IBAN основного рахунку (з `bankAccounts`); порожній — рахунків немає. Веде сервер, форма його не
   * надсилає: у створенні без нього — порожній.
   */
  iban: z.string().default(""),
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
  ...responsibleShape,
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
  readonly statuses?: ExtensionStatusChanges<OrganizationStatus>
}

export interface ContactSchemaExtension {
  readonly fields?: readonly ExtensionField[]
}

const organizationObject = (extension?: OrganizationSchemaExtension) =>
  organizationShape.extend({
    status: statusSchema(ORGANIZATION_STATUSES, extension?.statuses).default(
      DEFAULT_ORGANIZATION_STATUS,
    ),
  })

/** Схема організації зі статусами й полями розширення; статус за замовчуванням — `active`. */
export function organizationSchemaFor(extension?: OrganizationSchemaExtension) {
  return extendSchema(organizationObject(extension), extension?.fields)
}

/** Схеми колекцій картки: моки беруть свої — з `id` новим елементам і перевіркою IBAN. */
type OrganizationDetailShape = {
  readonly [K in keyof OrganizationDetail]: z.ZodType<
    OrganizationDetail[K],
    unknown
  >
}

/**
 * Детальний запис організації (`GET /organizations/:id`, відповідь `PATCH` і `current` 409): запис з
 * адресами й рахунками. Розбирає конфлікт у формах адреси й рахунку. Поле розширення з ключем
 * колекції (`addresses`) — помилка розробника, як і з ключем поля модуля.
 */
export function organizationCardSchemaFor(
  extension?: OrganizationSchemaExtension,
  detail: OrganizationDetailShape = organizationDetailSchema.shape,
): z.ZodType<OrganizationCard> {
  return extendSchema(
    organizationObject(extension).extend(detail),
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
/** Організація з адресами й рахунками — детальний запис картки. */
export type OrganizationCard = Organization & OrganizationDetail
export type Contact = z.output<typeof contactShape> & ExtensionValues
