import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { extensionValue } from "@/registry/lib/extensions"
import { useFormat } from "@/registry/lib/format"
import { ACTION_ICONS } from "@/registry/lib/icons"
import type { RecordSlotProps } from "@/registry/templates/object-page"
import { Button } from "@/registry/ui/button"

import type { Invoice } from "@/data/invoices"

/**
 * Компоненти проекту в слотах картки рахунку (розширення — `K2-invoices.ts`): секція «Умови оплати»
 * і дія «Нагадати клієнту». Окремим файлом, бо файл розширення експортує дані, а не компоненти.
 */

const useExtensionT = () =>
  useTranslation("demo", { keyPrefix: "invoiceExtension" }).t

const DAY_MS = 86_400_000

export function PaymentTerms({ record }: RecordSlotProps<Invoice>) {
  const t = useExtensionT()
  const format = useFormat()
  const manager = extensionValue(record, "manager")
  const days = Math.round(
    (Date.parse(record.dueDate) - Date.parse(record.date)) / DAY_MS,
  )
  const terms = [
    {
      id: "delay",
      label: t("delay"),
      value: t("days", { count: days, value: format.number(days) }),
    },
    {
      id: "dueDate",
      label: t("dueDate"),
      value: format.date(record.dueDate, "date"),
    },
    {
      id: "contact",
      label: t("contact"),
      value:
        typeof manager === "string" && manager !== ""
          ? manager
          : t("noManager"),
    },
  ]
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 @md:grid-cols-3">
      {terms.map((term) => (
        <div key={term.id} className="min-w-0 space-y-0.5">
          <dt className="text-sm text-muted-foreground">{term.label}</dt>
          <dd className="font-medium break-words">{term.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Оплачений рахунок нагадування не потребує. */
export function RemindAction({ record }: RecordSlotProps<Invoice>) {
  const t = useExtensionT()
  if (record.status === "paid") return null
  const Icon = ACTION_ICONS.email
  return (
    <Button
      variant="outline"
      onClick={() => {
        toast.success(t("reminded", { client: record.client }))
      }}
    >
      <Icon aria-hidden />
      {t("remind")}
    </Button>
  )
}
