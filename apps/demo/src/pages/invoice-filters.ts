import { useMemo } from "react"
import { useTranslation } from "react-i18next"

import type { FilterDefinition } from "@/registry/lib/filters"
import type { ListDefaults, ListTab } from "@/registry/lib/list-state"

import {
  INVOICE_CLIENTS,
  INVOICE_CURRENCIES,
  INVOICE_STATUSES,
} from "@/data/invoices"

/**
 * Вкладки-статуси й фільтри списку рахунків стрес-сторінки (SPEC §7 List Report, §18.1; ADR-0017).
 */

/** Без параметрів в адресі: усі рахунки, новіші першими. */
export const INVOICE_LIST_DEFAULTS: ListDefaults = {
  tab: "all",
  sort: { field: "date", order: "DESC" },
  // Колонки з sortField у invoice-table.tsx.
  sortFields: ["number", "client", "date", "dueDate", "amount"],
}

export function useInvoiceListSetup(): {
  tabs: ListTab[]
  filters: FilterDefinition[]
} {
  const { t } = useTranslation("demo", { keyPrefix: "dataPage" })
  return useMemo(
    () => ({
      tabs: [
        { id: "all", label: t("tabs.all"), filter: {} },
        ...INVOICE_STATUSES.map((status) => ({
          id: status,
          label: t(`tabs.${status}`),
          filter: { status },
        })),
      ],
      filters: [
        {
          kind: "options",
          id: "client",
          field: "client",
          label: t("filters.client"),
          options: INVOICE_CLIENTS.map((client) => ({
            value: client,
            label: client,
          })),
        },
        {
          kind: "date-range",
          id: "date",
          field: "date",
          label: t("filters.date"),
        },
        {
          kind: "money-range",
          id: "amount",
          field: "amount",
          label: t("filters.amount"),
          currency: "UAH",
        },
        {
          kind: "options",
          id: "currency",
          field: "currency",
          label: t("filters.currency"),
          options: INVOICE_CURRENCIES.map((currency) => ({
            value: currency,
            label: currency,
          })),
        },
      ],
    }),
    [t],
  )
}
