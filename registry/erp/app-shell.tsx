"use client"

import * as React from "react"
import { EllipsisIcon, type LucideIcon } from "lucide-react"

import { useErpUiT } from "@/registry/lib/i18n"
import { cn } from "@/registry/lib/utils"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/registry/ui/breadcrumb"
import { Separator } from "@/registry/ui/separator"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/registry/ui/sidebar"

/**
 * Оболонка застосунку (SPEC §7 «Навігація», §9, §10).
 *
 * - Десктоп (≥ 1280 px) — сайдбар із групами модулів; згортається кнопкою або Ctrl+B.
 * - Планшет (768–1279 px) — вузька панель з іконками й підказками.
 * - Телефон — нижня панель на 4 розділи (`mobile: true`) + «Ще», що відкриває повне меню.
 * - Топбар: кнопка сайдбара, хлібні крихти, слот `actions` (пошук, сповіщення, меню користувача).
 * - Посилання — звичайні `<a href>`; для роутера передайте `renderLink` (напр. `<Link to={href} />`).
 * - «Перейти до вмісту» — перше, що отримує фокус; липкі панелі не перекривають елемент у фокусі.
 */
export interface NavItem {
  id: string
  label: string
  href: string
  icon: LucideIcon
  /** Лічильник праворуч: на погодженні, непрочитані. */
  badge?: number
  /** Показувати в нижній панелі телефона (до 4 пунктів; решта — у «Ще»). */
  mobile?: boolean
}

export interface NavGroup {
  id: string
  label: string
  items: NavItem[]
}

export interface Crumb {
  label: string
  href?: string
}

export type RenderLink = (href: string) => React.ReactElement

// Вміст посилання підставляє компонент, що його рендерить (render / cloneElement).
// eslint-disable-next-line jsx-a11y-x/anchor-has-content -- див. коментар вище
const defaultRenderLink: RenderLink = (href) => <a href={href} />

export interface AppShellProps {
  nav: NavGroup[]
  /** id активного пункту навігації. */
  activeId?: string
  /** Верх сайдбара: назва продукту або перемикач компанії. */
  header?: React.ReactNode
  /** Низ сайдбара. */
  footer?: React.ReactNode
  /** Шлях до сторінки; останній елемент — поточна сторінка. */
  breadcrumbs?: Crumb[]
  /** Права частина топбару. */
  actions?: React.ReactNode
  /** Смуга над топбаром: «Увійти як…», оголошення, офлайн. */
  banner?: React.ReactNode
  renderLink?: RenderLink
  children: React.ReactNode
}

const MAIN_ID = "erp-ui-main"
const MOBILE_ITEMS = 4

function NavMenu({
  nav,
  activeId,
  renderLink,
}: Pick<AppShellProps, "nav" | "activeId"> & { renderLink: RenderLink }) {
  const { isMobile, setOpenMobile } = useSidebar()
  return nav.map((group) => (
    <SidebarGroup key={group.id}>
      <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
      <SidebarMenu>
        {group.items.map((item) => {
          const active = item.id === activeId
          return (
            <SidebarMenuItem key={item.id}>
              <SidebarMenuButton
                render={renderLink(item.href)}
                isActive={active}
                aria-current={active ? "page" : undefined}
                tooltip={item.label}
                onClick={() => {
                  if (isMobile) setOpenMobile(false)
                }}
              >
                <item.icon aria-hidden />
                <span>{item.label}</span>
              </SidebarMenuButton>
              {item.badge ? (
                <SidebarMenuBadge>{item.badge}</SidebarMenuBadge>
              ) : null}
            </SidebarMenuItem>
          )
        })}
      </SidebarMenu>
    </SidebarGroup>
  ))
}

