/**
 * Текст помилки API для людини (SPEC §8.3): за кодом з єдиного формату помилок (ADR-0002),
 * мовою інтерфейсу. Технічне повідомлення сервера не показуємо — воно для журналу.
 * Якщо помилку повернув зовнішній сервіс (банк, ПРРО), до тексту додається його відповідь.
 */
import { useCallback } from "react"

import { isApiError, isKnownApiErrorCode } from "@/registry/lib/api"
import { useErpUiT } from "@/registry/lib/i18n"

export function useApiErrorMessage(): (error: unknown) => string {
  const t = useErpUiT()
  return useCallback(
    (error: unknown) => {
      if (!isApiError(error)) return t("apiErrors.unknown")
      const message = isKnownApiErrorCode(error.code)
        ? t(`apiErrors.${error.code}`)
        : t("apiErrors.unknown")
      return error.providerMessage
        ? t("apiErrors.provider", {
            message,
            provider: error.providerMessage,
          })
        : message
    },
    [t],
  )
}
