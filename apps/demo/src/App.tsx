import {
  Blocks,
  Languages,
  LayoutTemplate,
  Palette,
  Shapes,
} from "lucide-react"
import { lazy, Suspense, useCallback, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { AppShell, type NavGroup } from "@/registry/erp/app-shell"
import {
  CommandPalette,
  CommandPaletteTrigger,
  useCommandPaletteShortcut,
  type PaletteCommand,
} from "@/registry/erp/command-palette"
import { CompanySwitcher } from "@/registry/erp/company-switcher"
import { NotificationBell } from "@/registry/erp/notification-bell"
import { LANGUAGE_NAMES, UserMenu } from "@/registry/erp/user-menu"
import { useBreakpoint } from "@/registry/hooks/use-breakpoint"
import {
  DENSITIES,
  PALETTES,
  setAppearance,
  THEME_MODES,
} from "@/registry/lib/appearance"
import { LANGUAGES, useErpUiT } from "@/registry/lib/i18n"
import {
  ACTION_ICONS,
  IconProvider,
  MODULE_ICONS,
  SHELL_ICONS,
} from "@/registry/lib/icons"
import { DropdownMenuItem } from "@/registry/ui/dropdown-menu"
import { Toaster } from "@/registry/ui/sonner"
import { Spinner } from "@/registry/ui/spinner"
import { TooltipProvider } from "@/registry/ui/tooltip"

import { COMPANIES, DEMO_USER, ERP_EXAMPLE } from "@/fixtures"
import { AppearancePage } from "@/pages/AppearancePage"
import { IconsPage } from "@/pages/IconsPage"
import { ModulePage } from "@/pages/ModulePage"
import { PrimitivesPage } from "@/pages/PrimitivesPage"
import { StatesPage } from "@/pages/StatesPage"
import { moduleHref, ROUTES, useLocation, type Route } from "@/router"

// Сторінка з полем телефону тягне дані libphonenumber (~120 КБ gzip) — вантажимо її окремим чанком.
const FormatsPage = lazy(() =>
  import("@/pages/FormatsPage").then((m) => ({ default: m.FormatsPage })),
)

const PAGES: Record<Route, React.ComponentType> = {
  appearance: AppearancePage,
  primitives: PrimitivesPage,
  formats: FormatsPage,
  icons: IconsPage,
  states: StatesPage,
}

const PAGE_ICONS: Record<Route, typeof Palette> = {
  appearance: Palette,
  primitives: Blocks,
  formats: Languages,
  icons: Shapes,
  states: LayoutTemplate,
}

/** Розділи в нижній панелі телефона. */
const MOBILE_PAGES: Route[] = ["appearance", "primitives", "formats", "states"]

const go = (href: string) => {
  window.location.hash = href
}

export function App() {
  const { t } = useTranslation()
  const kitT = useErpUiT()
  const location = useLocation()
  const breakpoint = useBreakpoint()
  const [company, setCompany] = useState(COMPANIES[0]?.id ?? "")
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
          go(item.href)
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
  }, [nav, t, kitT])

  const activeId =
    location.route === "module" ? location.moduleId : location.route
  const group = nav.find((g) => g.items.some((item) => item.id === activeId))
  const current = group?.items.find((item) => item.id === activeId)
  const Page = location.route === "module" ? null : PAGES[location.route]

  return (
    <IconProvider>
      <TooltipProvider>
        <AppShell
          nav={nav}
          activeId={activeId}
          breadcrumbs={[
            { label: group?.label ?? "" },
            { label: current?.label ?? "" },
          ]}
          header={
            <CompanySwitcher
              companies={COMPANIES}
              value={company}
              onValueChange={setCompany}
            />
          }
          actions={
            <>
              <CommandPaletteTrigger
                compact={breakpoint !== "desktop"}
                className={breakpoint === "desktop" ? "w-64" : undefined}
                onClick={openPalette}
              />
              <NotificationBell count={3} />
              <UserMenu
                user={DEMO_USER}
                onSignOut={() => {
                  toast(t("user.signedOut"))
                }}
              >
                <DropdownMenuItem>
                  <SHELL_ICONS.user aria-hidden />
                  {t("user.profile")}
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <ACTION_ICONS.settings aria-hidden />
                  {t("user.settings")}
                </DropdownMenuItem>
              </UserMenu>
            </>
          }
        >
          <Suspense fallback={<Spinner className="mx-auto size-6" />}>
            {location.route === "module" ? (
              <ModulePage moduleId={location.moduleId} />
            ) : Page ? (
              <Page />
            ) : null}
          </Suspense>
        </AppShell>
        <CommandPalette
          open={paletteOpen}
          onOpenChange={setPaletteOpen}
          commands={commands}
        />
      </TooltipProvider>
      <Toaster />
    </IconProvider>
  )
}
