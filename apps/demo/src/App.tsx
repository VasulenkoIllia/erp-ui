import { useQueryClient } from "@tanstack/react-query"
import {
  Bell,
  Blocks,
  Building2,
  CalendarDays,
  ClipboardCheck,
  Database,
  Inbox,
  KeySquare,
  Languages,
  LayoutTemplate,
  Palette,
  ScrollText,
  Shapes,
  ShieldCheck,
  ShieldEllipsis,
  UserRound,
  Users,
  Webhook,
} from "lucide-react"
import { useLogout } from "ra-core"
import { Suspense, useCallback, useEffect, useMemo, useState } from "react"
import type { TFunction } from "i18next"
import { useTranslation } from "react-i18next"
import {
  Link,
  useNavigate,
  useLocation as useRouterLocation,
} from "react-router"
import { toast } from "sonner"

import {
  AppShell,
  type NavGroup,
  type RenderLink,
} from "@/registry/erp/app-shell"
import {
  CommandPalette,
  CommandPaletteTrigger,
  useCommandPaletteShortcut,
  type PaletteCommand,
} from "@/registry/erp/command-palette"
import { useAuthMethods, useBrandAppearance } from "@/registry/erp/auth-layout"
import { CompanySwitcher } from "@/registry/erp/company-switcher"
import { ErrorBoundary } from "@/registry/erp/error-boundary"
import { LoadingFallback } from "@/registry/erp/page-state"
import { SessionGuard } from "@/registry/erp/session-guard"
import { InboxBell } from "@/registry/erp/notification-inbox"
import { UserMenu } from "@/registry/erp/user-menu"
import { useBreakpoint } from "@/registry/hooks/use-breakpoint"
import { useCompany } from "@/registry/hooks/use-company"
import { useCompanyProfile } from "@/registry/hooks/use-company-profile"
import { useMe } from "@/registry/hooks/use-me"
import {
  DENSITIES,
  PALETTES,
  setAppearance,
  THEME_MODES,
} from "@/registry/lib/appearance"
import { LANGUAGES, useErpUiT } from "@/registry/lib/i18n"
import { LANGUAGE_NAMES } from "@/registry/lib/language-names"
import { whenIdle } from "@/registry/lib/lazy"
import type { MockMessage } from "@/registry/lib/mock-server"
import { syncPreferences } from "@/registry/lib/preferences"
import {
  ACTION_ICONS,
  IconProvider,
  MODULE_ICONS,
  SHELL_ICONS,
  STATUS_ICONS,
} from "@/registry/lib/icons"
import { cn } from "@/registry/lib/utils"
import { Button, buttonVariants } from "@/registry/ui/button"
import { DropdownMenuItem } from "@/registry/ui/dropdown-menu"
import { Toaster } from "@/registry/ui/sonner"
import { TooltipProvider } from "@/registry/ui/tooltip"

import { apiClient } from "@/data/providers"
import { ERP_EXAMPLE } from "@/fixtures"
import { MOCK_RESOURCES } from "@/mocks/resources"
import { useLanguageFallbackNotice } from "@/i18n/fallback-notice"
import {
  AuthPage,
  DevPanel,
  ImpersonationBanner,
  InvoicePage,
  ModulePage,
  PAGES,
  preloadPage,
} from "@/pages/lazy-pages"
import {
  listSearchOf,
  LOGIN_PATH,
  moduleHref,
  ROUTES,
  useLocation,
  type Location,
  type Route,
} from "@/router"

const PAGE_ICONS: Record<Route, typeof Palette> = {
  appearance: Palette,
  primitives: Blocks,
  formats: Languages,
  fields: CalendarDays,
  forms: ClipboardCheck,
  icons: Shapes,
  states: LayoutTemplate,
  data: Database,
  inbox: Inbox,
  security: ShieldCheck,
  users: Users,
  roles: KeySquare,
  company: Building2,
  profile: UserRound,
  notifications: Bell,
  securityPolicy: ShieldEllipsis,
  audit: ScrollText,
  integrations: Webhook,
}

/** Розділи в нижній панелі телефона. */
const MOBILE_PAGES: Route[] = ["appearance", "primitives", "formats", "states"]

// Чанк сторінки вантажимо, щойно на посилання навели чи сфокусувались (ADR-0009).
const renderLink: RenderLink = (href) => (
  <Link
    to={href}
    onPointerEnter={() => {
      preloadPage(href)
    }}
    onFocus={() => {
      preloadPage(href)
    }}
  />
)

