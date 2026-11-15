/**
 * Змінні шаблону з документа (UI44, ADR-0087): значення мовою документа (дати, суми, сторона в тексті
 * договору, сума прописом), підписи — мовою інтерфейсу для форми генератора.
 *
 * - Документ: `{number}`, `{date}`, `{dateLong}`, `{currency}`, `{net}`, `{tax}`, `{total}`,
 *   `{totalInWords}` (прописом, лише коли для валюти є слова).
 * - Сторони за ролями (`customer`, `contractor`, ADR-0068), обидві завжди: поля `PartyDetails`, `{customer.clause}` —
 *   «ТОВ «…», в особі …, що діє на підставі … (надалі «Замовник»)» (`partyClause`) і
 *   `{customer.signature}` — «Олена КОВАЛЬ» (`signatureName`).
 * - Рядки товарів і послуг — цикл `{#lines}…{/lines}`: `no`, `name`, `quantity`, `unit`, `price`,
 *   `discount`, `tax`, `net`, `total`. Розділи й нотатки в цикл не йдуть.
 * - Інші поля (`fields`) — групою «Інші поля» з міткою `{fields.<ключ>}`: нова мітка кіта не перекриє поле
 *   проекту. Ключ не латиницею чи двічі той самий — помилка розробника.
 * - Значення, яке не форматується (дата не дата, невідома валюта), — порожнє, з помилкою в консолі: генератор
 *   не падає через одне поле.
 *
 * Частина лінивого чанка генератора (`erp/document-generator-panel`): дія на картці його не тягне.
 */
import { partyClause } from "@/registry/erp/print-requisites"
import { localizedText } from "@/registry/lib/localized-text"
import { amountInWords, hasCurrencyWords } from "@/registry/lib/amount-in-words"
import {
  emptyPartyDetails,
  PARTY_ROLES,
  signatureName,
  type PartyDetails,
  type PartyRole,
} from "@/registry/lib/document-parties"
import {
  itemLinesOf,
  type SavedDocumentLine,
} from "@/registry/lib/document-lines"
import { lineDiscountOf } from "@/registry/lib/document-totals"
import type {
  TemplateDocument,
  TemplateExtraField,
  TemplateFieldValue,
  TemplateLoop,
  TemplateVariable,
  TemplateVariableGroup,
  TemplateVariables,
} from "@/registry/lib/document-template"
import {
  formatDate,
  formatDecimal,
  formatMoney,
  formatPrice,
} from "@/registry/lib/format"
import type { ErpUiTranslate } from "@/registry/lib/i18n"
import type { PrintLanguage } from "@/registry/lib/print"

/** Ключ цикла рядків документа: `{#lines}…{/lines}`. */
export const LINES_LOOP = "lines"
/** Група інших полів: `{fields.dueDate}`. */
export const FIELDS_GROUP = "fields"

/** Поля сторони в порядку реквізитів; `clause` і `signature` кіт складає сам. */
const PARTY_VARIABLES = [
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
] as const satisfies readonly (keyof PartyDetails)[]
const PARTY_VARIABLE_KEYS = [...PARTY_VARIABLES, "clause", "signature"] as const
type PartyVariable = (typeof PARTY_VARIABLE_KEYS)[number]

/** Значення документа в порядку форми. */
const DOCUMENT_VARIABLES = [
  "number",
  "date",
  "dateLong",
  "currency",
  "net",
  "tax",
  "total",
  "totalInWords",
] as const
type DocumentVariable = (typeof DOCUMENT_VARIABLES)[number]

const LINE_COLUMNS = [
  "no",
  "name",
  "quantity",
  "unit",
  "price",
  "discount",
  "tax",
  "net",
  "total",
] as const

const MULTILINE = new Set(["address", "clause", "totalInWords"])

/** Ключ іншого поля: латиниця й цифри, без крапки, щоб не стати шляхом у чужу групу. */
const FIELD_KEY = /^[A-Za-z][A-Za-z0-9_]*$/

/** Значення, яке не відформатувалось (`RangeError` дати чи валюти), — порожнє, а не збій генератора. */
function formatted(format: () => string): string {
  try {
    return format()
  } catch (error) {
    console.error("erp-ui: document template value was not formatted", error)
    return ""
  }
}

export interface DocumentTemplateLanguages {
  /** Мова документа: значення. */
  readonly sheet: PrintLanguage
  /** Мова інтерфейсу: підписи у формі. */
  readonly ui: { readonly t: ErpUiTranslate; readonly language: string }
}

const variable = (
  key: string,
  label: string,
  value: string,
): TemplateVariable => ({
  key,
  label,
  value,
  isMultiline: MULTILINE.has(key.split(".").pop() ?? key),
})

