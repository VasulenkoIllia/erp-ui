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
    nav: "Розділи демо",
    pages: { appearance: "Вигляд", primitives: "Примітиви" },
  },
  appearancePage: {
    title: "Теми й вигляд",
    lead: "Перемикачі палітри, теми, щільності та сайдбару на <html> (SPEC §6.2).",
  },
  primitivesPage: {
    title: "Примітиви",
    lead: "shadcn/ui на Base UI, стиль Nova, перебудований під токени erp-ui (ADR-0001, ADR-0006).",
    buttons: "Кнопки",
    variants: {
      default: "Основна",
      secondary: "Другорядна",
      outline: "Контурна",
      ghost: "Прозора",
      destructive: "Видалити 3 рахунки",
      link: "Посилання",
    },
    create: "Створити рахунок",
    saving: "Зберігаємо…",
    settings: "Налаштування",
    small: "Малий",
    large: "Великий",
    unavailable: "Недоступно",
    unavailableHint: "Доступно для ролі «Бухгалтер»",
    statuses: "Статуси й бейджі",
    badges: { new: "Новий", draft: "Чернетка", archived: "Архів" },
    tabs: {
      all: "Усі",
      draft: "Чернетки",
      sent: "Надіслані",
      paid: "Оплачені",
    },
    tabsLabel: "Статус рахунків",
    fields: "Поля: стани (SPEC §8.3)",
    field: {
      normal: {
        label: "Назва компанії",
        value: "ТОВ «Зоряна логістика»",
        hint: "Звичайний стан",
      },
      focus: { label: "Контактна особа", value: "Олена Коваль", hint: "Фокус" },
      error: {
        label: "ЄДРПОУ",
        value: "1234567",
        hint: "ЄДРПОУ має містити 8 цифр",
      },
      async: {
        label: "ЄДРПОУ контрагента",
        value: "32855961",
        hint: "Перевіряємо в ЄДР…",
      },
      dirty: {
        label: "IBAN",
        value: "UA21 3223 1300 0002 6007 2335 6600 1",
        mark: "змінено",
        hint: "Не збережено",
      },
      saved: {
        label: "Примітка",
        value: "Оплата частинами",
        hint: "Автозбережено о 10:42",
      },
      readOnly: {
        label: "Ставка ПДВ",
        value: "20 %",
        hint: "Лише читання: доступно для ролі «Бухгалтер»",
      },
      locked: {
        label: "Сума договору",
        value: `120${nbsp}000,00`,
        hint: "Редагує Олена Коваль",
      },
      disabled: {
        label: "Номер документа",
        value: "Призначається автоматично",
        hint: "Вимкнено",
      },
    },
    choice: "Вибір",
    currency: "Валюта",
    currencies: [
      { value: "UAH", label: "Гривня, ₴" },
      { value: "EUR", label: "Євро, €" },
      { value: "USD", label: "Долар США, $" },
    ],
    vatPayer: "Платник ПДВ",
    remind: "Нагадувати про оплату",
    note: "Коментар до рахунку",
    notePlaceholder: "Умови оплати, домовленості…",
    overlays: "Діалоги, шторки, підказки, тости",
    dialog: {
      open: "Видалити рахунок…",
      title: "Видалити рахунок № 2026-0142?",
      description:
        "Рахунок і його рядки буде видалено. Оплати лишаться в журналі банку.",
      cancel: "Скасувати",
      confirm: "Видалити рахунок",
    },
    sheet: {
      open: "Фільтри",
      title: "Фільтри",
      description: "Звузьте список рахунків.",
      client: "Клієнт",
      apply: "Застосувати",
    },
    tooltip: "Експорт у CSV",
    exportLabel: "Експортувати",
    toast: {
      open: "Зберегти",
      saved: "Рахунок збережено",
      undoOpen: "Архівувати",
      archived: "Рахунок перенесено в архів",
      undo: "Скасувати",
    },
    table: "Таблиця",
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
