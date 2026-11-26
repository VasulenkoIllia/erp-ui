/**
 * Мови інтерфейсу erp-ui (SPEC §11): i18next + react-i18next, українська — основна, англійська — друга.
 *
 * - `createI18n()` створює екземпляр i18next із рядками кіта (простір імен `erp-ui`) і рядками проекту;
 *   викликається один раз у main.tsx до рендеру.
 * - Мова за замовчуванням — завжди українська; мову браузера не враховуємо (рішення власника 13.10.2026).
 * - У пам'яті лише потрібна мова (ADR-0009, бюджет першого екрана): українські рядки — у бандлі,
 *   інші довантажуються окремим чанком. `changeLanguage` чекає на них; перед першим рендером —
 *   `await whenI18nReady(i18n)`.
 * - На старті з українських рядків кіта лише база (`lib/i18n-uk-base`): рядки функції приходять із її
 *   чанком, бо компонент передає свою частину в `useErpUiT(частина)` (ADR-0094). Так само проект може
 *   ділити свої рядки: `useStrings(простір, частина)`. Інші мови вантажаться цілими.
 * - Англійська показує британські формати (en-GB): день перед місяцем, 24-годинний час.
 * - Рядки не довантажились (офлайн) — i18next повторює двічі, далі показує запасну українську;
 *   наступний `changeLanguage` пробує знову. `<html lang>` — мова, якою інтерфейс справді показано.
 * - Рядки модуля (ADR-0025) — свій простір імен, що приходить разом зі сторінками модуля, а не на
 *   старті: `lib/i18n-namespaces`.
 */
import i18next, { type BackendModule, type i18n } from "i18next"
import { useMemo } from "react"
import { initReactI18next, useTranslation } from "react-i18next"

import {
  DEFAULT_LANGUAGE,
  isLanguage,
  LANGUAGES,
  LOCALES,
  toLanguage,
  type Language,
} from "@/registry/lib/i18n-core"
import type { ErpUiMessages } from "@/registry/lib/i18n-uk"
import { ukBase } from "@/registry/lib/i18n-uk-base"

// Мови без i18next — у `lib/i18n-core` (ADR-0093); проект бере їх і звідси, як раніше.
export {
  DEFAULT_LANGUAGE,
  isLanguage,
  LANGUAGES,
  LOCALES,
  toLanguage,
  type Language,
}

export const ERP_UI_NAMESPACE = "erp-ui"

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

