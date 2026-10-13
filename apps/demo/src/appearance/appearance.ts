/**
 * Вигляд інтерфейсу: палітра, тема, щільність, сайдбар (SPEC §6.2) і мова (SPEC §11).
 * Вигляд застосовується атрибутами на <html>, мова — через i18next (він же ставить <html lang>).
 * Логіку дзеркалить inline-скрипт в index.html.
 * localStorage — лише кеш; на сервері вподобання зберігатиме контракт PF11 (крок 0.5).
 */

import { DEFAULT_LANGUAGE, LANGUAGES, type Language } from "@/registry/lib/i18n"

export const PALETTES = [
  "sapphire",
  "graphite",
  "indigo",
  "teal",
  "terracotta",
] as const
export type Palette = (typeof PALETTES)[number]

export const THEME_MODES = ["light", "dark", "system"] as const
export type ThemeMode = (typeof THEME_MODES)[number]

export const DENSITIES = ["comfortable", "compact"] as const
export type Density = (typeof DENSITIES)[number]

export const SIDEBARS = ["light", "dark"] as const
export type Sidebar = (typeof SIDEBARS)[number]

export interface Appearance {
  palette: Palette
  theme: ThemeMode
  density: Density
  sidebar: Sidebar
  language: Language
}

export const DEFAULT_APPEARANCE: Appearance = {
  palette: "sapphire",
  theme: "system",
  density: "comfortable",
  sidebar: "light",
  language: DEFAULT_LANGUAGE,
}

export const STORAGE_KEY = "erp-ui:appearance"

function pick<T extends string>(
  allowed: readonly T[],
  value: unknown,
  fallback: T,
): T {
  return allowed.includes(value as T) ? (value as T) : fallback
}

export function parseAppearance(value: unknown): Appearance {
  const v =
    typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : {}
  return {
    palette: pick(PALETTES, v.palette, DEFAULT_APPEARANCE.palette),
    theme: pick(THEME_MODES, v.theme, DEFAULT_APPEARANCE.theme),
    density: pick(DENSITIES, v.density, DEFAULT_APPEARANCE.density),
    sidebar: pick(SIDEBARS, v.sidebar, DEFAULT_APPEARANCE.sidebar),
    language: pick(LANGUAGES, v.language, DEFAULT_APPEARANCE.language),
  }
}

export function readStoredAppearance(): Appearance {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return parseAppearance(raw ? JSON.parse(raw) : null)
  } catch {
    return DEFAULT_APPEARANCE
  }
}

export function storeAppearance(appearance: Appearance): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appearance))
  } catch {
    // Приватний режим або заблоковане сховище: вигляд працює, лише не запам'ятовується.
  }
}

export function isDark(theme: ThemeMode, prefersDark: boolean): boolean {
  return theme === "dark" || (theme === "system" && prefersDark)
}

export function applyAppearance(
  root: HTMLElement,
  appearance: Appearance,
  prefersDark: boolean,
): void {
  root.dataset.palette = appearance.palette
  root.classList.toggle("dark", isDark(appearance.theme, prefersDark))
  if (appearance.density === "compact") root.dataset.density = "compact"
  else delete root.dataset.density
  if (appearance.sidebar === "dark") root.dataset.sidebar = "dark"
  else delete root.dataset.sidebar
}
