import { useTranslation } from "react-i18next"
import { Link } from "react-router"
import { toast } from "sonner"

import type { SheetSlotProps } from "@/registry/erp/print-sheet-blocks"
import { formatNumber, useFormat } from "@/registry/lib/format"
import { ACTION_ICONS } from "@/registry/lib/icons"
import { usePrintSheet } from "@/registry/lib/print"
import { invoicesPaths, type Invoice } from "@/registry/modules/K2-invoices"
import type {
  BulkSlotProps,
  ListRowSlotProps,
} from "@/registry/templates/list-report-slots"
import { Button, buttonVariants } from "@/registry/ui/button"

import { MODULE_ROUTES } from "@/router"

/**
 * Компоненти проекту в слотах рахунків модуля K2 (розширення — `K2-sales-invoices.ts`, ADR-0086): дія
 * рядка «Друк», масова дія «Вивантажити» й блок аркуша «Умови оплати». Окремим файлом, бо файл розширення
 * — дані, а моки беруть лише поля (`K2-sales-invoices-fields.ts`).
 */

const useExtensionT = () =>
  useTranslation("demo", { keyPrefix: "salesInvoiceExtension" }).t

const paths = invoicesPaths(MODULE_ROUTES.invoicesModule)
const PrintIcon = ACTION_ICONS.print
const ExportIcon = ACTION_ICONS.download

/** Дія рядка: аркуш рахунку одним натисканням зі списку. */
export function PrintInvoiceRow({ record }: ListRowSlotProps<Invoice>) {
  const t = useExtensionT()
  return (
    <Link
      to={paths.printInvoice(record.id)}
      aria-label={t("printFor", { number: record.number ?? t("draft") })}
      className={buttonVariants({ variant: "ghost", size: "sm" })}
    >
      <PrintIcon aria-hidden />
      {t("print")}
    </Link>
  )
}

/**
 * Масова дія: вивантаження вибраних рахунків (у демо — повідомлення, бекенду вивантаження немає). Розмір
 * `sm` — як у кнопок масових дій модуля (`useBulkAction`).
 */
export function ExportInvoices({ count }: BulkSlotProps) {
  const t = useExtensionT()
  const format = useFormat()
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => {
        toast.success(t("exported", { count, value: format.number(count) }))
      }}
    >
      <ExportIcon aria-hidden />
      {t("export")}
    </Button>
  )
}

const DAY_MS = 86_400_000

/** Блок аркуша мовою документа: умови оплати з дат рахунку. */
export function PaymentTermsBlock({ record }: SheetSlotProps<Invoice>) {
  const { language, locale } = usePrintSheet()
  const days = Math.round(
    (Date.parse(record.dueDate) - Date.parse(record.date)) / DAY_MS,
  )
  const value = formatNumber(days, locale)
  return (
    <p data-slot="invoice-payment-terms" className="text-[9pt]">
      {language === "en"
        ? `Payment terms: bank transfer within ${value} days of the invoice date.`
        : `Умови оплати: безготівково протягом ${value} дн. від дати рахунку.`}
    </p>
  )
}
