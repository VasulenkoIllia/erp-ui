import { useEffect } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { toLanguage } from "@/registry/lib/i18n"

const TOAST_ID = "language-fallback"

/**
 * Рядки обраної мови не довантажились (офлайн, ADR-0009): інтерфейс лишився українським, бо це
 * запасна мова. Кажемо про це й даємо повторити, поки вподобання й мова розходяться.
 */
export function useLanguageFallbackNotice() {
  const { t, i18n } = useTranslation()
  const failed = toLanguage(i18n.language) !== toLanguage(i18n.resolvedLanguage)
  useEffect(() => {
    if (!failed) {
      toast.dismiss(TOAST_ID)
      return
    }
    toast.error(t("app.languageFailed"), {
      id: TOAST_ID,
      duration: Infinity,
      action: {
        label: t("app.languageRetry"),
        onClick: (event) => {
          // Сповіщення лишається, доки мова не прийде: невдалий повтор не має пройти мовчки.
          event.preventDefault()
          void i18n.changeLanguage(i18n.language)
        },
      },
    })
  }, [failed, i18n, t])
}
