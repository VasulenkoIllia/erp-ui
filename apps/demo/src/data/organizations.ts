/**
 * Організації демо — дані модуля B1 «Контакти й компанії» (ADR-0025): ресурс `organizations` у моках
 * веде модуль (`createContactsMocks` у mocks/handlers.ts), а сторінки «Вибір і реквізити» (UI40,
 * UI43) і «Організації» (List Report і Object Page, ADR-0024) показують ті самі записи.
 */
import type { PartyDetails } from "@/registry/lib/document-parties"

export type { Organization } from "@/registry/modules/B1-contacts/contract"

/**
 * Спільний контрагент платформи (без компанії) — «ТОВ «Зелена долина»»: його бачать усі компанії, а
 * змінює лише адміністратор платформи; картка показує неактивні дії з причиною (ADR-0036, ADR-0037).
 * Разом з ним спільні і його контакти.
 */
export const SHARED_ORGANIZATION_INDEX = 10

/** Хто відповідає за клієнтів першої компанії: по черзі, серед них є й запис без відповідального. */
const ZORIANA_RESPONSIBLE = ["u-olena", "u-ivan", null, "u-marta"] as const

/**
 * Відповідальний за запис № i (ADR-0039): у першій компанії — по черзі, у другій — Олена (Іван і
 * Марта там не працюють), спільний запис — нічий. Кожен третій контакт зсунуто на людину: він
 * належить не тому, кому його організація (організація людині «прихована»).
 */
export function responsibleOf(
  index: number,
  companyId: string | null,
  resource: "organizations" | "contacts",
): string | null {
  if (companyId !== "zoriana") return companyId ? "u-olena" : null
  const shifted = resource === "contacts" && index % 3 === 0 ? index + 1 : index
  return ZORIANA_RESPONSIBLE[shifted % ZORIANA_RESPONSIBLE.length] ?? null
}

/** Компанія користувача демо для організації № i: кожна п'ята — друга компанія, одна — спільна. */
export const organizationCompanyOf = (index: number) =>
  index === SHARED_ORGANIZATION_INDEX
    ? null
    : index % 5 === 4
      ? "kovalenko"
      : "zoriana"

const textOf = (record: Readonly<Record<string, unknown>>, field: string) => {
  const value = record[field]
  return typeof value === "string" ? value : ""
}

/**
 * Реквізити покупця з організації B1 для рахунку K2 (ADR-0068): вид, назва, код, IBAN основного
 * рахунку, телефон і пошта; повної адреси в рядку списку немає — місто. Решту людина допише у формі.
 */
export function organizationParty(
  record: Readonly<Record<string, unknown>>,
): Partial<PartyDetails> {
  return {
    kind: record.type === "fop" ? "fop" : "legal",
    name: textOf(record, "name"),
    code: textOf(record, "code"),
    iban: textOf(record, "iban"),
    phone: textOf(record, "phone"),
    email: textOf(record, "email"),
    address: textOf(record, "city"),
  }
}
