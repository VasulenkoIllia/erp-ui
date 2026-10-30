import { useQueryClient } from "@tanstack/react-query"
import { useDelete } from "ra-core"
import { toast } from "sonner"

import { ConfirmDialog } from "@/components/erp/confirm-dialog"
import { useApiErrorMessage } from "@/hooks/use-api-error-message"
import { useCompanyId } from "@/hooks/use-company"
import { isApiError } from "@/lib/api"
import { companyScope } from "@/lib/company-scope"
import { useFormat } from "@/lib/format"

import { CURRENCIES, EXCHANGE_RATES, type ExchangeRate } from "../contract"
import { useCompanyT } from "../use-company-t"

/** Запис лишається, поки діалог закривається: заголовок не блимає порожнім. */
export interface RateRemoval {
  readonly rate: ExchangeRate
  readonly open: boolean
}

/** Після цих відповідей повтор нічого не дасть: курс уже видалили чи право забрали. */
const FINAL_STATUSES: ReadonlySet<number> = new Set([403, 404])

export function RemoveRateDialog({
  removal,
  onClose,
  returnFocus,
}: {
  removal: RateRemoval | null
  onClose: () => void
  /** Рядка після видалення немає: куди піде фокус. */
  returnFocus: () => HTMLElement | null
}) {
  const t = useCompanyT()
  const format = useFormat()
  const errorMessage = useApiErrorMessage()
  const companyId = useCompanyId()
  const queryClient = useQueryClient()
  const [remove] = useDelete<ExchangeRate>()
  const rate = removal?.rate
  const name = rate
    ? { currency: rate.currency, date: format.date(rate.date, "date") }
    : { currency: "", date: "" }
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: [EXCHANGE_RATES] })
    void queryClient.invalidateQueries({ queryKey: [CURRENCIES] })
  }
  return (
    <ConfirmDialog
      open={removal?.open === true}
      title={t("rates.deleteTitle", name)}
      description={t("rates.deleteDescription")}
      confirmLabel={t("rates.deleteConfirm")}
      destructive
      returnFocus={returnFocus}
      onClose={onClose}
      onConfirm={async () => {
        if (!rate) return
        try {
          await remove(
            EXCHANGE_RATES,
            {
              id: rate.id,
              previousData: rate,
              meta: companyScope(companyId),
            },
            { mutationMode: "pessimistic", returnPromise: true },
          )
          toast.success(t("rates.deleted", name))
          onClose()
          refresh()
        } catch (failure: unknown) {
          toast.error(errorMessage(failure))
          if (isApiError(failure) && FINAL_STATUSES.has(failure.status)) {
            onClose()
            refresh()
          }
        }
      }}
    />
  )
}
