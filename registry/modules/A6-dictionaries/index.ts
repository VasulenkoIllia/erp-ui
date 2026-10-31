/**
 * Модуль A6 «Довідники» (SPEC §14, §17; ADR-0020, ADR-0025, ADR-0047) — точка входу.
 *
 *   const dictionariesModule = createDictionariesModule({ basePath: "/settings", extension })
 *   <Routes>{dictionariesModule.routes.map(…)}</Routes>  // чи useRoutes(dictionariesModule.routes)
 *
 * Фабрика повертає маршрути React Router зі сторінками модуля (лінивими чанками, `Suspense` і межа
 * помилок — у застосунку): податки, одиниці, умови оплати, теги, причини й типові значення; пункти
 * навігації з правом, яке їм потрібне, ресурси для прав і моків, `preload` за адресою. Без розширення
 * модуль такий, як у демо кіта. Файли модуля в проекті не правляться: зміни під клієнта — у файлі
 * розширення (`src/extensions/A6-dictionaries.ts`). Моки — окремо, `./mocks`
 * (`createDictionariesMocks`), щоб MSW не потрапив у застосунок.
 */
import {
  CalendarClockIcon,
  MessageSquareWarningIcon,
  PercentIcon,
  RulerIcon,
  SlidersHorizontalIcon,
  TagIcon,
  type LucideIcon,
} from "lucide-react"
import { createElement, type ComponentType } from "react"
import { Navigate, type RouteObject } from "react-router"

import type { LocalizedText } from "@/lib/auth"
import { lazyWithPreload, type PreloadableComponent } from "@/lib/lazy"

import type { DictionariesExtension } from "./extension"
import {
  DictionariesModuleContext,
  dictionariesPaths,
  type DictionariesModuleContextValue,
  type DictionariesPaths,
} from "./module-context"
import {
  DICTIONARY_DEFAULTS,
  DICTIONARY_RESOURCES,
  PAYMENT_TERMS,
  REASONS,
  TAGS,
  TAXES,
  UNITS,
  type DictionaryResource,
} from "./resources"

export type {
  DefaultsExtension,
  DictionariesExtension,
  DictionariesMessages,
  DictionariesMockExtension,
  DictionaryExtension,
  DictionaryFilterId,
  PaymentTermColumnId,
  PaymentTermFormFieldId,
  PaymentTermsExtension,
  ReasonColumnId,
  ReasonFilterId,
  ReasonFormFieldId,
  ReasonKindId,
  ReasonsExtension,
  TagColumnId,
  TagFormFieldId,
  TagsExtension,
  TaxColumnId,
  TaxesExtension,
  TaxFormFieldId,
  UnitColumnId,
  UnitFormFieldId,
  UnitsExtension,
} from "./extension"
export type { DictionariesPaths } from "./module-context"
export type { DictionaryResource } from "./resources"
// Типи для файлу розширення й компонентів слотів проекту: не з внутрішніх файлів модуля.
export type {
  DictionaryDefaults,
  PaymentPart,
  PaymentTerm,
  Reason,
  Tag,
  Tax,
  Unit,
} from "./contract"
export type { ExtensionField } from "@/lib/extension-fields"

export const DICTIONARIES_MODULE_ID = "A6"

export interface DictionaryNavItem {
  readonly id: string
  /** Підпис мовою інтерфейсу — `localizedText(label, language)` з `@/lib/auth`. */
  readonly label: LocalizedText
  readonly href: string
  readonly icon: LucideIcon
  /**
   * Право, без якого пункт ховають (`<ресурс>:<дія>`, як `useCanAccess`): сторінка однаково покаже
   * «Немає доступу».
   */
  readonly access: { readonly resource: string; readonly action: string }
}

export interface DictionariesModule {
  readonly id: typeof DICTIONARIES_MODULE_ID
  readonly paths: DictionariesPaths
  readonly routes: RouteObject[]
  readonly nav: readonly DictionaryNavItem[]
  /** Ресурси модуля: права (`<ресурс>:<дія>`), журнал аудиту, токени API, сценарії моків. */
  readonly resources: readonly DictionaryResource[]
  /** Завантажити чанк сторінки модуля за адресою заздалегідь (наведення, фокус на посиланні). */
  readonly preload: (pathname: string) => void
}

