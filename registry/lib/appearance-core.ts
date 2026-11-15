/**
 * Значення вигляду без DOM, i18next і React (ADR-0093): палітри, теми, щільність і сайдбар. Їх бере схема
 * профілю компанії (`lib/company`), зокрема на сервері на TypeScript; `lib/appearance` реекспортує все звідси.
 */
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