/** Вподобання з сервера (PF11): після входу — застосувати, далі зберігати кожну зміну. */
function usePreferencesSync(userId: string | undefined) {
  useEffect(() => {
    if (!userId) return
    let stop: (() => void) | undefined
    let active = true
    void syncPreferences(apiClient).then((unsubscribe) => {
      if (active) stop = unsubscribe
      else unsubscribe()
    })
    return () => {
      active = false
      stop?.()
    }
  }, [userId])
}

export function App() {
  const { t } = useTranslation()
  const location = useLocation()
  const { data: me } = useMe()
  usePreferencesSync(me?.id)
  // Палітра бренду (white-label) — типова, поки користувач не обрав свою.
  // Палітра компанії (налаштування компанії) — типова, поки користувач не обрав свою.
  const company = useCompanyProfile(Boolean(me))
  useBrandAppearance(company.data?.palette)
  const queryClient = useQueryClient()
  const breakpoint = useBreakpoint()
  useMockMessages()
  useLanguageFallbackNotice()
  const devPanel = (
    <ErrorBoundary
      fallback={(retry) => (
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("app.devPanelFailed")}
          title={t("app.devPanelFailed")}
          onClick={retry}
        >
          <STATUS_ICONS.warning aria-hidden />
        </Button>
      )}
    >
      <Suspense fallback={null}>
        <DevPanel
          resources={MOCK_RESOURCES}
          compact={location.route !== "auth" && breakpoint !== "desktop"}
          onChange={() => {
            void queryClient.invalidateQueries()
          }}
        />
      </Suspense>
    </ErrorBoundary>
  )

  return (
    <IconProvider>
      <TooltipProvider>
        {location.route === "auth" ? (
          <ErrorBoundary className="m-4">
            <Suspense fallback={<LoadingFallback className="mt-24" />}>
              <AuthPage screen={location.screen} devPanel={devPanel} />
            </Suspense>
          </ErrorBoundary>
        ) : (
          <Shell location={location} devPanel={devPanel} />
        )}
      </TooltipProvider>
      <Toaster />
    </IconProvider>
  )
}

/** «Надіслані» мок-сервером SMS і листи — як сповіщення телефона чи пошти (лише демо). */
function useMockMessages() {
  const { t } = useTranslation("demo", { keyPrefix: "authDemo" })
  useEffect(() => {
    let stop: (() => void) | undefined
    let active = true
    // Мок-сервер — окремий чанк поза бюджетом першого екрана; на старті його вже завантажено.
    import("@/registry/lib/mock-server")
      .then(({ subscribeMockMessages }) => {
        if (!active) return
        stop = subscribeMockMessages((message) => {
          showMockMessage(message, t)
        })
      })
      .catch((error: unknown) => {
        console.error("demo: mock messages unavailable", error)
      })
    return () => {
      active = false
      stop?.()
    }
  }, [t])
}

function showMockMessage(
  message: MockMessage,
  t: TFunction<"demo", "authDemo">,
) {
  const options = { duration: 15_000 }
  if (message.channel === "sms") {
    toast(t("smsToast", { to: message.to, code: message.code ?? "" }), options)
    return
  }
  if (message.kind === "notice") {
    toast(t("noticeToast", { to: message.to }), options)
    return
  }
  if (message.kind === "export") {
    toast(t("exportToast", { to: message.to }), options)
    return
  }
  if (message.kind === "recovery") {
    toast(t("recoveryToast", { to: message.to }), options)
    return
  }
  if (message.kind === "factors_reset") {
    toast(t("factorsResetToast", { to: message.to }), {
      ...options,
      description: message.detail,
    })
    return
  }
  if (message.kind === "new_sign_in") {
    toast(t("newSignInToast", { to: message.to }), {
      ...options,
      description: message.detail,
    })
    return
  }
  const link = message.link
  toast(t("emailToast", { to: message.to }), {
    ...options,
    description: message.code
      ? t("emailCode", { code: message.code })
      : undefined,
    action: link
      ? {
          label: t("openLink"),
          onClick: () => {
            window.location.assign(link)
          },
        }
      : undefined,
  })
}

