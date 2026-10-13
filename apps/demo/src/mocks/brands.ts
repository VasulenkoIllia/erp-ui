import type { Branding } from "@/registry/lib/auth"

/**
 * Бренди демо (white-label): справжній сервер обирає бренд за доменом, демо — перемикачем
 * на сторінці входу (localStorage). Назви, тексти й логотипи — дані клієнта, не рядки інтерфейсу.
 */
export const DEMO_BRANDS = {
  none: null,
  "buh-plus": {
    name: "Бухгалтерія Плюс",
    logoUrl: "brands/buh-plus.svg",
    logoDarkUrl: "brands/buh-plus-dark.svg",
    palette: "teal",
    panel: {
      title: {
        uk: "Облік без паніки",
        en: "Accounting without panic",
      },
      text: {
        uk: "Звітність, зарплата й первинка для ФОП і ТОВ — в одному кабінеті.",
        en: "Reports, payroll and paperwork for sole traders and companies — in one place.",
      },
    },
    supportEmail: "help@buh-plus.example",
    termsUrl: "https://buh-plus.example/terms",
    privacyUrl: "https://buh-plus.example/privacy",
  },
  zoriana: {
    name: "Зоряна логістика",
    palette: "terracotta",
    panel: {
      title: {
        uk: "Вантажі вчасно, документи — одразу",
        en: "Freight on time, paperwork at once",
      },
    },
    supportEmail: "it@zoriana.example",
  },
} satisfies Record<string, Branding | null>

export type DemoBrand = keyof typeof DEMO_BRANDS
export const DEMO_BRAND_IDS = Object.keys(DEMO_BRANDS) as DemoBrand[]

const BRAND_KEY = "erp-ui:demo-brand"

export function getDemoBrand(): DemoBrand {
  try {
    const value = localStorage.getItem(BRAND_KEY)
    return value && value in DEMO_BRANDS ? (value as DemoBrand) : "none"
  } catch {
    return "none"
  }
}

export function setDemoBrand(brand: DemoBrand): void {
  try {
    if (brand === "none") localStorage.removeItem(BRAND_KEY)
    else localStorage.setItem(BRAND_KEY, brand)
  } catch {
    // Без сховища бренд не перемикається.
  }
}

export const currentBranding = (): Branding | undefined =>
  DEMO_BRANDS[getDemoBrand()] ?? undefined
