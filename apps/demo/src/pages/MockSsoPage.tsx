import { useState } from "react"
import { useTranslation } from "react-i18next"

import { AuthLayout } from "@/registry/erp/auth-layout"
import { AppleIcon, GoogleIcon } from "@/registry/lib/brand-icons"
import { Button } from "@/registry/ui/button"
import { Spinner } from "@/registry/ui/spinner"

import { apiClient } from "@/data/providers"
import { MOCK_USERS } from "@/mocks/users"
import { useSearchParam } from "@/router"

/**
 * Демо-провайдер SSO: так виглядав би крок на сторінці Google чи Apple. Вибір акаунта ставить
 * мок-сесію й повертає на `returnTo`; «Скасувати» — повертає з `error=access_denied`.
 */
export function MockSsoPage() {
  const { t } = useTranslation("demo", { keyPrefix: "authDemo" })
  const provider = useSearchParam("provider") ?? "google"
  const returnTo = useSearchParam("returnTo") ?? "#/"
  const [busy, setBusy] = useState(false)
  const name = provider === "apple" ? "Apple" : "Google"
  const Icon = provider === "apple" ? AppleIcon : GoogleIcon

  const back = (url: string) => {
    window.location.assign(url)
  }

  return (
    <AuthLayout
      title={t("ssoTitle", { provider: name })}
      description={t("ssoLead")}
      logo={<Icon className="mx-auto size-10" />}
    >
      <ul className="space-y-2">
        {MOCK_USERS.slice(0, 2).map((user) => (
          <li key={user.id}>
            <Button
              variant="outline"
              className="h-auto w-full justify-start py-2 text-start"
              disabled={busy}
              onClick={() => {
                setBusy(true)
                void apiClient
                  .post("/auth/sso/mock", { userId: user.id })
                  .then(() => {
                    back(returnTo)
                  })
              }}
            >
              <span className="grid">
                <span>{t("ssoContinue", { name: user.name })}</span>
                <span className="text-muted-foreground">{user.email}</span>
              </span>
            </Button>
          </li>
        ))}
      </ul>
      <Button
        variant="ghost"
        className="w-full"
        disabled={busy}
        onClick={() => {
          const url = new URL(returnTo, window.location.href)
          const [path = "", query = ""] = url.hash.split("?")
          const params = new URLSearchParams(query)
          params.set("error", "access_denied")
          params.delete("next")
          url.hash = `${path}?${params.toString()}`
          back(url.toString())
        }}
      >
        {busy ? <Spinner aria-hidden /> : null}
        {t("ssoCancel")}
      </Button>
    </AuthLayout>
  )
}
