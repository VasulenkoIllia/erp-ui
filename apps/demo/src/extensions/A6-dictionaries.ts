import type { DictionariesExtension } from "@/registry/modules/A6-dictionaries"

import { dictionariesMockExtension } from "./A6-dictionaries-fields"

/**
 * Розширення модуля A6 «Довідники» під клієнта (ADR-0020, ADR-0025) — так виглядає файл проекту
 * `src/extensions/A6-dictionaries.ts`. Файли модуля (`registry/modules/A6-dictionaries`, у проекті —
 * `src/modules/A6-dictionaries`) для цього не змінювались:
 * - поле «Рядок у звіті» — у формі податку після ставки;
 * - вид причини «Списання» — у виборі, фільтрі й колонці.
 */
export const dictionariesExtension: DictionariesExtension = {
  taxes: {
    ...dictionariesMockExtension.taxes,
    form: { add: [{ id: "reportLine", place: { after: "included" } }] },
  },
  reasons: dictionariesMockExtension.reasons,
}
