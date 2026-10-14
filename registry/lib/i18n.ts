/**
 * Мови інтерфейсу erp-ui (SPEC §11): i18next + react-i18next, українська — основна, англійська — друга.
 *
 * - `createI18n()` створює екземпляр i18next із рядками кіта (простір імен `erp-ui`) і рядками проекту;
 *   викликається один раз у main.tsx до рендеру.
 * - Мова за замовчуванням — завжди українська; мову браузера не враховуємо (рішення власника 13.10.2026).
 * - У пам'яті лише потрібна мова (ADR-0009, бюджет першого екрана): українські рядки — у бандлі,
 *   інші довантажуються окремим чанком. `changeLanguage` чекає на них; перед першим рендером —
 *   `await whenI18nReady(i18n)`.
 * - Англійська показує британські формати (en-GB): день перед місяцем, 24-годинний час.
 * - Рядки не довантажились (офлайн) — i18next повторює двічі, далі показує запасну українську;
 *   наступний `changeLanguage` пробує знову. `<html lang>` — мова, якою інтерфейс справді показано.
 */
import i18next, { type BackendModule, type i18n } from "i18next"
import { useMemo } from "react"
import { initReactI18next, useTranslation } from "react-i18next"

import { uk, type ErpUiMessages } from "@/registry/lib/i18n-uk"

export const LANGUAGES = ["uk", "en"] as const
export type Language = (typeof LANGUAGES)[number]
export const DEFAULT_LANGUAGE = "uk" satisfies Language

/** Мова інтерфейсу → локаль Intl для чисел, сум і дат. */
export const LOCALES: Record<Language, string> = { uk: "uk-UA", en: "en-GB" }

export const ERP_UI_NAMESPACE = "erp-ui"

export function isLanguage(value: unknown): value is Language {
  return LANGUAGES.includes(value as Language)
}

/** Мова з рядка i18next ("uk", "en-GB" тощо) → підтримувана мова інтерфейсу. */
export function toLanguage(value: string | undefined): Language {
  const base = value?.split("-")[0]
  return isLanguage(base) ? base : DEFAULT_LANGUAGE
}

/** Рядки проекту однією мовою: простір імен → дерево рядків. */
export type LanguageResources = Record<string, object>

/**
 * Рядки проекту за мовами: об'єкт або функція, що їх завантажить окремим чанком (динамічний
 * імпорт JSON, зразок — docs/using-erp-ui.md erp-ui). Українські — лише об'єктом: це мова за
 * замовчуванням і запасна, вона має бути в пам'яті до першого рендеру.
 */
export type AppResources = { [DEFAULT_LANGUAGE]?: LanguageResources } & {
  [L in Exclude<Language, typeof DEFAULT_LANGUAGE>]?:
    LanguageResources | (() => Promise<LanguageResources>)
}

export interface CreateI18nOptions {
  /** Початкова мова, наприклад збережена у вподобаннях користувача. */
  language?: Language
  /** Рядки проекту й модулів. */
  resources?: AppResources
  /** Простір імен за замовчуванням для `t()` проекту. */
  defaultNamespace?: string
}

/** Рядки кіта, крім українських, — окремими чанками. */
const KIT_LOADERS: Partial<Record<Language, () => Promise<object>>> = {
  en: () => import("./i18n-en").then((m) => m.en),
}

/** Повтори довантаження мови: через 0,3 с і 0,6 с — старт не чекає довше секунди. */
const LOAD_RETRIES = 2
const LOAD_RETRY_MS = 300

async function withRetries<T>(load: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await load()
    } catch (error) {
      if (attempt >= LOAD_RETRIES) throw error
      await new Promise((resolve) =>
        setTimeout(resolve, LOAD_RETRY_MS * 2 ** attempt),
      )
    }
  }
}

/**
 * Бекенд i18next без мережі: довантажує рядки кіта й проекту для мови, якої ще немає в пам'яті.
 * Мова приходить цілою — рядки кіта й проекту разом, одним завантаженням для всіх просторів імен
 * (повтори теж тут, а не в i18next, де вони йдуть окремо для кожного простору й розходяться): якщо
 * не прийшла хоч частина, не приходить жодна, і інтерфейс чесно лишається запасною українською
 * (`resolvedLanguage`, `<html lang>`). Відмову повертаємо з `retry = true`: тоді i18next її не
 * запам'ятовує, і наступний `changeLanguage` завантажить ще раз.
 */
function lazyLanguages(resources: AppResources): BackendModule {
  const pending = new Map<
    Language,
    Promise<{ kit: object; project: LanguageResources }>
  >()
  const languageBundle = (lng: Language) => {
    let bundle = pending.get(lng)
    if (!bundle) {
      const source = resources[lng]
      bundle = withRetries(() =>
        Promise.all([
          KIT_LOADERS[lng]?.() ?? {},
          // Через then: синхронний виняток функції проекту теж стане відмовою, а не зламає i18next.
          typeof source === "function"
            ? Promise.resolve().then(source)
            : (source ?? {}),
        ]),
      ).then(([kit, project]) => ({ kit, project }))
      pending.set(lng, bundle)
      bundle.catch(() => pending.delete(lng))
    }
    return bundle
  }
  return {
    type: "backend",
    init: () => undefined,
    read: (language, namespace, callback) => {
      languageBundle(toLanguage(language)).then(
        ({ kit, project }) => {
          callback(
            null,
            namespace === ERP_UI_NAMESPACE ? kit : (project[namespace] ?? {}),
          )
        },
        (error: unknown) => {
          callback(error instanceof Error ? error : String(error), true)
        },
      )
    },
  }
}

