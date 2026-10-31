import type { DictionariesMockExtension } from "@/registry/modules/A6-dictionaries"

/**
 * Дані розширення модуля A6 без компонентів (розширення — `A6-dictionaries.ts`): вид причини проекту
 * «Списання» й поле податку «Рядок у звіті». Окремим файлом: моки беруть лише його, а не компоненти.
 */
export const dictionariesMockExtension = {
  taxes: {
    fields: [
      {
        id: "reportLine",
        type: "text",
        label: { uk: "Рядок у звіті", en: "Report line" },
      },
    ],
  },
  reasons: {
    kinds: {
      add: [
        {
          id: "write-off",
          label: { uk: "Списання", en: "Write-off" },
          tone: "warning",
        },
      ],
    },
  },
} satisfies DictionariesMockExtension
