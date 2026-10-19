"use client"

import * as React from "react"

import { useAppearance } from "@/registry/hooks/use-appearance"
import {
  DENSITIES,
  PALETTES,
  THEME_MODES,
  type Density,
  type Palette,
  type ThemeMode,
} from "@/registry/lib/appearance"
import { LANGUAGES, useErpUiT, type Language } from "@/registry/lib/i18n"
import { SHELL_ICONS } from "@/registry/lib/icons"
import { LANGUAGE_NAMES } from "@/registry/lib/language-names"
import { Avatar, AvatarFallback, AvatarImage } from "@/registry/ui/avatar"
import { Button } from "@/registry/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/registry/ui/dropdown-menu"

/**
 * Меню користувача в топбарі (SPEC §6.2, §7): профіль, вигляд і мова, вихід.
 * Тема, палітра, щільність, сайдбар і мова змінюються через lib/appearance — одразу для всього застосунку.
 * `children` — пункти проекту (профіль, налаштування) між вподобаннями й виходом.
 */

export interface MenuUser {
  name: string
  email?: string
  avatarUrl?: string
}

/** Ініціали для аватара: «Олена Коваль» → «ОК». */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase() ?? "")
    .join("")
}

export function UserMenu({
  user,
  onSignOut,
  children,
}: {
  user: MenuUser
  onSignOut?: () => void
  children?: React.ReactNode
}) {
  const t = useErpUiT()
  const [appearance, setAppearance] = useAppearance()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full"
            // Видимі ініціали — у назві кнопки: голосове керування знаходить її за тим, що видно
            // (WCAG 2.5.3, axe `label-content-name-mismatch`).
            aria-label={t("userMenu.label", {
              name: user.name,
              initials: initials(user.name),
            })}
          />
        }
      >
        <Avatar size="sm">
          {user.avatarUrl ? <AvatarImage src={user.avatarUrl} alt="" /> : null}
          <AvatarFallback>{initials(user.name)}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col gap-0.5 py-1.5">
            <span className="text-sm font-medium text-foreground">
              {user.name}
            </span>
            {user.email ? <span>{user.email}</span> : null}
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuLabel>{t("appearance.theme")}</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={appearance.theme}
            onValueChange={(theme: ThemeMode) => {
              setAppearance({ theme })
            }}
          >
            {THEME_MODES.map((theme) => (
              <DropdownMenuRadioItem key={theme} value={theme}>
                {t(`themes.${theme}`)}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <SHELL_ICONS.palette aria-hidden />
            {t("appearance.palette")}
            <span className="ml-auto text-muted-foreground">
              {t(`palettes.${appearance.palette}`)}
            </span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-44">
            <DropdownMenuRadioGroup
              value={appearance.palette}
              onValueChange={(palette: Palette) => {
                setAppearance({ palette })
              }}
            >
              {PALETTES.map((palette) => (
                <DropdownMenuRadioItem key={palette} value={palette}>
                  {t(`palettes.${palette}`)}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <SHELL_ICONS.density aria-hidden />
            {t("appearance.density")}
            <span className="ml-auto text-muted-foreground">
              {t(`densities.${appearance.density}`)}
            </span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-44">
            <DropdownMenuRadioGroup
              value={appearance.density}
              onValueChange={(density: Density) => {
                setAppearance({ density })
              }}
            >
              {DENSITIES.map((density) => (
                <DropdownMenuRadioItem key={density} value={density}>
                  {t(`densities.${density}`)}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <SHELL_ICONS.language aria-hidden />
            {t("appearance.language")}
            <span className="ml-auto text-muted-foreground">
              {LANGUAGE_NAMES[appearance.language]}
            </span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-44">
            <DropdownMenuRadioGroup
              value={appearance.language}
              onValueChange={(language: Language) => {
                setAppearance({ language })
              }}
            >
              {LANGUAGES.map((language) => (
                <DropdownMenuRadioItem
                  key={language}
                  value={language}
                  lang={language}
                >
                  {LANGUAGE_NAMES[language]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuCheckboxItem
          checked={appearance.sidebar === "dark"}
          onCheckedChange={(checked) => {
            setAppearance({ sidebar: checked ? "dark" : "light" })
          }}
        >
          <SHELL_ICONS.sidebar aria-hidden />
          {t("appearance.darkSidebar")}
        </DropdownMenuCheckboxItem>

        {children ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>{children}</DropdownMenuGroup>
          </>
        ) : null}

        {onSignOut ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onSignOut}>
              <SHELL_ICONS.signOut aria-hidden />
              {t("userMenu.signOut")}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
