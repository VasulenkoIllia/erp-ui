import { useQueryClient } from "@tanstack/react-query"
import {
  Bell,
  Blocks,
  Building2,
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
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react"
import { useTranslation } from "react-i18next"
import { Link, useNavigate } from "react-router"
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
import { DevPanel } from "@/registry/erp/dev-panel"
import { ImpersonationBanner } from "@/registry/erp/impersonation"
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
import { subscribeMockMessages } from "@/registry/lib/mocks"
import { syncPreferences } from "@/registry/lib/preferences"
import {
  ACTION_ICONS,
  IconProvider,
  MODULE_ICONS,
  SHELL_ICONS,
} from "@/registry/lib/icons"
import { cn } from "@/registry/lib/utils"
import { Button, buttonVariants } from "@/registry/ui/button"
import { DropdownMenuItem } from "@/registry/ui/dropdown-menu"
import { Toaster } from "@/registry/ui/sonner"
import { Spinner } from "@/registry/ui/spinner"
import { TooltipProvider } from "@/registry/ui/tooltip"

import { apiClient } from "@/data/providers"
import { ERP_EXAMPLE } from "@/fixtures"
import { MOCK_RESOURCES } from "@/mocks/handlers"
import { AppearancePage } from "@/pages/AppearancePage"
import { DataPage } from "@/pages/DataPage"
import { IconsPage } from "@/pages/IconsPage"
import { AuthPage } from "@/pages/AuthPage"
import { ModulePage } from "@/pages/ModulePage"
import { PrimitivesPage } from "@/pages/PrimitivesPage"
import { StatesPage } from "@/pages/StatesPage"
import { UsersPage } from "@/pages/UsersPage"
import {
  LOGIN_PATH,
  moduleHref,
  ROUTES,
  useLocation,
  type Location,
  type Route,
} from "@/router"

// Сторінка з полем телефону тягне дані libphonenumber (~120 КБ gzip) — вантажимо її окремим чанком.
const FormatsPage = lazy(() =>
  import("@/pages/FormatsPage").then((m) => ({ default: m.FormatsPage })),
)
// Безпека акаунта — теж: поле телефону, QR-коди, діалоги налаштування факторів.
const SecurityPage = lazy(() =>
  import("@/pages/SecurityPage").then((m) => ({ default: m.SecurityPage })),
)
const ProfilePage = lazy(() =>
  import("@/pages/ProfilePage").then((m) => ({ default: m.ProfilePage })),
)
const SecurityPolicyPage = lazy(() =>
  import("@/pages/SecurityPolicyPage").then((m) => ({
    default: m.SecurityPolicyPage,
  })),
)
const NotificationsPage = lazy(() =>
  import("@/pages/NotificationsPage").then((m) => ({
    default: m.NotificationsPage,
  })),
)
const AuditPage = lazy(() =>
  import("@/pages/AuditPage").then((m) => ({ default: m.AuditPage })),
)
const IntegrationsPage = lazy(() =>
  import("@/pages/IntegrationsPage").then((m) => ({
    default: m.IntegrationsPage,
  })),
)

const RolesPage = lazy(() =>
  import("@/pages/RolesPage").then((m) => ({ default: m.RolesPage })),
)
// Реквізити — теж: поле телефону.
const CompanyPage = lazy(() =>
  import("@/pages/CompanyPage").then((m) => ({ default: m.CompanyPage })),
)
const InboxPage = lazy(() =>
  import("@/pages/InboxPage").then((m) => ({ default: m.InboxPage })),
)

const PAGES: Record<Route, React.ComponentType> = {
  appearance: AppearancePage,
  primitives: PrimitivesPage,
  formats: FormatsPage,
  icons: IconsPage,
  states: StatesPage,
  data: DataPage,
  inbox: InboxPage,
  security: SecurityPage,
  users: UsersPage,
  roles: RolesPage,
  company: CompanyPage,
  profile: ProfilePage,
  notifications: NotificationsPage,
  securityPolicy: SecurityPolicyPage,
  audit: AuditPage,
  integrations: IntegrationsPage,
}

const PAGE_ICONS: Record<Route, typeof Palette> = {
  appearance: Palette,
  primitives: Blocks,
  formats: Languages,
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

const renderLink: RenderLink = (href) => <Link to={href} />

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
  const devPanel = (
    <DevPanel
      resources={MOCK_RESOURCES}
      compact={location.route !== "auth" && breakpoint !== "desktop"}
      onChange={() => {
        void queryClient.invalidateQueries()
      }}
    />
  )

  return (
    <IconProvider>
      <TooltipProvider>
        {location.route === "auth" ? (
          <AuthPage screen={location.screen} devPanel={devPanel} />
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
  useEffect(
    () =>
      subscribeMockMessages((message) => {
        const options = { duration: 15_000 }
        if (message.channel === "sms") {
          toast(
            t("smsToast", { to: message.to, code: message.code ?? "" }),
            options,
          )
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
      }),
    [t],
  )
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

  const activeId =
    location.route === "module" ? location.moduleId : location.route
  const group = nav.find((g) => g.items.some((item) => item.id === activeId))
  const current = group?.items.find((item) => item.id === activeId)
  const Page =
    PAGES[location.route === "module" ? "appearance" : location.route]

  return (
    <>
      <AppShell
        nav={nav}
        activeId={activeId}
        renderLink={renderLink}
        banner={
          <ImpersonationBanner
            onStopped={() => {
              void navigate(ROUTES.users)
            }}
          />
        }
        breadcrumbs={[
          { label: group?.label ?? "" },
          { label: current?.label ?? "" },
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
        <Suspense fallback={<Spinner className="mx-auto size-6" />}>
          {location.route === "module" ? (
            <ModulePage moduleId={location.moduleId} />
          ) : (
            <Page />
          )}
        </Suspense>
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
