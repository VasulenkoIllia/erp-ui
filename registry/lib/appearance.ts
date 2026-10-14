/**
 * Вподобання вигляду (SPEC §6.2, §11): палітра, тема, щільність, сайдбар і мова інтерфейсу.
 *
 * - Вигляд застосовується атрибутами на <html>; мову застосовує i18next (`syncLanguage`).
 * - Сховище — модуль із підпискою (`useAppearance` у hooks/use-appearance). localStorage — лише кеш:
 *   на сервері вподобання зберігає контракт PF11 (lib/preferences).
 * - Зберігаємо лише те, що користувач обрав сам; решту беремо з типових значень — компанії
 *   (`initAppearance`) і бренду (`setBrandAppearance`, white-label, ADR-0011).
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

/** Лише коректні поля: те, що користувач обрав сам. */
export function pickAppearance(value: unknown): Partial<Appearance> {
  const v =
    typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : {}
  const full = parseAppearance(v)
  return Object.fromEntries(
    (Object.keys(full) as (keyof Appearance)[])
      .filter((key) => v[key] === full[key])
      .map((key) => [key, full[key]]),
  )
}

function readChosen(): Partial<Appearance> {
  try {
    const raw = localStorage.getItem(APPEARANCE_STORAGE_KEY)
    return pickAppearance(raw ? JSON.parse(raw) : null)
  } catch {
    return {}
  }
}

export function storeAppearance(appearance: Partial<Appearance>): void {
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
/** Типові значення компанії (`initAppearance`). */
let base: Appearance = DEFAULT_APPEARANCE
/** Типові значення бренду поверх компанії. */
let brand: Partial<Appearance> = {}
/** Обране користувачем — перекриває типові. */
let chosen: Partial<Appearance> = {}
const listeners = new Set<() => void>()

function notify(): void {
  listeners.forEach((listener) => {
    listener()
  })
}

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
  chosen = { ...chosen, ...patch }
  current = { ...base, ...brand, ...chosen }
  storeAppearance(chosen)
  apply()
  notify()
}

/**
 * Типові значення бренду (white-label): палітра з `GET /auth/methods` → `branding`. Діють там,
 * де користувач не обрав свого; `null` — бренду немає.
 */
export function setBrandAppearance(patch: Partial<Appearance> | null): void {
  brand = patch ?? {}
  const next = { ...base, ...brand, ...chosen }
  if (
    (Object.keys(next) as (keyof Appearance)[]).every(
      (k) => next[k] === current[k],
    )
  )
    return
  current = next
  apply()
  notify()
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
  base = defaults
  chosen = readChosen()
  current = { ...base, ...brand, ...chosen }
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

/**
 * Мова з вподобань → i18next: зміна в меню користувача одразу перемикає інтерфейс. Рядки мови
 * можуть довантажуватись (lib/i18n), тому звіряємо з останньою запитаною мовою, а не з поточною:
 * швидке «English → Українська» не лишить англійську, коли її рядки прийдуть пізніше.
 */
export function syncLanguage(instance: i18n): () => void {
  let requested = instance.language
  // Мову змінили повз вподобання (напр. ra-core changeLocale) — наступна зміна вподобань її виправить.
  const onChanged = (lng: string) => {
    requested = lng
  }
  instance.on("languageChanged", onChanged)
  const update = () => {
    if (requested === current.language) return
    requested = current.language
    void instance.changeLanguage(requested)
  }
  update()
  const unsubscribe = subscribeAppearance(update)
  return () => {
    unsubscribe()
    instance.off("languageChanged", onChanged)
  }
}
