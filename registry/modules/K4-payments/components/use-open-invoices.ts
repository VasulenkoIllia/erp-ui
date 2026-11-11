import { useGetList } from "ra-core"
import { useMemo } from "react"

import { OFFLINE } from "@/hooks/use-card-record"
import { useCompanyId } from "@/hooks/use-company"
import { companyScope } from "@/lib/company-scope"

import {
  OPEN_INVOICES_PATH,
  openInvoiceSchema,
  PAYMENTS,
  type OpenInvoice,
} from "../contract"

/** Відкриті рахунки — підресурс оплат у форматі списку (ADR-0002): `GET /sales-payments/open-invoices`. */
const OPEN_INVOICES = `${PAYMENTS}/${OPEN_INVOICES_PATH}`
/** Скільки неоплачених рахунків клієнта форма показує: від найранішої «Сплатити до». */
export const OPEN_INVOICES_LIMIT = 200

export interface OpenInvoices {
  /** Рахунки клієнта з боргом; `undefined` — ще не прийшли чи клієнта не вибрано. */
  readonly invoices: readonly OpenInvoice[] | undefined
  readonly isPending: boolean
  /** Збій запиту чи відповідь не за контрактом. */
  readonly failure: unknown
  /** Рахунків більше, ніж форма показує. */
  readonly isTruncated: boolean
  readonly retry: () => void
}

/**
 * Неоплачені рахунки клієнта для форми оплати: усі валюти, від найранішої «Сплатити до». Рядок не за
 * контрактом — збій, а не тихо пропущений рахунок: інакше суму розписали б не на всі борги.
 */
export function useOpenInvoices(clientId: string): OpenInvoices {
  const companyId = useCompanyId()
  const list = useGetList(
    OPEN_INVOICES,
    {
      filter: { clientId },
      pagination: { page: 1, perPage: OPEN_INVOICES_LIMIT },
      meta: companyScope(companyId),
    },
    { enabled: clientId !== "" },
  )
  const parsed = useMemo(() => {
    if (!list.data) return undefined
    const rows = list.data.map((row) => openInvoiceSchema.safeParse(row))
    return rows.every((row) => row.success)
      ? { invoices: rows.map((row) => row.data) }
      : { error: new Error("K4-payments: open invoice outside the contract") }
  }, [list.data])
  const isPaused = list.fetchStatus === "paused"
  return {
    invoices: parsed && "invoices" in parsed ? parsed.invoices : undefined,
    isPending: clientId !== "" && list.isPending && !isPaused,
    failure:
      parsed && "error" in parsed
        ? parsed.error
        : list.data
          ? undefined
          : (list.error ?? (isPaused ? OFFLINE : undefined)),
    // Без `total` у відповіді повна сторінка — ознака, що рахунків може бути більше.
    isTruncated:
      list.total === undefined
        ? (list.data?.length ?? 0) >= OPEN_INVOICES_LIMIT
        : list.total > OPEN_INVOICES_LIMIT,
    retry: () => {
      void list.refetch()
    },
  }
}
