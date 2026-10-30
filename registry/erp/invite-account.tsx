import * as React from "react"
import { useLocation, useLogout } from "ra-core"
import { toast } from "sonner"

import {
  AUTH_PATHS,
  AuthLayout,
  useAfterLogin,
  useAuthErrorText,
  useErpAuthProvider,
  type AuthPaths,
} from "@/registry/erp/auth-layout"
import { defaultSsoReturnUrl, LoginScreen } from "@/registry/erp/login-screen"
import { isApiError } from "@/registry/lib/api"
import type { Invite } from "@/registry/lib/auth"
import { useErpUiT } from "@/registry/lib/i18n"
import { Alert, AlertDescription } from "@/registry/ui/alert"
import { Button } from "@/registry/ui/button"
import { Spinner } from "@/registry/ui/spinner"

/**
 * Запрошення на адресу, що вже має обліковий запис (ADR-0040): новий пароль таким людям не потрібен.
 *
 * - `existing` — екран входу прямо тут, усі способи входу й другий крок; після входу запрошення
 *   приймається саме, людина вже в новій компанії.
 * - `current` — людина вже ввійшла цим записом: одна кнопка «Прийняти запрошення».
 * - `other` — увійшла іншим записом: спершу «Вийти», далі той самий екран перечитує запрошення.
 *
 * Екран запрошення не покидаємо: токен живе в `sessionStorage` лише поки він змонтовано
 * (`useEmailLinkToken`), а екран входу токени листів стирає. Повернення з SSO веде сюди ж.
 * `onChanged` — перечитати запрошення й повернути його: сервер відповів 409 чи сесія змінилась.
 */
export function InviteAccountScreen({
  token,
  invite,
  description,
  onChanged,
  logo,
  footer,
  paths,
  afterLogin,
}: {
  token: string
  invite: Invite
  /** Хто й куди запрошує: той самий текст, що й у новому обліковому записі. */
  description: string
  onChanged: () => Promise<Invite | undefined>
  logo?: React.ReactNode
  footer?: React.ReactNode
  paths?: Partial<AuthPaths>
  afterLogin?: string
}) {
  const t = useErpUiT()
  const provider = useErpAuthProvider()
  const logout = useLogout()
  const errorText = useAuthErrorText()
  const done = useAfterLogin(afterLogin)
  const { pathname } = useLocation()
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const title = t("auth.invite.title", { company: invite.companyName })

  /**
   * Відмова перечитує запрошення: 409, після якого стан змінився (увійшли не тим записом, сесія
   * скінчилась), пояснює сам екран. Решту — текст: над кнопкою, а якщо лишилась форма входу, то
   * її власна помилка, тож відмову кидаємо далі.
   */
  const accept = async () => {
    setError(null)
    try {
      await provider.joinInvite(token)
    } catch (failure) {
      const fresh = await onChanged()
      const explained =
        isApiError(failure) &&
        failure.status === 409 &&
        fresh !== undefined &&
        fresh.account !== invite.account
      if (explained) return
      setError(errorText(failure))
      throw failure
    }
    toast.success(t("auth.invite.joined", { company: invite.companyName }))
    done()
  }

  const signOut = async () => {
    setError(null)
    try {
      // Через ra-core, а не провайдер: кеш і сховище попереднього запису не лишаються наступному.
      await logout({}, false)
      await onChanged()
    } catch (failure) {
      setError(errorText(failure))
    }
  }

  if (invite.account === "existing")
    return (
      <LoginScreen
        title={title}
        description={`${description} ${t("auth.invite.signInHint")}`}
        logo={logo}
        footer={footer}
        paths={paths}
        afterLogin={afterLogin}
        defaultValues={{ email: invite.email }}
        ssoReturnUrl={() =>
          defaultSsoReturnUrl(paths?.callback ?? AUTH_PATHS.callback, pathname)
        }
        onSignedIn={accept}
      />
    )

  const current = invite.account === "current"
  return (
    <AuthLayout
      title={title}
      description={description}
      logo={logo}
      footer={footer}
    >
      <div className="space-y-4">
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {/* Завжди на місці: 409 змінює «прийняти» на «вийти», і скрінрідер має це почути. */}
        <p
          role="status"
          className="text-sm text-muted-foreground empty:sr-only"
        >
          {current
            ? null
            : t("auth.invite.otherAccount", { email: invite.email })}
        </p>
        <Button
          className="w-full"
          disabled={busy}
          // Під час запиту кнопка лишається у фокусі: при відмові клавіатура не губить місця.
          focusableWhenDisabled={busy}
          aria-busy={busy || undefined}
          onClick={() => {
            setBusy(true)
            // Текст відмови вже на екрані: `accept` записав його в `error`.
            void (current ? accept() : signOut())
              .catch(() => undefined)
              .finally(() => {
                setBusy(false)
              })
          }}
        >
          {busy ? <Spinner aria-hidden /> : null}
          {current ? t("auth.invite.accept") : t("auth.invite.signOut")}
        </Button>
      </div>
    </AuthLayout>
  )
}
