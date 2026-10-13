"use client"

import * as React from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useAuthProvider, useLocation, useNavigate } from "ra-core"

import { useApiErrorMessage } from "@/registry/hooks/use-api-error-message"
import { isApiError } from "@/registry/lib/api"
import { setBrandAppearance } from "@/registry/lib/appearance"
import {
  localizedText,
  type Branding,
  type ErpAuthProvider,
} from "@/registry/lib/auth"
import { useErpUiT, useLanguage, type ErpUiKey } from "@/registry/lib/i18n"
import { cn } from "@/registry/lib/utils"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/registry/ui/card"

/**
 * Спільне для екранів входу (ADR-0010, ADR-0011): картка по центру, бренд (логотип, палітра, бічна
 * панель, документи), адреси екранів, перехід після входу й тексти помилок полів.
 * Маршрутизація — через ra-core, тож працює з будь-яким роутером.
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

export const AUTH_METHODS_QUERY_KEY = ["erp-ui", "auth-methods"] as const

/** Що ввімкнено в проекті й бренд (`GET /auth/methods`); кеш на 5 хв. */
export function useAuthMethods() {
  const provider = useErpAuthProvider()
  return useQuery({
    queryKey: AUTH_METHODS_QUERY_KEY,
    queryFn: () => provider.getMethods(),
    staleTime: 5 * 60_000,
  })
}

/** Бренд з сервера (white-label за доменом); undefined — без бренду або ще завантажується. */
export function useBranding(): Branding | undefined {
  return useAuthMethods().data?.branding
}

/**
 * Палітра бренду — типова для всього застосунку (де користувач не обрав свою). Викликати один раз
 * у корені; AuthLayout робить це сам.
 */
export function useBrandAppearance(): void {
  const palette = useBranding()?.palette
  React.useEffect(() => {
    setBrandAppearance(palette ? { palette } : null)
  }, [palette])
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("")

/** Логотип бренду (світлий і темний варіант) або назва з ініціалами, якщо логотипа немає. */
export function BrandLogo({
  branding,
  className,
}: {
  branding: Branding
  className?: string
}) {
  if (branding.logoUrl)
    return (
      <span
        data-slot="brand-logo"
        className={cn("inline-flex items-center", className)}
      >
        <img
          src={branding.logoUrl}
          alt={branding.name}
          className={cn("h-8 w-auto", branding.logoDarkUrl && "dark:hidden")}
        />
        {branding.logoDarkUrl ? (
          <img
            src={branding.logoDarkUrl}
            alt={branding.name}
            className="hidden h-8 w-auto dark:block"
          />
        ) : null}
      </span>
    )
  return (
    <span
      data-slot="brand-logo"
      className={cn("inline-flex items-center gap-2 font-semibold", className)}
    >
      <span
        aria-hidden
        className="flex size-8 items-center justify-center rounded-md bg-primary text-sm text-primary-foreground"
      >
        {initials(branding.name)}
      </span>
      {branding.name}
    </span>
  )
}

/** Бічна панель бренду на широких екранах: заголовок, текст, декоративне тло. */
function BrandPanel({ branding }: { branding: Branding }) {
  const { language } = useLanguage()
  const panel = branding.panel
  if (!panel) return null
  const text = localizedText(panel.text, language)
  return (
    <aside
      data-slot="brand-panel"
      className="sticky top-0 hidden h-svh flex-col justify-end overflow-hidden bg-primary p-10 text-primary-foreground @5xl:flex"
    >
      {panel.imageUrl ? (
        <img
          src={panel.imageUrl}
          alt=""
          className="absolute inset-0 size-full object-cover opacity-15"
        />
      ) : (
        <div aria-hidden className="absolute -top-24 -right-24">
          <div className="size-96 rounded-full border-2 border-primary-foreground/15" />
          <div className="absolute inset-16 rounded-full border-2 border-primary-foreground/15" />
          <div className="absolute inset-32 rounded-full bg-primary-foreground/10" />
        </div>
      )}
      <div className="relative max-w-md space-y-3">
        <h2 className="text-3xl font-semibold text-balance">
          {localizedText(panel.title, language)}
        </h2>
        {text ? <p className="text-lg text-pretty">{text}</p> : null}
      </div>
    </aside>
  )
}

/** Умови, конфіденційність і підтримка під карткою входу. */
function BrandLinks({ branding }: { branding: Branding }) {
  const t = useErpUiT()
  const links = [
    branding.termsUrl
      ? { href: branding.termsUrl, label: t("auth.brand.terms") }
      : null,
    branding.privacyUrl
      ? { href: branding.privacyUrl, label: t("auth.brand.privacy") }
      : null,
    branding.supportEmail
      ? {
          href: `mailto:${branding.supportEmail}`,
          label: t("auth.brand.support", { email: branding.supportEmail }),
        }
      : null,
  ].filter((link) => link !== null)
  if (!links.length) return null
  return (
    <nav aria-label={t("auth.brand.legal")}>
      <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {links.map((link) => (
          <li key={link.href}>
            <a
              href={link.href}
              className="underline-offset-4 hover:text-foreground hover:underline"
            >
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
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
 *
 * Бренд (`GET /auth/methods` → `branding`): логотип над карткою, палітра, бічна панель на широких
 * екранах, посилання на документи й підтримку; назва бренду — у заголовку вкладки.
 * `branded={false}` — без бренду (напр. сторінка стороннього провайдера в демо).
 */
export function AuthLayout({
  title,
  description,
  logo,
  footer,
  branded = true,
  className,
  children,
}: {
  title: string
  description?: React.ReactNode
  /** Знак над карткою; за замовчуванням — логотип бренду. */
  logo?: React.ReactNode
  /** Під карткою: перемикач мови, підказки демо. */
  footer?: React.ReactNode
  branded?: boolean
  className?: string
  children: React.ReactNode
}) {
  const heading = React.useRef<HTMLHeadingElement>(null)
  const first = React.useRef(true)
  const brand = useBranding()
  const branding = branded ? brand : undefined
  useBrandAppearance()
  const pageTitle = branding ? `${title} · ${branding.name}` : title
  React.useEffect(() => {
    document.title = pageTitle
  }, [pageTitle])
  React.useEffect(() => {
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
      className={cn("@container min-h-svh bg-muted/40", className)}
    >
      <div
        className={cn("grid min-h-svh", branding?.panel && "@5xl:grid-cols-2")}
      >
        <div className="grid place-items-center px-4 py-8">
          <div className="w-full max-w-sm space-y-4">
            {logo ??
              (branding ? (
                <div className="flex justify-center">
                  <BrandLogo branding={branding} />
                </div>
              ) : null)}
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
            {branding ? <BrandLinks branding={branding} /> : null}
          </div>
        </div>
        {branding ? <BrandPanel branding={branding} /> : null}
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
