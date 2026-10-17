/**
 * Організації демо — дані модуля B1 «Контакти й компанії» (ADR-0025): ресурс `organizations` у моках
 * веде модуль (`createContactsMocks` у mocks/handlers.ts), а сторінки «Вибір і реквізити» (UI40,
 * UI43) і «Організації» (List Report і Object Page, ADR-0024) показують ті самі записи.
 */
export type { Organization } from "@/registry/modules/B1-contacts/contract"

/** Компанія користувача демо для організації № i: кожна п'ята — друга компанія. */
export const organizationCompanyOf = (index: number) =>
  index % 5 === 4 ? "kovalenko" : "zoriana"
