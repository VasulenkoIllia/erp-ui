import type { ImportExportExtension } from "@/registry/modules/A4-import-export"

/**
 * Розширення модуля A4 «Імпорт і експорт» під клієнта (ADR-0020, ADR-0050) — так виглядає файл проекту
 * `src/extensions/A4-import-export.ts`. Файли модуля (`registry/modules/A4-import-export`, у проекті —
 * `src/modules/A4-import-export`) для цього не змінювались: ціль «Товари» — ресурс самого проекту.
 */
export const importExportExtension: ImportExportExtension = {
  targets: {
    add: [
      {
        id: "products",
        label: { uk: "Товари", en: "Products" },
        matchField: "sku",
        place: { after: "organizations" },
        fields: [
          {
            key: "sku",
            label: { uk: "Артикул", en: "SKU" },
            required: true,
            aliases: ["код", "code"],
            example: "SKU-100",
          },
          {
            key: "name",
            label: { uk: "Назва", en: "Name" },
            required: true,
            example: { uk: "Кавоварка", en: "Coffee maker" },
          },
          {
            key: "price",
            label: { uk: "Ціна", en: "Price" },
            required: true,
            type: "number",
            example: 1250.5,
          },
        ],
      },
    ],
  },
}
