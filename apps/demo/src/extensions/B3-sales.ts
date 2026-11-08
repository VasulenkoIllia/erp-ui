import type {
  QuotesExtension,
  SalesExtension,
} from "@/registry/modules/B3-sales"

import { timelineModule } from "@/timeline-module"

import { salesMockExtension } from "./B3-sales-fields"

/**
 * Розширення модуля B3 «Пропозиції й замовлення» під клієнта (ADR-0020, ADR-0025) — так виглядає файл
 * проекту `src/extensions/B3-sales.ts`. Файли модуля (`registry/modules/B3-sales`, у проекті —
 * `src/modules/B3-sales`) для цього не змінювались:
 * - поле «Канал продажу» — колонка після клієнта, фільтр, поле шапки картки й вибір у формі;
 * - статус «Переговори» з дією «Почати переговори»: бейдж, вкладка списку, кнопка панелі дій, а
 *   «Клієнт прийняв», «Клієнт відхилив» і «Скасувати» — ще й із переговорів (`B3-sales-fields.ts`);
 * - стрічка запису модуля N1 на картці замість «Історії» (ADR-0054).
 */
const quotes: QuotesExtension = {
  ...salesMockExtension.quotes,
  aside: timelineModule.aside,
  columns: {
    add: [
      { id: "channel", place: { after: "client" }, minWidth: 9, priority: 6 },
    ],
  },
  filters: { add: [{ id: "channel" }] },
  recordFields: { add: [{ id: "channel", place: { after: "client" } }] },
  form: { add: [{ id: "channel", place: { after: "clientId" } }] },
}

export const salesExtension: SalesExtension = { quotes }
