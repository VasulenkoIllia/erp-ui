import type { ExtensionField } from "@/registry/lib/extension-fields"
import type { ExtensionFormChanges } from "@/registry/lib/extension-form"

/** Поля розширення всіх типів і зміни форми для тестів `lib/extension-form` і `erp/record-form`. */

export const FIELDS: readonly ExtensionField[] = [
  { id: "vatPayer", type: "boolean", label: { uk: "Платник ПДВ", en: "VAT" } },
  { id: "limit", type: "number", label: "Ліміт", required: true },
  { id: "signed", type: "date", label: "Підписано" },
  {
    id: "tax",
    type: "options",
    label: "Оподаткування",
    options: [{ value: "single", label: "Єдиний податок" }],
  },
  { id: "note", type: "text", label: "Не у формі" },
]

export const FORM: ExtensionFormChanges<"name"> = {
  add: [
    { id: "limit", place: "start" },
    {
      id: "vatPayer",
      description: { uk: "Для рахунків", en: "For invoices" },
    },
  ],
  change: [{ id: "name", label: { uk: "Назва клієнта", en: "Client name" } }],
}