/** Завантаження з повторами — і для мов, і для просторів імен модулів (`lib/i18n-namespaces`). */
export async function withRetries<T>(load: () => Promise<T>): Promise<T> {
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

/**
 * Режим розробки збирача: Vite підставляє `import.meta.env.DEV`, і в продакшн-збірці гілка випадає разом із тим, що
 * вона вантажить. Без Vite (`import.meta.env` немає) — не розробка. Тип свій, а не `ImportMeta`: у проекті з типами
 * Vite і без них умова та сама.
 */
const isDevBuild =
  (import.meta as unknown as { readonly env?: { readonly DEV?: unknown } }).env
    ?.DEV === true

/**
 * Розробка (ADR-0094): попередження про рядок простору `erp-ui`, якого немає в пам'яті. Найчастіше це рядок функції
 * кіта, чию частину код проекту не передав у `useErpUiT`: сторінка, відкрита першою, показує ключ, а типи й збірка
 * мовчать. Повне дерево (`lib/i18n-uk`) вантажимо лише тут, щоб назвати частину. Виклик із `defaultValue`
 * (чи `defaultValue_one`…) — свідомий запасний текст. Один раз на ключ для кожного екземпляра.
 */
function kitStringWarner() {
  const warned = new Set<string>()
  return (
    _languages: readonly string[],
    namespace: string,
    key: string,
    _fallback: string,
    _update: boolean,
    options?: Readonly<Record<string, unknown>>,
  ): void => {
    const hasDefault = Object.keys(options ?? {}).some(
      (option) =>
        option === "defaultValue" || option.startsWith("defaultValue_"),
    )
    if (namespace !== ERP_UI_NAMESPACE || hasDefault || warned.has(key)) return
    warned.add(key)
    const missing = `erp-ui: рядка «${key}» немає в пам'яті`
    import("./i18n-uk")
      .then(({ kitStringPart }) => {
        const part = kitStringPart(key)
        console.warn(
          part
            ? `${missing}. Компонент, що його бере, має підключити частину: useErpUiT(${part.name}) з ${part.file} (ADR-0094).`
            : `${missing}, і в рядках кіта такого ключа немає: перевірте ключ.`,
        )
      })
      .catch(() => {
        console.warn(`${missing} (ADR-0094).`)
      })
  }
}

export function createI18n({
  language = DEFAULT_LANGUAGE,
  resources = {},
  defaultNamespace = ERP_UI_NAMESPACE,
}: CreateI18nOptions = {}): i18n {
  const inline = (lng: Language): LanguageResources => {
    const project = resources[lng]
    return typeof project === "function" ? {} : (project ?? {})
  }
  // Копія: i18next доливає частини (`addStrings`) у ті самі об'єкти, а база й рядки проекту мають
  // лишатись незмінними для наступного екземпляра (тести, кілька застосунків на сторінці).
  const bundled = structuredClone(
    Object.fromEntries(
      LANGUAGES.map((lng) => [
        lng,
        lng === DEFAULT_LANGUAGE
          ? { [ERP_UI_NAMESPACE]: ukBase, ...inline(lng) }
          : inline(lng),
      ]),
    ),
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
      ...(isDevBuild && {
        saveMissing: true,
        saveMissingPlurals: false,
        missingKeyHandler: kitStringWarner(),
      }),
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

/** Ключ рядка з дерева `M` без суфіксів множини: "list.count" для "list.count_one" тощо. */
export type MessageKey<M> = WithoutPlural<Leaves<M>>

/** Ключ рядка кіта, напр. "common.close" або "validation.iban.checksum". */
export type ErpUiKey = MessageKey<ErpUiMessages>
export type ErpUiTranslate = (
  key: ErpUiKey,
  options?: Record<string, unknown>,
) => string

/**
 * Частина рядків кіта (`lib/i18n-uk-*`, ADR-0094): розділи дерева `ErpUiMessages`, розділ може бути
 * неповним (`auth` ділиться між базою й частинами). Розділ демо чи проекту сюди не пройде.
 */
export type ErpUiStrings = {
  readonly [Section in keyof ErpUiMessages]?: Partial<ErpUiMessages[Section]>
}

/**
 * Частини рядків, які вже додано в простір імен. Ключ — сховище рядків екземпляра: `useTranslation()`
 * дає кожному компоненту свою обгортку над екземпляром, а сховище в них спільне.
 */
const addedParts = new WeakMap<object, Map<string, WeakSet<object>>>()

/**
 * Додає частини рядків мовою за замовчуванням у простір імен (ADR-0094): рядки функції, що приходять
 * разом із її чанком, а не на старті. Ключі ті самі, що й без поділу: частина доливається глибоко й не
 * перезаписує наявних рядків. Інші мови вантажаться цілими, тож частина — лише українська. Та сама
 * частина вдруге нічого не робить; виклик дешевий, його можна робити на кожен рендер.
 */
export function addStrings(
  instance: i18n,
  namespace: string,
  ...parts: readonly object[]
): void {
  if (parts.length === 0) return
  let byNamespace = addedParts.get(instance.store)
  if (!byNamespace) {
    byNamespace = new Map()
    addedParts.set(instance.store, byNamespace)
  }
  let added = byNamespace.get(namespace)
  if (!added) {
    added = new WeakSet()
    byNamespace.set(namespace, added)
  }
  for (const part of parts) {
    if (added.has(part)) continue
    // Без події `added`: виклик іде під час рендера, а підписник на неї (`bindI18nStore: "added"`)
    // оновлював би інші компоненти посеред нього. Свої рядки компонент бере після цього виклику.
    instance.addResourceBundle(DEFAULT_LANGUAGE, namespace, part, true, false, {
      silent: true,
    })
    added.add(part)
  }
}

/**
 * Рядки сторінки чи функції проекту, що приходять разом із її чанком (ADR-0094): виклик — у компоненті
 * до першого `t()`, частина — JSON сторінки (`src/i18n/uk/orders.json`) з тими самими ключами простору
 * імен, що й без поділу: `useStrings("app", ukOrders)`.
 */
export function useStrings(
  namespace: string,
  ...parts: readonly object[]
): void {
  const { i18n } = useTranslation()
  addStrings(i18n, namespace, ...parts)
}

/**
 * Переклад рядків кіта — для компонентів реєстру. Рядки функції (`lib/i18n-uk-*`, крім бази) компонент
 * передає сюди: `useErpUiT(ukAudit)`, і вони приходять із його чанком (ADR-0094).
 */
export function useErpUiT(...parts: readonly ErpUiStrings[]): ErpUiTranslate {
  const { i18n } = useTranslation()
  addStrings(i18n, ERP_UI_NAMESPACE, ...parts)
  const language = i18n.resolvedLanguage ?? i18n.language
  return useMemo(() => {
    // Власні типи ключів: не залежимо від CustomTypeOptions проекту, де простору erp-ui може не бути.
    const fixed = i18n.getFixedT(language, ERP_UI_NAMESPACE as never)
    // Без проектних типів приведення зайве (так бачить лінтер), з ними — потрібне.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- див. коментар вище
    return fixed as unknown as ErpUiTranslate
  }, [i18n, language])
}
