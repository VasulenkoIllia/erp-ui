import type { CompanyMockExtension } from "@/registry/modules/A1-company"

/**
 * Дані розширення модуля A1 без компонентів (розширення — `A1-company.ts`): нове поле курсу
 * «Примітка». Окремим файлом: моки беруть лише його, а не компоненти (як `B1-contacts-fields.ts`).
 */
export const companyMockExtension = {
  rates: {
    fields: [
      {
        id: "note",
        type: "text",
        label: { uk: "Примітка", en: "Note" },
      },
    ],
  },
} satisfies CompanyMockExtension
