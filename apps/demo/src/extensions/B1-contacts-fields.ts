import type {
  ContactsMockExtension,
  OrganizationsExtension,
} from "@/registry/modules/B1-contacts"

/**
 * Дані розширення модуля B1 без компонентів (розширення — `B1-contacts.ts`): нові поля й статус.
 * Окремим файлом: моки беруть лише їх, а не компоненти слотів (як `K2-invoices-fields.ts`).
 *
 * «Відповідальний менеджер» — запис із довідника сервера (крок A2a): у записі — `id` користувача,
 * підпис — його ім'я з `GET /users`, у формі — вибір із пошуком на сервері. Довідник читає той, хто
 * має право `users:read`; інші бачать «Немає доступу».
 */

const organizationStatuses: OrganizationsExtension["statuses"] = {
  add: [
    {
      id: "suspended",
      label: { uk: "Призупинена", en: "Suspended" },
      tone: "warning",
      icon: "pending",
      // Кожна 11-та організація демо: видно бейдж і вкладку з лічильником.
      mockEvery: 11,
    },
  ],
  // Статус модуля без заміни: інша назва, а тон і іконка — від модуля. Назва довга: у вузькій
  // колонці таблиці бейдж обрізається трикрапкою.
  change: [
    {
      id: "inactive",
      label: { uk: "Співпрацю припинено", en: "Partnership ended" },
    },
  ],
}

export const contactsMockExtension = {
  organizations: {
    fields: [
      {
        id: "vatPayer",
        type: "boolean",
        label: { uk: "Платник ПДВ", en: "VAT payer" },
        mockValues: [true, true, false],
      },
      {
        id: "manager",
        type: "record",
        label: { uk: "Відповідальний менеджер", en: "Account manager" },
        resource: "users",
        labelField: "name",
        descriptionField: "email",
        mockValues: ["u-olena", "u-ivan", null, "u-marta"],
      },
    ],
    statuses: organizationStatuses,
  },
  contacts: {
    fields: [
      {
        id: "channel",
        type: "options",
        label: { uk: "Зручний канал", en: "Preferred channel" },
        options: [
          { value: "phone", label: { uk: "Телефон", en: "Phone" } },
          { value: "email", label: { uk: "Email", en: "Email" } },
          { value: "telegram", label: { uk: "Telegram", en: "Telegram" } },
        ],
        mockValues: ["phone", "email", "telegram", null],
      },
    ],
  },
} satisfies ContactsMockExtension
