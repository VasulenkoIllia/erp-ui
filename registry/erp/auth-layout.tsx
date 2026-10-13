"use client"

import * as React from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useAuthProvider, useLocation, useNavigate } from "ra-core"

import { useApiErrorMessage } from "@/registry/hooks/use-api-error-message"
import { isApiError } from "@/registry/lib/api"
import type { ErpAuthProvider } from "@/registry/lib/auth"
import { useErpUiT, type ErpUiKey } from "@/registry/lib/i18n"
import { cn } from "@/registry/lib/utils"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/registry/ui/card"

/**
 * Спільне для екранів входу (ADR-0010): картка по центру, адреси екранів, перехід після входу
 * й тексти помилок полів. Маршрутизація — через ra-core, тож працює з будь-яким роутером.
 */

/** Адреси екранів входу в застосунку; перевизначаються пропсом `paths`. */
export const AUTH_PATHS = {
  login: "/login",
  forgot: "/login/forgot",
  signUp: "/signup",
  callback: "/auth/callback",
}
export type AuthPaths = typeof AUTH_PATHS

export function useErpAuthProvider(): ErpAuthProvider {
  const provider = useAuthProvider<ErpAuthProvider>()
  if (!provider)
    throw new Error(
      "Екрани входу потребують authProvider із lib/auth (createAuthProvider)",
    )
  return provider
}

/** Куди після входу: сторінка, з якої ra-core перенаправив на вхід, або `fallback`. */
export function useLoginTarget(fallback = "/"): string {
  const location = useLocation()
  const state = location.state as
    { nextPathname?: string; nextSearch?: string } | null | undefined
  return state?.nextPathname
    ? state.nextPathname + (state.nextSearch ?? "")
    : fallback
}

/** Перехід після входу (див. useLoginTarget). */
export function useAfterLogin(fallback = "/") {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const target = useLoginTarget(fallback)
  return React.useCallback(() => {
    // Права й доступи попереднього користувача більше не дійсні.
    void queryClient.invalidateQueries({ queryKey: ["auth"] })
    navigate(target, { replace: true })
  }, [navigate, queryClient, target])
}

/** Текст помилки поля з `fieldErrors` сервера (`weak`, `taken`…) мовою інтерфейсу. */
export function useFieldError(): (
  error: unknown,
  field: string,
) => string | null {
  const t = useErpUiT()
  return React.useCallback(
    (error: unknown, field: string) => {
      if (!isApiError(error)) return null
      const code = error.fieldErrors?.[field]
      if (!code) return null
      const key = `auth.fieldErrors.${code}` as ErpUiKey
      const text = t(key)
      return text === key ? t("auth.fieldErrors.invalid") : text
    },
    [t],
  )
}

/** Загальний текст помилки для банера над формою. */
export function useAuthErrorText(): (error: unknown) => string {
  const t = useErpUiT()
  const apiMessage = useApiErrorMessage()
  return React.useCallback(
    (error: unknown) =>
      isApiError(error) &&
      (error.status === 0 || error.status >= 500 || error.status === 429)
        ? apiMessage(error)
        : t("auth.failed", { message: apiMessage(error) }),
    [t, apiMessage],
  )
}

/**
 * Картка екрана входу. Заголовок (h1) отримує фокус, коли змінюється крок (`title`), —
 * скрінрідер чує новий крок, а не мовчить.
 */
export function AuthLayout({
  title,
  description,
  logo,
  footer,
  className,
  children,
}: {
  title: string
  description?: React.ReactNode
  /** Знак чи назва продукту над карткою. */
  logo?: React.ReactNode
  /** Під карткою: перемикач мови, посилання на політику, підказки демо. */
  footer?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  const heading = React.useRef<HTMLHeadingElement>(null)
  const first = React.useRef(true)
  React.useEffect(() => {
    document.title = title
    if (first.current) {
      first.current = false
      return
    }
    heading.current?.focus()
  }, [title])

  return (
    <main
      id="erp-ui-main"
      data-slot="auth-layout"
      className={cn(
        "grid min-h-svh place-items-center bg-muted/40 px-4 py-8",
        className,
      )}
    >
      <div className="w-full max-w-sm space-y-4">
        {logo}
        <Card>
          <CardHeader>
            <CardTitle>
              <h1
                ref={heading}
                tabIndex={-1}
                className="text-xl font-semibold focus-visible:outline-none"
              >
                {title}
              </h1>
            </CardTitle>
            {description ? (
              <CardDescription>{description}</CardDescription>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-4">{children}</CardContent>
        </Card>
        {footer}
      </div>
    </main>
  )
}

/** Роздільник «або» між способами входу. */
export function AuthDivider() {
  const t = useErpUiT()
  return (
    <div
      className="flex items-center gap-3 text-xs text-muted-foreground uppercase"
      aria-hidden
    >
      <span className="h-px flex-1 bg-border" />
      {t("auth.or")}
      <span className="h-px flex-1 bg-border" />
    </div>
  )
}
