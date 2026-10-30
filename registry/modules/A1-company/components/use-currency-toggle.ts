import { useQueryClient } from "@tanstack/react-query"
import { useUpdate } from "ra-core"
import { useCallback, useRef, useState } from "react"
import { toast } from "sonner"

import { useApiErrorMessage } from "@/hooks/use-api-error-message"
import { useCompanyId } from "@/hooks/use-company"
import { isApiError } from "@/lib/api"
import { companyScope } from "@/lib/company-scope"

import { CURRENCIES, type Currency } from "../contract"
import { useCompanyT } from "../use-company-t"

/**
 * Вимкнути чи ввімкнути валюту: `PATCH /currencies/:id` з `active` і `version`. Конфлікт 409 —
 * повідомлення й перечитаний список: людина бачить чужу зміну й повторює дію. Поки йде запит,
 * наступний не стартує: зі старою версією він отримав би 409.
 */
export function useCurrencyToggle() {
  const t = useCompanyT()
  const errorMessage = useApiErrorMessage()
  const companyId = useCompanyId()
  const queryClient = useQueryClient()
  const savingRef = useRef(false)
  const [isSaving, setSaving] = useState(false)
  const [update] = useUpdate<Currency>(undefined, undefined, {
    networkMode: "always",
  })
  const toggle = useCallback(
    async (currency: Currency) => {
      if (savingRef.current) return
      savingRef.current = true
      setSaving(true)
      const refresh = () => {
        void queryClient.invalidateQueries({ queryKey: [CURRENCIES] })
      }
      try {
        await update(
          CURRENCIES,
          {
            id: currency.id,
            data: { active: !currency.active, version: currency.version },
            previousData: currency,
            meta: companyScope(companyId),
          },
          { mutationMode: "pessimistic", returnPromise: true },
        )
        toast.success(
          t(currency.active ? "currencies.disabled" : "currencies.enabled", {
            code: currency.code,
          }),
        )
        refresh()
      } catch (failure: unknown) {
        if (isApiError(failure) && failure.code === "conflict") {
          toast.error(t("currencies.conflict"))
          refresh()
          return
        }
        toast.error(errorMessage(failure))
      } finally {
        savingRef.current = false
        setSaving(false)
      }
    },
    [t, errorMessage, companyId, queryClient, update],
  )
  return { toggle, isSaving }
}
