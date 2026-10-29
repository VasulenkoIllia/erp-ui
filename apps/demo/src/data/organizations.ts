/**
 * Організації демо — дані модуля B1 «Контакти й компанії» (ADR-0025): ресурс `organizations` у моках
 * веде модуль (`createContactsMocks` у mocks/handlers.ts), а сторінки «Вибір і реквізити» (UI40,
 * UI43) і «Організації» (List Report і Object Page, ADR-0024) показують ті самі записи.
 */
export type { Organization } from "@/registry/modules/B1-contacts/contract"

/**
 * Спільний контрагент платформи (без компанії) — «ТОВ «Зелена долина»»: його бачать усі компанії, а
 * змінює лише адміністратор платформи; картка показує неактивні дії з причиною (ADR-0036, ADR-0037).
 * Разом з ним спільні і його контакти.
 */
export const SHARED_ORGANIZATION_INDEX = 10

/** Компанія користувача демо для організації № i: кожна п'ята — друга компанія, одна — спільна. */
export const organizationCompanyOf = (index: number) =>
  index === SHARED_ORGANIZATION_INDEX
    ? null
    : index % 5 === 4
      ? "kovalenko"
      : "zoriana"