function documentGroup(
  document: TemplateDocument,
  { sheet, ui }: DocumentTemplateLanguages,
): TemplateVariableGroup {
  const { currencies } = document
  const money = (amount: number) =>
    formatted(() =>
      formatMoney({ amount, currency: document.currency }, sheet.locale),
    )
  const words = hasCurrencyWords(document.currency, sheet.language, currencies)
    ? formatted(() =>
        amountInWords(
          { amount: document.total, currency: document.currency },
          sheet.language,
          { currencies },
        ),
      )
    : ""
  const values: Record<DocumentVariable, string> = {
    number: document.number ?? sheet.t("documentGenerator.document.draft"),
    date: formatted(() => formatDate(document.date, "date", sheet.locale)),
    dateLong: formatted(() => formatDate(document.date, "long", sheet.locale)),
    currency: document.currency.toUpperCase(),
    net: document.totals ? money(document.totals.net) : "",
    tax: document.totals ? money(document.totals.tax) : "",
    total: money(document.total),
    totalInWords: words,
  }
  return {
    id: "document",
    label: ui.t("documentGenerator.groups.document"),
    variables: DOCUMENT_VARIABLES.map((key) =>
      variable(key, ui.t(`documentGenerator.document.${key}`), values[key]),
    ),
  }
}

/**
 * Сторона ролі; документ без неї (профіль компанії ще вантажиться, модуль сторони не має) — ті самі мітки
 * з порожніми значеннями: мітка ролі в шаблоні не стає «невідомою».
 */
function partyGroup(
  role: PartyRole,
  party: NonNullable<TemplateDocument["parties"]>[PartyRole],
  { sheet, ui }: DocumentTemplateLanguages,
): TemplateVariableGroup {
  const details = party?.details ?? emptyPartyDetails()
  const roleIn = (language: string, t: ErpUiTranslate) =>
    localizedText(party?.label, language) ?? t(`partyDetails.roles.${role}`)
  const values: Record<PartyVariable, string> = {
    ...details,
    clause: party
      ? partyClause(details, roleIn(sheet.language, sheet.t), sheet.t)
      : "",
    signature: signatureName(details.signerName),
  }
  return {
    id: role,
    label: roleIn(ui.language, ui.t),
    variables: PARTY_VARIABLE_KEYS.map((key) =>
      variable(
        `${role}.${key}`,
        ui.t(`documentGenerator.party.${key}`),
        values[key],
      ),
    ),
  }
}

function lineRow(
  line: SavedDocumentLine,
  index: number,
  currency: string,
  locale: string,
): Record<(typeof LINE_COLUMNS)[number], string> {
  const money = (amount: number) =>
    formatted(() => formatMoney({ amount, currency }, locale))
  const discount = lineDiscountOf(line.totals)
  return {
    no: String(index + 1),
    name: line.name,
    quantity: formatDecimal(line.quantity, locale),
    unit: line.unit?.name ?? "",
    price: formatted(() => formatPrice(line.price, currency, locale)),
    discount: discount ? money(discount) : "",
    tax: line.tax?.name ?? "",
    net: money(line.totals.net),
    total: money(line.totals.total),
  }
}

function linesLoop(
  document: TemplateDocument,
  { sheet, ui }: DocumentTemplateLanguages,
): TemplateLoop {
  return {
    key: LINES_LOOP,
    label: ui.t("documentGenerator.groups.lines"),
    columns: LINE_COLUMNS.map((key) => ({
      key,
      label: ui.t(`documentGenerator.line.${key}`),
    })),
    rows: itemLinesOf(document.lines ?? []).map((line, index) =>
      lineRow(line, index, document.currency, sheet.locale),
    ),
  }
}

function fieldValue(value: TemplateFieldValue | null, locale: string): string {
  if (value === null) return ""
  if (typeof value === "string") return value
  if ("date" in value)
    return formatted(() => formatDate(value.date, "date", locale))
  if ("money" in value) return formatted(() => formatMoney(value.money, locale))
  const unexpected: never = value
  return unexpected
}

/** Ключі інших полів: латиниця, кожен один раз — інакше мітка шаблону тихо пропала б. */
function assertFieldKeys(fields: readonly TemplateExtraField[]) {
  const seen = new Set<string>()
  for (const { key } of fields) {
    if (!FIELD_KEY.test(key) || seen.has(key))
      throw new Error(
        `erp-ui: document template field key "${key}" is not a unique Latin key`,
      )
    seen.add(key)
  }
}

function fieldsGroup(
  fields: readonly TemplateExtraField[],
  { sheet, ui }: DocumentTemplateLanguages,
): TemplateVariableGroup | null {
  assertFieldKeys(fields)
  if (fields.length === 0) return null
  return {
    id: FIELDS_GROUP,
    label: ui.t("documentGenerator.groups.fields"),
    variables: fields.map((field) =>
      variable(
        `${FIELDS_GROUP}.${field.key}`,
        localizedText(field.label, ui.language) ?? field.key,
        fieldValue(field.value, sheet.locale),
      ),
    ),
  }
}

/** Змінні шаблону документа: групи значень і цикл рядків. */
export function documentTemplateVariables(
  document: TemplateDocument,
  languages: DocumentTemplateLanguages,
): TemplateVariables {
  const head = documentGroup(document, languages)
  const parties = PARTY_ROLES.map((role) =>
    partyGroup(role, document.parties?.[role], languages),
  )
  const fields = fieldsGroup(document.fields ?? [], languages)
  return {
    groups: [head, ...parties, ...(fields ? [fields] : [])],
    loops: [linesLoop(document, languages)],
  }
}