/** Нижня панель телефона: до 4 розділів + «Ще» (повне меню в шторці). */
function BottomNav({
  nav,
  activeId,
  renderLink,
}: Pick<AppShellProps, "nav" | "activeId"> & { renderLink: RenderLink }) {
  const t = useErpUiT()
  const { setOpenMobile, openMobile } = useSidebar()
  const items = nav
    .flatMap((group) => group.items)
    .filter((item) => item.mobile)
    .slice(0, MOBILE_ITEMS)
  const itemClass =
    "flex min-h-touch flex-1 flex-col items-center justify-center gap-0.5 rounded-md px-1 py-1.5 text-xs font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring aria-[current=page]:text-primary [&_svg]:size-5"
  return (
    <nav
      aria-label={t("shell.bottomNav")}
      data-slot="bottom-nav"
      className="fixed inset-x-0 bottom-0 z-20 border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="flex gap-1 px-2 py-1">
        {items.map((item) => {
          const active = item.id === activeId
          const link = renderLink(item.href)
          return (
            <li key={item.id} className="flex flex-1">
              {React.cloneElement(
                link,
                {
                  className: itemClass,
                  "aria-current": active ? "page" : undefined,
                } as React.HTMLAttributes<HTMLElement>,
                <item.icon aria-hidden />,
                <span className="max-w-full truncate">{item.label}</span>,
              )}
            </li>
          )
        })}
        <li className="flex flex-1">
          <button
            type="button"
            className={itemClass}
            aria-expanded={openMobile}
            aria-haspopup="dialog"
            onClick={() => {
              setOpenMobile(true)
            }}
          >
            <EllipsisIcon aria-hidden />
            <span>{t("shell.more")}</span>
          </button>
        </li>
      </ul>
    </nav>
  )
}

function Topbar({
  breadcrumbs,
  actions,
  renderLink,
}: Pick<AppShellProps, "breadcrumbs" | "actions"> & {
  renderLink: RenderLink
}) {
  const crumbs = breadcrumbs ?? []
  return (
    <header
      data-slot="topbar"
      className="flex h-14 shrink-0 items-center gap-2 border-b bg-background px-3 md:px-4"
    >
      <SidebarTrigger className="hidden md:inline-flex" />
      <Separator orientation="vertical" className="hidden h-5 md:block" />
      {crumbs.length ? (
        <Breadcrumb className="min-w-0 flex-1">
          <BreadcrumbList className="flex-nowrap">
            {crumbs.map((crumb, index) => {
              const last = index === crumbs.length - 1
              return (
                <React.Fragment key={`${crumb.label}-${String(index)}`}>
                  {/* На телефоні — лише поточна сторінка. */}
                  <BreadcrumbItem
                    className={cn("min-w-0", !last && "hidden md:inline-flex")}
                  >
                    {last || !crumb.href ? (
                      <BreadcrumbPage className="truncate font-medium">
                        {crumb.label}
                      </BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink render={renderLink(crumb.href)}>
                        {crumb.label}
                      </BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                  {last ? null : (
                    <BreadcrumbSeparator className="hidden md:inline-flex" />
                  )}
                </React.Fragment>
              )
            })}
          </BreadcrumbList>
        </Breadcrumb>
      ) : (
        <div className="flex-1" />
      )}
      <div className="flex shrink-0 items-center gap-1">{actions}</div>
    </header>
  )
}

export function AppShell({
  nav,
  activeId,
  header,
  footer,
  breadcrumbs,
  actions,
  banner,
  renderLink = defaultRenderLink,
  children,
}: AppShellProps) {
  const t = useErpUiT()
  return (
    <SidebarProvider data-slot="app-shell">
      <a
        href={`#${MAIN_ID}`}
        className="sr-only z-50 rounded-md bg-background px-3 py-2 font-medium focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:ring-2 focus:ring-ring"
        onClick={(event) => {
          // Хеш-роутер не має перехоплювати це посилання: лише переносимо фокус.
          event.preventDefault()
          document.getElementById(MAIN_ID)?.focus()
        }}
      >
        {t("shell.skipToContent")}
      </a>
      <Sidebar collapsible="icon">
        {header ? <SidebarHeader>{header}</SidebarHeader> : null}
        <SidebarContent>
          <nav aria-label={t("shell.mainNav")}>
            <NavMenu nav={nav} activeId={activeId} renderLink={renderLink} />
          </nav>
        </SidebarContent>
        {footer ? <SidebarFooter>{footer}</SidebarFooter> : null}
        <SidebarRail />
      </Sidebar>
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Смуга й топбар липнуть разом: «Увійти як…» видно на будь-якій прокрутці. */}
        <div className="sticky top-0 z-20">
          {banner}
          <Topbar
            breadcrumbs={breadcrumbs}
            actions={actions}
            renderLink={renderLink}
          />
        </div>
        <main
          id={MAIN_ID}
          tabIndex={-1}
          className="@container flex-1 px-4 py-6 pb-24 outline-none md:px-6 md:pb-6"
        >
          {children}
        </main>
      </div>
      <BottomNav nav={nav} activeId={activeId} renderLink={renderLink} />
    </SidebarProvider>
  )
}
