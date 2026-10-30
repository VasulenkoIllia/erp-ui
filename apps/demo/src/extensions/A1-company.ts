import type { CompanyExtension } from "@/registry/modules/A1-company"

import { companyMockExtension } from "./A1-company-fields"

/**
 * Розширення модуля A1 «Компанія й валюти» під клієнта (ADR-0020, ADR-0025) — так виглядає файл
 * проекту `src/extensions/A1-company.ts`. Файли модуля (`registry/modules/A1-company`, у проекті —
 * `src/modules/A1-company`) для цього не змінювались:
 * - поле «Примітка» — колонка таблиці курсів після джерела й поле форми курсу.
 */
export const companyExtension: CompanyExtension = {
  rates: {
    ...companyMockExtension.rates,
    columns: {
      add: [{ id: "note", place: { after: "source" }, minWidth: 12 }],
    },
    form: { add: [{ id: "note", wide: true }] },
  },
}
