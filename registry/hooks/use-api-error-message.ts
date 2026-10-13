/**
 * Текст помилки API для людини (SPEC §8.3): за кодом з єдиного формату помилок (ADR-0002),
 * мовою інтерфейсу. Технічне повідомлення сервера не показуємо — воно для журналу.
 * Якщо помилку повернув зовнішній сервіс (банк, ПРРО), до тексту додається його відповідь.
 */
import { useCallback } from "react"

import { API_ERROR_CODES, isApiError } from "@/registry/lib/api"
import { useErpUiT } from "@/registry/lib/i18n"

type KnownCode = (typeof API_ERROR_CODES)[number]

const isKnown = (code: string): code is KnownCode =>
  (API_ERROR_CODES as readonly string[]).includes(code)

export function useApiErrorMessage(): (error: unknown) => string {
  const t = useErpUiT()
  return useCallback(
    (error: unknown) => {
      if (!isApiError(error)) return t("apiErrors.unknown")
      const message = isKnown(error.code)
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
