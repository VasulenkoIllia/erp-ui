/**
 * Вподобання вигляду (SPEC §6.2, §11): палітра, тема, щільність, сайдбар і мова інтерфейсу.
 *
 * - Вигляд застосовується атрибутами на <html>; мову застосовує i18next (`syncLanguage`).
 * - Сховище — модуль із підпискою (`useAppearance` у hooks/use-appearance). localStorage — лише кеш:
 *   на сервері вподобання зберігатиме контракт PF11 (крок 0.5).
 * - Щоб тема не блимала до завантаження JS, index.html проекту містить inline-скрипт
 *   із тією самою логікою (зразок — docs/using-erp-ui.md).
 */
import type { i18n } from "i18next"

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

export const APPEARANCE_STORAGE_KEY = "erp-ui:appearance"

const DARK_QUERY = "(prefers-color-scheme: dark)"

function pick<T extends string>(
  allowed: readonly T[],
  value: unknown,
  fallback: T,
): T {
  return allowed.includes(value as T) ? (value as T) : fallback
}

/** Будь-яке значення (зі сховища, з сервера) → коректний вигляд; невідомі поля — типові. */
export function parseAppearance(
  value: unknown,
  defaults: Appearance = DEFAULT_APPEARANCE,
): Appearance {
  const v =
    typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : {}
  return {
    palette: pick(PALETTES, v.palette, defaults.palette),
    theme: pick(THEME_MODES, v.theme, defaults.theme),
    density: pick(DENSITIES, v.density, defaults.density),
    sidebar: pick(SIDEBARS, v.sidebar, defaults.sidebar),
    language: pick(LANGUAGES, v.language, defaults.language),
  }
}

export function readStoredAppearance(
  defaults: Appearance = DEFAULT_APPEARANCE,
): Appearance {
  try {
    const raw = localStorage.getItem(APPEARANCE_STORAGE_KEY)
    return parseAppearance(raw ? JSON.parse(raw) : null, defaults)
  } catch {
    return defaults
  }
}

export function storeAppearance(appearance: Appearance): void {
  try {
    localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(appearance))
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

let current: Appearance = DEFAULT_APPEARANCE
const listeners = new Set<() => void>()

function prefersDark(): boolean {
  return window.matchMedia(DARK_QUERY).matches
}

function apply(): void {
  applyAppearance(document.documentElement, current, prefersDark())
}

export function getAppearance(): Appearance {
  return current
}

export function setAppearance(patch: Partial<Appearance>): void {
  current = { ...current, ...patch }
  storeAppearance(current)
  apply()
  listeners.forEach((listener) => {
    listener()
  })
}

export function subscribeAppearance(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Читає збережений вигляд, застосовує його й стежить за системною темою. Викликати в main.tsx
 * до рендеру; `defaults` — типові значення компанії (палітра, щільність). Повертає функцію відписки.
 */
export function initAppearance(
  defaults: Appearance = DEFAULT_APPEARANCE,
): () => void {
  current = readStoredAppearance(defaults)
  apply()
  const media = window.matchMedia(DARK_QUERY)
  const onChange = () => {
    if (current.theme === "system") apply()
  }
  media.addEventListener("change", onChange)
  return () => {
    media.removeEventListener("change", onChange)
  }
}

/** Мова з вподобань → i18next: зміна в меню користувача одразу перемикає інтерфейс. */
export function syncLanguage(instance: i18n): () => void {
  const update = () => {
    if (instance.language !== current.language)
      void instance.changeLanguage(current.language)
  }
  update()
  return subscribeAppearance(update)
}