function Shell({
  location,
  devPanel,
}: {
  location: Exclude<Location, { route: "auth" }>
  devPanel: React.ReactNode
}) {
  const { t } = useTranslation()
  const kitT = useErpUiT()
  const navigate = useNavigate()
  // Крихта «Дані й моки» з картки веде до списку з тими ж фільтрами, що й «До списку».
  const routerState: unknown = useRouterLocation().state
  const logout = useLogout()
  const breakpoint = useBreakpoint()
  const meQuery = useMe()
  const me = meQuery.data
  const methods = useAuthMethods()
  const [company, setCompany] = useCompany()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const openPalette = useCallback(() => {
    setPaletteOpen(true)
  }, [])
  useCommandPaletteShortcut(openPalette)
  // Екран входу — заздалегідь: вихід чи кінець сесії не показують спінер на весь екран.
  useEffect(
    () =>
      whenIdle(() => {
        void AuthPage.preload()
      }),
    [],
  )

  const nav = useMemo<NavGroup[]>(
    () => [
      {
        id: "kit",
        label: t("nav.kit"),
        items: (Object.keys(ROUTES) as Route[]).map((route) => ({
          id: route,
          label: t(`app.pages.${route}`),
          href: ROUTES[route],
          icon: PAGE_ICONS[route],
          mobile: MOBILE_PAGES.includes(route),
        })),
      },
      {
        id: "erp",
        label: t("nav.erp"),
        items: ERP_EXAMPLE.map(({ id, badge }) => ({
          id,
          label: kitT(`modules.${id}`),
          href: moduleHref(id),
          icon: MODULE_ICONS[id],
          badge,
        })),
      },
    ],
    [t, kitT],
  )

  const commands = useMemo<PaletteCommand[]>(() => {
    const pages = nav.flatMap((group) =>
      group.items.map((item) => ({
        id: `go-${item.id}`,
        label: item.label,
        group: group.id === "kit" ? t("commands.pages") : t("commands.modules"),
        icon: item.icon,
        keywords: [item.id],
        onSelect: () => {
          void navigate(item.href)
        },
      })),
    )
    const actions: PaletteCommand[] = [
      {
        id: "create-invoice",
        label: t("commands.createInvoice"),
        group: t("commands.actions"),
        icon: ACTION_ICONS.create,
        keywords: ["K2", "invoice", "рахунок"],
        onSelect: () => {
          toast.success(t("commands.invoiceCreated"))
        },
      },
    ]
    const appearance: PaletteCommand[] = [
      ...THEME_MODES.map((theme) => ({
        id: `theme-${theme}`,
        label: t("commands.theme", { name: kitT(`themes.${theme}`) }),
        group: t("commands.appearance"),
        icon:
          theme === "dark"
            ? SHELL_ICONS.themeDark
            : theme === "light"
              ? SHELL_ICONS.themeLight
              : SHELL_ICONS.themeSystem,
        onSelect: () => {
          setAppearance({ theme })
        },
      })),
      ...PALETTES.map((palette) => ({
        id: `palette-${palette}`,
        label: t("commands.palette", { name: kitT(`palettes.${palette}`) }),
        group: t("commands.appearance"),
        icon: SHELL_ICONS.palette,
        onSelect: () => {
          setAppearance({ palette })
        },
      })),
      ...DENSITIES.map((density) => ({
        id: `density-${density}`,
        label: t("commands.density", { name: kitT(`densities.${density}`) }),
        group: t("commands.appearance"),
        icon: SHELL_ICONS.density,
        onSelect: () => {
          setAppearance({ density })
        },
      })),
      ...LANGUAGES.map((language) => ({
        id: `language-${language}`,
        label: t("commands.language", { name: LANGUAGE_NAMES[language] }),
        group: t("commands.appearance"),
        icon: SHELL_ICONS.language,
        keywords: ["language", "мова"],
        onSelect: () => {
          setAppearance({ language })
        },
      })),
    ]
    return [...pages, ...actions, ...appearance]
  }, [nav, t, kitT, navigate])

  // Картка рахунку — частина стрес-сторінки «Дані й моки»: та сама позначка в навігації.
  const activeId =
    location.route === "module"
      ? location.moduleId
      : location.route === "invoice"
        ? "data"
        : location.route
  const group = nav.find((g) => g.items.some((item) => item.id === activeId))
  const current = group?.items.find((item) => item.id === activeId)
  const Page =
    PAGES[
      location.route === "module" || location.route === "invoice"
        ? "appearance"
        : location.route
    ]

  return (
    <>
      <AppShell
        nav={nav}
        activeId={activeId}
        renderLink={renderLink}
        banner={
          me?.impersonator ? (
            <ErrorBoundary
              fallback={(retry) => (
                // Без чанка смуги — хоча б від чийого імені робота (ADR-0011).
                <div
                  role="alert"
                  className="flex items-center gap-3 bg-warning-soft px-4 py-2 text-sm font-medium text-warning-foreground"
                >
                  <p className="min-w-0 flex-1">
                    {kitT("auth.impersonation.banner", { name: me.name })}
                  </p>
                  <Button variant="outline" size="sm" onClick={retry}>
                    {kitT("pageState.error.retry")}
                  </Button>
                </div>
              )}
            >
              <Suspense fallback={null}>
                <ImpersonationBanner
                  onStopped={() => {
                    void navigate(ROUTES.users)
                  }}
                />
              </Suspense>
            </ErrorBoundary>
          ) : null
        }
        breadcrumbs={[
          { label: group?.label ?? "" },
          location.route === "invoice"
            ? {
                label: current?.label ?? "",
                href: `${ROUTES.data}${listSearchOf(routerState)}`,
              }
            : { label: current?.label ?? "" },
          ...(location.route === "invoice"
            ? [{ label: t("app.pages.invoice") }]
            : []),
        ]}
        header={
          me && company ? (
            <CompanySwitcher
              companies={me.companies}
              value={company}
              onValueChange={setCompany}
            />
          ) : null
        }
        actions={
          <>
            <CommandPaletteTrigger
              compact={breakpoint !== "desktop"}
              className={breakpoint === "desktop" ? "w-64" : undefined}
              onClick={openPalette}
            />
            {devPanel}
            {me ? (
              <>
                <InboxBell
                  onNavigate={(link) => {
                    void navigate(link)
                  }}
                  onShowAll={() => {
                    void navigate(ROUTES.inbox)
                  }}
                />
                <UserMenu
                  user={{
                    name: me.name,
                    email: me.email,
                    avatarUrl: me.avatarUrl,
                  }}
                  onSignOut={() => {
                    // Збій виходу (офлайн, 5xx): сесія на сервері жива — кажемо про це, а не мовчимо.
                    void logout().then(
                      () => {
                        toast(t("app.signOut"))
                      },
                      () => {
                        toast.error(t("app.signOutFailed"))
                      },
                    )
                  }}
                >
                  <DropdownMenuItem
                    onClick={() => {
                      void navigate(ROUTES.profile)
                    }}
                  >
                    <SHELL_ICONS.user aria-hidden />
                    {t("user.profile")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      void navigate(ROUTES.security)
                    }}
                  >
                    <ACTION_ICONS.settings aria-hidden />
                    {t("app.pages.security")}
                  </DropdownMenuItem>
                </UserMenu>
              </>
            ) : meQuery.isError ||
              (meQuery.isFetching && meQuery.errorUpdateCount > 0) ? (
              // Профіль не завантажився (мережа, 5xx): людина, можливо, увійшла — «Увійти» збило б її.
              <Button
                variant="outline"
                size="sm"
                title={t("app.meFailed")}
                aria-busy={meQuery.isFetching || undefined}
                onClick={() => {
                  if (!meQuery.isFetching) void meQuery.refetch()
                }}
              >
                <ACTION_ICONS.refresh aria-hidden />
                {t("app.meRetry")}
              </Button>
            ) : (
              <Link
                to={LOGIN_PATH}
                onPointerEnter={() => {
                  preloadPage(LOGIN_PATH)
                }}
                onFocus={() => {
                  preloadPage(LOGIN_PATH)
                }}
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                )}
              >
                <SHELL_ICONS.signIn aria-hidden />
                {t("app.signIn")}
              </Link>
            )}
          </>
        }
      >
        {/* Ключ — адреса: перехід на іншу сторінку скидає помилку попередньої. */}
        <ErrorBoundary
          key={
            location.route === "invoice"
              ? `${activeId}/${location.id}`
              : activeId
          }
        >
          <Suspense fallback={<LoadingFallback />}>
            {location.route === "module" ? (
              <ModulePage moduleId={location.moduleId} />
            ) : location.route === "invoice" ? (
              <InvoicePage id={location.id} />
            ) : (
              <Page />
            )}
          </Suspense>
        </ErrorBoundary>
      </AppShell>
      {me ? (
        <SessionGuard idleMinutes={methods.data?.idleTimeoutMinutes} />
      ) : null}
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        commands={commands}
      />
    </>
  )
}