/** Перемикання на початкову мову, якщо вона не українська: його чекає `whenI18nReady`. */
const initialLanguage = new WeakMap<i18n, Promise<unknown>>()

export function createI18n({
  language = DEFAULT_LANGUAGE,
  resources = {},
  defaultNamespace = ERP_UI_NAMESPACE,
}: CreateI18nOptions = {}): i18n {
  const inline = (lng: Language): LanguageResources => {
    const project = resources[lng]
    return typeof project === "function" ? {} : (project ?? {})
  }
  const bundled = Object.fromEntries(
    LANGUAGES.map((lng) => [
      lng,
      lng === DEFAULT_LANGUAGE
        ? { [ERP_UI_NAMESPACE]: uk, ...inline(lng) }
        : inline(lng),
    ]),
  )
  const namespaces = [
    ...new Set([
      ERP_UI_NAMESPACE,
      defaultNamespace,
      ...LANGUAGES.flatMap((lng) => Object.keys(inline(lng))),
    ]),
  ]

  const instance = i18next.createInstance()
  // Мова, якою інтерфейс справді показано: якщо рядки не довантажились — запасна (WCAG 3.1.1).
  instance.on("languageChanged", (lng) => {
    if (typeof document !== "undefined")
      document.documentElement.lang = toLanguage(
        instance.resolvedLanguage ?? lng,
      )
  })
  // Старт завжди українською (вона в бандлі, ініціалізація синхронна), а потім — на мову
  // користувача: доки її рядки в дорозі, `useTranslation` не призупиняє рендер, і навіть зависла
  // мережа не лишає застосунок без тексту.
  void instance
    .use(lazyLanguages(resources))
    .use(initReactI18next)
    .init({
      lng: DEFAULT_LANGUAGE,
      fallbackLng: DEFAULT_LANGUAGE,
      supportedLngs: [...LANGUAGES],
      resources: bundled,
      // Чого немає в `resources`, довантажує lazyLanguages.
      partialBundledLanguages: true,
      // Повтори — у lazyLanguages, спільні для всієї мови.
      maxRetries: 0,
      ns: namespaces,
      defaultNS: defaultNamespace,
      initAsync: false,
      // React сам екранує текст.
      interpolation: { escapeValue: false },
    })
  if (language !== DEFAULT_LANGUAGE)
    initialLanguage.set(instance, instance.changeLanguage(language))
  return instance
}

/** Скільки найдовше чекати рядки мови перед першим кадром. */
const READY_TIMEOUT_MS = 5000

/**
 * Коли рядки початкової мови в пам'яті: для української — одразу, для іншої — після довантаження.
 * У main.tsx перед рендером, щоб перший кадр не блимнув українською. Не довантажились — перший
 * кадр запасною українською; мережа зависла — рендер не пізніше `timeoutMs`, теж українською, а
 * мова перемкнеться, щойно рядки прийдуть.
 */
export function whenI18nReady(
  instance: i18n,
  timeoutMs = READY_TIMEOUT_MS,
): Promise<void> {
  const initialized = instance.isInitialized
    ? Promise.resolve()
    : new Promise<void>((resolve) => {
        instance.once("initialized", () => {
          resolve()
        })
      })
  const ready = Promise.all([initialized, initialLanguage.get(instance)]).then(
    () => undefined,
  )
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, timeoutMs)
  })
  return Promise.race([ready, timeout]).finally(() => {
    clearTimeout(timer)
  })
}

/** Поточна мова інтерфейсу й локаль Intl для неї. Перемальовує компонент при зміні мови. */
export function useLanguage(): { language: Language; locale: string } {
  const { i18n } = useTranslation()
  const language = toLanguage(i18n.resolvedLanguage ?? i18n.language)
  return { language, locale: LOCALES[language] }
}

type Leaves<T, Prefix extends string = ""> = {
  [K in keyof T & string]: T[K] extends string
    ? `${Prefix}${K}`
    : Leaves<T[K], `${Prefix}${K}.`>
}[keyof T & string]
type PluralSuffix = "zero" | "one" | "two" | "few" | "many" | "other"
type WithoutPlural<K> = K extends `${infer Base}_${PluralSuffix}` ? Base : K

/** Ключ рядка кіта, напр. "common.close" або "validation.iban.checksum". */
export type ErpUiKey = WithoutPlural<Leaves<ErpUiMessages>>
export type ErpUiTranslate = (
  key: ErpUiKey,
  options?: Record<string, unknown>,
) => string

/** Переклад рядків кіта — для компонентів реєстру. */
export function useErpUiT(): ErpUiTranslate {
  const { i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? i18n.language
  return useMemo(() => {
    // Власні типи ключів: не залежимо від CustomTypeOptions проекту, де простору erp-ui може не бути.
    const fixed = i18n.getFixedT(language, ERP_UI_NAMESPACE as never)
    // Без проектних типів приведення зайве (так бачить лінтер), з ними — потрібне.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- див. коментар вище
    return fixed as unknown as ErpUiTranslate
  }, [i18n, language])
}
