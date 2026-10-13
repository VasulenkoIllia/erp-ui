/**
 * Тимчасові рядки демо (лише uk). На кроці 0.3 переїдуть в i18next (uk + en).
 */
import type {
  Density,
  Palette,
  Sidebar,
  ThemeMode,
} from "@/appearance/appearance"

const nbsp = " "

export const strings = {
  app: {
    eyebrow: "erp-ui · демо",
    title: "Теми й вигляд",
    lead: "Хвиля 0, крок 0.1: каркас і перемикачі палітри, теми, щільності та сайдбару.",
  },
  controls: {
    title: "Вигляд",
    palette: "Палітра",
    theme: "Тема",
    density: "Щільність",
    sidebar: "Сайдбар",
    sidebarHint: "У темній темі сайдбар завжди темний.",
  },
  palettes: {
    sapphire: "Сапфір",
    graphite: "Графіт",
    indigo: "Індиго",
    teal: "Бірюза",
    terracotta: "Теракота",
  } satisfies Record<Palette, string>,
  themes: {
    light: "Світла",
    dark: "Темна",
    system: "Як у системі",
  } satisfies Record<ThemeMode, string>,
  densities: {
    comfortable: "Звичайна",
    compact: "Компактна",
  } satisfies Record<Density, string>,
  sidebars: {
    light: "Світлий",
    dark: "Темний",
  } satisfies Record<Sidebar, string>,
  preview: {
    title: "Прев'ю токенів",
    nav: "Приклад навігації",
    navItems: ["Огляд", "Рахунки", "Контакти", "Склад", "Налаштування"],
    pageTitle: "Рахунки",
    create: "Створити рахунок",
    export: "Експорт",
    search: "Пошук",
    searchPlaceholder: "Номер, клієнт або сума",
    tableCaption: "Приклад списку рахунків",
    columns: {
      number: "Номер",
      client: "Клієнт",
      amount: "Сума",
      status: "Статус",
    },
    statuses: {
      success: "Оплачено",
      warning: "Частково",
      destructive: "Прострочено",
      info: "Очікує",
    },
    rows: [
      {
        number: "2026-0142",
        client: "ТОВ «Зоряна логістика»",
        amount: `48${nbsp}600,00${nbsp}₴`,
        status: "success",
      },
      {
        number: "2026-0141",
        client: "ФОП Коваленко О. В.",
        amount: `12${nbsp}350,50${nbsp}₴`,
        status: "warning",
      },
      {
        number: "2026-0139",
        client: "ПП «Агросвіт»",
        amount: `310${nbsp}000,00${nbsp}₴`,
        status: "destructive",
      },
      {
        number: "2026-0138",
        client: "ТОВ «Дніпро Трейд»",
        amount: `7${nbsp}980,00${nbsp}₴`,
        status: "info",
      },
    ],
    charts: "Кольори графіків",
    series: "Серія",
  },
} as const

export type StatusKind = keyof typeof strings.preview.statuses
