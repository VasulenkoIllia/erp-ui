/**
 * Цілі модуля A4 (ADR-0050): що можна імпортувати й експортувати. Це дані: ресурс, підписи мовами, поля.
 * Модулі кіта ставляться окремо, тож файл не імпортує B1 чи A6, а лише знає їхні ресурси й поля. Ціль
 * без модуля в проекті ховає розширення (`targets.hide`), свої цілі воно додає (`targets.add`).
 *
 * Умови оплати A6 тут немає: частини оплати не лягають на один рядок таблиці. Контакт приходить без
 * організації, зв'язок ставить людина чи проект своїм полем.
 */
import type { RaRecord } from "ra-core"

import { localizedText, type LocalizedText } from "@/lib/auth"
import type { ExportColumn } from "@/lib/exports"
import {
  cellText,
  type ImportField,
  type ImportFieldType,
  type ImportParsed,
  type ImportTarget,
} from "@/lib/import-rows"
import { normalizePhone, validatePhone } from "@/lib/phone"
import type { SpreadsheetCell } from "@/lib/spreadsheet"

export interface TargetFieldDefinition {
  /** Поле запису. */
  readonly key: string
  readonly label: LocalizedText
  readonly required?: boolean
  /** Типово `text`. */
  readonly type?: ImportFieldType
  readonly options?: readonly {
    readonly value: string
    readonly label: LocalizedText
  }[]
  /** Інші назви колонки, які зіставляються з полем самі. */
  readonly aliases?: readonly string[]
  /** Приклад для шаблону файла. */
  readonly example?: LocalizedText | number | boolean
  /** `phone`: у файлі будь-який запис номера, на сервер іде E.164. */
  readonly format?: "phone"
}

export interface ImportExportTargetDefinition {
  /** Ресурс API: `contacts`. */
  readonly id: string
  readonly label: LocalizedText
  readonly fields: readonly TargetFieldDefinition[]
  /** Поле, за яким шукається наявний запис. Без нього кожен рядок — новий запис. */
  readonly matchField?: string
}

const NAME = { uk: "Назва", en: "Name" }
const PHONE = { uk: "Телефон", en: "Phone" }
const EMAIL = { uk: "Email", en: "Email" }

const CONTACT_METHODS = [
  {
    key: "phone",
    label: PHONE,
    format: "phone",
    aliases: ["мобільний", "mobile", "tel"],
    example: "+380671234567",
  },
  {
    key: "email",
    label: EMAIL,
    aliases: ["пошта", "mail"],
  },
] as const satisfies readonly TargetFieldDefinition[]

export const CONTACTS_TARGET: ImportExportTargetDefinition = {
  id: "contacts",
  label: { uk: "Контакти", en: "Contacts" },
  matchField: "email",
  fields: [
    {
      key: "name",
      label: { uk: "Ім'я", en: "Name" },
      required: true,
      aliases: ["ПІБ", "контакт", "full name", "contact"],
      example: { uk: "Олена Коваль", en: "Olena Koval" },
    },
    {
      key: "position",
      label: { uk: "Посада", en: "Position" },
      aliases: ["title", "job title"],
      example: { uk: "Бухгалтерка", en: "Accountant" },
    },
    ...CONTACT_METHODS,
  ],
}

export const ORGANIZATIONS_TARGET: ImportExportTargetDefinition = {
  id: "organizations",
  label: { uk: "Організації", en: "Organizations" },
  matchField: "code",
  fields: [
    {
      key: "name",
      label: NAME,
      required: true,
      aliases: ["організація", "компанія", "organization", "company"],
      example: { uk: "ТОВ Зоря", en: "Zoria LLC" },
    },
    {
      key: "type",
      label: { uk: "Тип", en: "Type" },
      required: true,
      type: "enum",
      options: [
        { value: "legal", label: { uk: "Юрособа", en: "Legal entity" } },
        { value: "fop", label: { uk: "ФОП", en: "Sole proprietor" } },
      ],
      example: { uk: "Юрособа", en: "Legal entity" },
    },
    {
      key: "code",
      label: { uk: "Код", en: "Code" },
      aliases: ["ЄДРПОУ", "РНОКПП", "ІПН", "tax id"],
      example: "00000000",
    },
    ...CONTACT_METHODS,
    {
      key: "city",
      label: { uk: "Місто", en: "City" },
      example: { uk: "Київ", en: "Kyiv" },
    },
  ],
}

export const TAXES_TARGET: ImportExportTargetDefinition = {
  id: "taxes",
  label: { uk: "Податки", en: "Taxes" },
  matchField: "name",
  fields: [
    {
      key: "name",
      label: NAME,
      required: true,
      example: { uk: "ПДВ 20%", en: "VAT 20%" },
    },
    {
      key: "rate",
      label: { uk: "Ставка", en: "Rate" },
      required: true,
      type: "number",
      example: 20,
    },
    {
      key: "included",
      label: { uk: "Уже в ціні", en: "Included in price" },
      type: "boolean",
      example: false,
    },
  ],
}