export interface DictionariesModuleOptions {
  /** Початок адрес модуля: `""` — `/taxes`; `"/settings"` — `/settings/taxes`. */
  readonly basePath?: string
  /** Розширення проекту (ADR-0020). */
  readonly extension?: DictionariesExtension
}

const PAGES = {
  taxes: lazyWithPreload(() =>
    import("./pages/taxes-page").then((m) => m.TaxesPage),
  ),
  units: lazyWithPreload(() =>
    import("./pages/units-page").then((m) => m.UnitsPage),
  ),
  paymentTerms: lazyWithPreload(() =>
    import("./pages/payment-terms-page").then((m) => m.PaymentTermsPage),
  ),
  tags: lazyWithPreload(() =>
    import("./pages/tags-page").then((m) => m.TagsPage),
  ),
  reasons: lazyWithPreload(() =>
    import("./pages/reasons-page").then((m) => m.ReasonsPage),
  ),
  defaults: lazyWithPreload(() =>
    import("./pages/defaults-page").then((m) => m.DefaultsPage),
  ),
} satisfies Record<keyof DictionariesPaths, PreloadableComponent<object>>

const NO_EXTENSION: DictionariesExtension = {}

const PAGE_KEYS = Object.keys(PAGES) as (keyof DictionariesPaths)[]

/** Довідники, з яких беруться типові значення: без жодного з них сторінка була б порожньою. */
const DEFAULT_SOURCES = ["taxes", "units", "paymentTerms"] as const

/** Пункти навігації за сторінкою: порядок — порядок `PAGE_KEYS`. */
const NAV: Readonly<
  Record<
    keyof DictionariesPaths,
    Pick<DictionaryNavItem, "label" | "icon"> & { readonly resource: string }
  >
> = {
  taxes: {
    label: { uk: "Податки", en: "Taxes" },
    icon: PercentIcon,
    resource: TAXES,
  },
  units: {
    label: { uk: "Одиниці виміру", en: "Units" },
    icon: RulerIcon,
    resource: UNITS,
  },
  paymentTerms: {
    label: { uk: "Умови оплати", en: "Payment terms" },
    icon: CalendarClockIcon,
    resource: PAYMENT_TERMS,
  },
  tags: {
    label: { uk: "Теги", en: "Tags" },
    icon: TagIcon,
    resource: TAGS,
  },
  reasons: {
    label: { uk: "Причини", en: "Reasons" },
    icon: MessageSquareWarningIcon,
    resource: REASONS,
  },
  defaults: {
    label: { uk: "Типові значення", en: "Default values" },
    icon: SlidersHorizontalIcon,
    resource: DICTIONARY_DEFAULTS,
  },
}

export function createDictionariesModule({
  basePath = "",
  extension = NO_EXTENSION,
}: DictionariesModuleOptions = {}): DictionariesModule {
  const paths = dictionariesPaths(basePath)
  const context: DictionariesModuleContextValue = { extension, paths }
  const page = (Page: ComponentType) =>
    createElement(
      DictionariesModuleContext.Provider,
      { value: context },
      createElement(Page),
    )
  // Сторінка, яка компанії не потрібна (`page: false`): без маршруту й пункту.
  const hasDefaults = DEFAULT_SOURCES.some(
    (key) => extension[key]?.page !== false,
  )
  const shown = PAGE_KEYS.filter(
    (key) =>
      extension[key]?.page !== false && (key !== "defaults" || hasDefaults),
  )
  const routes: RouteObject[] = shown.map((key) => ({
    path: paths[key],
    element: page(PAGES[key]),
  }))
  // Адреса самого модуля (`/settings`) — перша сторінка.
  const first = shown[0]
  if (first && basePath.replace(/\/+$/, ""))
    routes.push({
      path: basePath,
      element: createElement(Navigate, { to: paths[first], replace: true }),
    })
  const nav = shown.map((key): DictionaryNavItem => {
    const { label, icon, resource } = NAV[key]
    return {
      id: `A6-${key}`,
      label,
      href: paths[key],
      icon,
      access: { resource, action: "read" },
    }
  })
  const preload = (pathname: string) => {
    const path = pathname.split(/[?#]/)[0] ?? ""
    const key = shown.find((candidate) => paths[candidate] === path)
    if (key) void PAGES[key].preload()
  }
  return {
    id: DICTIONARIES_MODULE_ID,
    paths,
    routes,
    nav,
    resources: DICTIONARY_RESOURCES,
    preload,
  }
}
