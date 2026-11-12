import { useGetList } from "ra-core"
import { useMemo } from "react"

import { OFFLINE } from "@/hooks/use-card-record"
import { useCompanyId } from "@/hooks/use-company"
import { companyScope } from "@/lib/company-scope"

import type { AllocationInvoice } from "../allocation"
import type { K4DocumentKind } from "../document-kind"

/** Скільки рахунків клієнта форма показує: від найранішої «Сплатити до». */
export const OPEN_INVOICES_LIMIT = 200

export interface OpenInvoices {
  /** Рахунки клієнта з межею суми; `undefined` — ще не прийшли чи клієнта не вибрано. */
  readonly invoices: readonly AllocationInvoice[] | undefined
  readonly isPending: boolean
  /** Збій запиту чи відповідь не за контрактом. */
  readonly failure: unknown
  /** Рахунків більше, ніж форма показує. */
  readonly isTruncated: boolean
  readonly retry: () => void
}

/**
 * Рахунки клієнта для форми — підресурс документа у форматі списку (ADR-0002): неоплачені для оплати
 * (`GET /sales-payments/open-invoices`), з переплатою для повернення (`GET /sales-refunds/overpaid-invoices`);
 * усі валюти, від найранішої «Сплатити до». Рядок не за контрактом — збій, а не тихо пропущений рахунок:
 * інакше суму розписали б не на всі рахунки.
 */
export function useOpenInvoices(
  kind: K4DocumentKind,
  clientId: string,
): OpenInvoices {
  const companyId = useCompanyId()
  const list = useGetList(
    kind.targets,
    {
      filter: { clientId },
      pagination: { page: 1, perPage: OPEN_INVOICES_LIMIT },
      meta: companyScope(companyId),
    },
    { enabled: clientId !== "" },
  )
  const parsed = useMemo(() => {
    if (!list.data) return undefined
    const rows = list.data.map((row) => kind.targetSchema.safeParse(row))
    return rows.every((row) => row.success)
      ? { invoices: rows.map((row) => row.data) }
      : {
          error: new Error(`K4-payments: ${kind.targets} outside the contract`),
        }
  }, [list.data, kind])
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