export const UNITS_TARGET: ImportExportTargetDefinition = {
  id: "units",
  label: { uk: "Одиниці виміру", en: "Units" },
  matchField: "name",
  fields: [
    {
      key: "name",
      label: NAME,
      required: true,
      example: { uk: "Кілограм", en: "Kilogram" },
    },
    {
      key: "shortName",
      label: { uk: "Скорочення", en: "Short name" },
      required: true,
      example: { uk: "кг", en: "kg" },
    },
    {
      key: "decimals",
      label: { uk: "Знаків після коми", en: "Decimal places" },
      required: true,
      type: "integer",
      example: 3,
    },
  ],
}

export const TAGS_TARGET: ImportExportTargetDefinition = {
  id: "tags",
  label: { uk: "Теги", en: "Tags" },
  matchField: "name",
  fields: [
    {
      key: "name",
      label: NAME,
      required: true,
      example: "VIP",
    },
    {
      key: "tone",
      label: { uk: "Колір", en: "Colour" },
      required: true,
      type: "enum",
      options: [
        { value: "neutral", label: { uk: "Сірий", en: "Grey" } },
        { value: "info", label: { uk: "Синій", en: "Blue" } },
        { value: "success", label: { uk: "Зелений", en: "Green" } },
        { value: "warning", label: { uk: "Жовтий", en: "Yellow" } },
        { value: "destructive", label: { uk: "Червоний", en: "Red" } },
      ],
      example: { uk: "Зелений", en: "Green" },
    },
  ],
}

/** Без поля збігу: назва причини не повторюється лише в межах виду, тож одне поле запису не знаходить. */
export const REASONS_TARGET: ImportExportTargetDefinition = {
  id: "reasons",
  label: { uk: "Причини", en: "Reasons" },
  fields: [
    {
      key: "name",
      label: NAME,
      required: true,
      example: { uk: "Клієнт передумав", en: "Customer changed their mind" },
    },
    {
      key: "kind",
      label: { uk: "Де застосовується", en: "Used for" },
      required: true,
      type: "enum",
      options: [
        { value: "cancel", label: { uk: "Скасування", en: "Cancellation" } },
        { value: "reject", label: { uk: "Відмова", en: "Rejection" } },
        { value: "return", label: { uk: "Повернення", en: "Return" } },
        { value: "other", label: { uk: "Інше", en: "Other" } },
      ],
      example: { uk: "Скасування", en: "Cancellation" },
    },
    {
      key: "commentRequired",
      label: { uk: "Потрібен коментар", en: "Comment required" },
      type: "boolean",
      example: false,
    },
  ],
}

/** Цілі модуля в порядку на сторінці. */
export const MODULE_TARGETS = [
  CONTACTS_TARGET,
  ORGANIZATIONS_TARGET,
  TAXES_TARGET,
  UNITS_TARGET,
  TAGS_TARGET,
  REASONS_TARGET,
] as const

function parsePhone(raw: SpreadsheetCell): ImportParsed {
  const value = normalizePhone(cellText(raw))
  return !value || validatePhone(value) ? { code: "invalid" } : { value }
}

/** Ціль мовою інтерфейсу: те, що бере `ImportWizard`. */
export function localizeTarget(
  { id, label, matchField, fields }: ImportExportTargetDefinition,
  language: string,
): ImportTarget {
  const text = (value: LocalizedText) => localizedText(value, language) ?? ""
  return {
    resource: id,
    label: text(label),
    matchField,
    fields: fields.map(
      ({ format, label: fieldLabel, options, example, ...field }) => ({
        ...field,
        label: text(fieldLabel),
        options: options?.map((option) => ({
          value: option.value,
          label: text(option.label),
        })),
        example:
          typeof example === "string" || typeof example === "object"
            ? text(example)
            : example,
        parse: format === "phone" ? parsePhone : undefined,
      }),
    ),
  }
}

function exportValue(field: ImportField, value: unknown): SpreadsheetCell {
  if (typeof value === "number" || typeof value === "boolean") return value
  if (typeof value !== "string" || value === "") return null
  if (field.type === "date") return new Date(value)
  return field.options?.find((item) => item.value === value)?.label ?? value
}

/** Колонки файла експорту: ті самі назви, що в шаблоні імпорту, тож файл можна завантажити назад. */
export const targetColumns = ({
  fields,
}: ImportTarget): ExportColumn<RaRecord>[] =>
  fields.map((field) => ({
    id: field.key,
    label: field.label,
    value: (record) => exportValue(field, record[field.key]),
  }))
