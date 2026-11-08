import type {
  QuotesExtension,
  SalesMockExtension,
} from "@/registry/modules/B3-sales"

/**
 * Дані розширення модуля B3 без компонентів (розширення — `B3-sales.ts`): нове поле, статус і дія до
 * нього. Окремим файлом: моки беруть лише їх, а не компоненти слотів (як `B1-contacts-fields.ts`).
 */

const quoteStatuses: QuotesExtension["statuses"] = {
  add: [
    {
      id: "negotiation",
      label: { uk: "Переговори", en: "Negotiation" },
      tone: "warning",
      icon: "pending",
      place: { after: "sent" },
      // Кожна третя надіслана пропозиція засіву — уже в переговорах: видно бейдж і вкладку, а
      // надіслана з минулим строком (друга) лишається надісланою з позначкою «Термін минув».
      mockEvery: 3,
    },
  ],
}

/**
 * Приклад проекту: після надсилання менеджер веде переговори. Нова дія «Почати переговори» з
 * надісланої, а відповідь клієнта й скасування — ще й із переговорів (`change` дії модуля без заміни).
 */
const quoteTransitions: QuotesExtension["transitions"] = {
  add: [
    {
      id: "negotiate",
      label: { uk: "Почати переговори", en: "Start negotiation" },
      from: ["sent"],
      to: "negotiation",
      place: { after: "decline" },
    },
  ],
  change: [
    { id: "accept", from: ["sent", "negotiation"] },
    { id: "decline", from: ["sent", "negotiation"] },
    { id: "cancel", from: ["sent", "negotiation", "accepted", "declined"] },
  ],
}

export const salesMockExtension = {
  quotes: {
    fields: [
      {
        id: "channel",
        type: "options",
        label: { uk: "Канал продажу", en: "Sales channel" },
        options: [
          { value: "website", label: { uk: "Сайт", en: "Website" } },
          { value: "phone", label: { uk: "Дзвінок", en: "Phone call" } },
          { value: "exhibition", label: { uk: "Виставка", en: "Trade show" } },
        ],
        mockValues: ["website", "phone", "exhibition", null],
      },
    ],
    statuses: quoteStatuses,
    transitions: quoteTransitions,
  },
} satisfies SalesMockExtension
