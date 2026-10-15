import type { InvoicesExtension } from "@/pages/invoice-extension"

/**
 * Нові поля рахунків (розширення — `K2-invoices.ts`). Окремим файлом без компонентів: моки беруть
 * лише поля, а з компонентами слотів шар моків тягнув би інтерфейс, і збирач розбивав би вхідний
 * чанк на дрібні частини (+6 КБ gzip першого екрана).
 */
export const invoiceFields: InvoicesExtension["fields"] = [
  {
    id: "manager",
    type: "text",
    label: { uk: "Менеджер", en: "Manager" },
    // Період 7 не кратний 5: менеджер без імені є в обох компаніях демо (data/invoices).
    mockValues: [
      "Ірина Бондар",
      "Олег Мельник",
      "Марія Ткачук",
      null,
      "Андрій Савченко",
      "Олег Мельник",
      "Ірина Бондар",
    ],
  },
]
