import { KeyRoundIcon } from "lucide-react"

import type { SsoProvider } from "@/registry/lib/auth"
import { AppleIcon, GoogleIcon } from "@/registry/lib/brand-icons"
import { useErpUiT } from "@/registry/lib/i18n"
import { cn } from "@/registry/lib/utils"
import { Button } from "@/registry/ui/button"

/**
 * Кнопки «Увійти через …» (ADR-0010) для провайдерів із `GET /auth/methods`.
 *
 * - Google — світла кнопка з кольоровим «G» (правила бренду Google): `bg-card`, рамка, текст теми.
 * - Apple — чорна у світлій темі й біла в темній (правила Apple): інвертовані foreground/background.
 * - Будь-який OIDC (Keycloak, Okta, Entra…) — нейтральна кнопка з назвою провайдера.
 * Кнопки на всю ширину й однакової висоти; порядок — як у конфігу сервера.
 */
export function SsoButtons({
  providers,
  onSelect,
  disabled,
  className,
}: {
  providers: SsoProvider[]
  onSelect: (provider: SsoProvider) => void
  disabled?: boolean
  className?: string
}) {
  const t = useErpUiT()
  if (!providers.length) return null
  return (
    <div data-slot="sso-buttons" className={cn("grid gap-2", className)}>
      {providers.map((provider) => {
        const common = {
          type: "button" as const,
          disabled,
          className: "w-full",
          onClick: () => {
            onSelect(provider)
          },
        }
        if (provider.type === "google")
          return (
            <Button
              key={provider.id}
              variant="outline"
              {...common}
              className="w-full bg-card"
            >
              <GoogleIcon />
              {t("auth.sso.google")}
            </Button>
          )
        if (provider.type === "apple")
          return (
            <Button
              key={provider.id}
              {...common}
              className="w-full bg-foreground text-background hover:bg-foreground/90"
            >
              <AppleIcon />
              {t("auth.sso.apple")}
            </Button>
          )
        return (
          <Button key={provider.id} variant="outline" {...common}>
            <KeyRoundIcon aria-hidden />
            {t("auth.sso.oidc", { name: provider.name })}
          </Button>
        )
      })}
    </div>
  )
}
