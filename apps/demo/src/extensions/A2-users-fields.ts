import type { UsersMockExtension } from "@/registry/modules/A2-users"

/**
 * Дані розширення модуля A2 без компонентів (розширення — `A2-users.ts`): нове поле «Відділ».
 * Окремим файлом: моки беруть лише його, а не компоненти слотів (як `B1-contacts-fields.ts`).
 */
export const usersMockExtension = {
  users: {
    fields: [
      {
        id: "department",
        type: "options",
        label: { uk: "Відділ", en: "Department" },
        options: [
          { value: "sales", label: { uk: "Продажі", en: "Sales" } },
          { value: "finance", label: { uk: "Фінанси", en: "Finance" } },
          { value: "logistics", label: { uk: "Логістика", en: "Logistics" } },
          {
            value: "management",
            label: { uk: "Керівництво", en: "Management" },
          },
        ],
        mockValues: ["management", "sales", "sales", "finance", "logistics"],
      },
    ],
  },
} satisfies UsersMockExtension
