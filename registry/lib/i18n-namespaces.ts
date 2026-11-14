/**
 * Рядки модуля у своєму просторі імен i18next (ADR-0025): українські приходять разом зі сторінками
 * модуля, інші мови — лінивим чанком за потреби, а не на старті застосунку; перевизначення рядків
 * з файлу розширення проекту (ADR-0020). Окремо від `lib/i18n`, щоб перший екран за це не платив.
 */
import type { i18n } from "i18next"
import { use, useEffect, useMemo, useReducer, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  DEFAULT_LANGUAGE,
  toLanguage,
  withRetries,
  type Language,
  type MessageKey,
} from "@/registry/lib/i18n"
import { track, type TrackedPromise } from "@/registry/lib/lazy"

/** Часткове дерево рядків: перевизначення з файлу розширення (ADR-0020, п. 2). */
export type MessagesOverride<M> = {
  readonly [K in keyof M]?: M[K] extends string
    ? string
    : MessagesOverride<M[K]>
}

const isTree = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/** Рядки модуля з перевизначеннями розширення; без перевизначень — ті самі. */
export function mergeMessages<M extends object>(
  base: M,
  override?: MessagesOverride<M>,
): M {
  if (!override) return base
  const result = { ...base } as Record<string, unknown>
  for (const [key, value] of Object.entries(override)) {
    // `{ lead: undefined }` — не перевизначення: без цього рядок зник би з набору.
    if (value === undefined) continue
    const current = result[key]
    result[key] =
      isTree(current) && isTree(value)
        ? mergeMessages(current, value as MessagesOverride<typeof current>)
        : value
  }
  return result as M
}

/**
 * Рядки простору імен модуля: українські — об'єктом (у чанку сторінок модуля, а не на старті
 * застосунку), інші мови — завантаженням за потреби.
 */
export type NamespaceResources = {
  readonly [DEFAULT_LANGUAGE]: object
} & {
  readonly [
    L in Exclude<Language, typeof DEFAULT_LANGUAGE>
  ]?: () => Promise<object>
}

/** Перевизначення рядків модуля мовами — поле `strings` файлу розширення (ADR-0020). */
export interface ModuleStrings<M> {
  readonly uk?: MessagesOverride<M>
  readonly en?: MessagesOverride<M>
}

/**
 * Рядки модуля з перевизначеннями розширення для `useNamespaceResources`: українські — разом зі
 * сторінками модуля, англійські — окремим чанком (`loadEn`, ADR-0009). Набір — один на об'єкт
 * `strings`, тож i18next отримує рядки раз, а не на кожен рендер. Приклад — `use-contacts-t.ts`
 * модуля B1: `loadEn` — динамічний імпорт `en.json` модуля.
 */
export function moduleResources<M extends object>(
  uk: M,
  loadEn: () => Promise<M>,
): (strings: ModuleStrings<M>) => NamespaceResources {
  const cache = new WeakMap<object, NamespaceResources>()
  return (strings) => {
    let resources = cache.get(strings)
    if (!resources) {
      resources = {
        uk: mergeMessages(uk, strings.uk),
        en: () => loadEn().then((en) => mergeMessages(en, strings.en)),
      }
      cache.set(strings, resources)
    }
    return resources
  }
}

const NO_STRINGS: ModuleStrings<object> = {}

/**
 * Хук перекладу рядків модуля для сторінок і секцій (ADR-0085): рядки приходять разом зі сторінками
 * модуля (ADR-0025), перевизначення — `strings` розширення з хука модуля (`createModuleContext` з
 * `lib/module`) на кожен рендер. `loadEn` — динамічний імпорт `en.json` модуля.
 *
 *   export const useContactsT = createModuleT<ContactsMessages>("B1-contacts", uk, loadEn, useContactsModule)
 */
export function createModuleT<M extends object>(
  namespace: string,
  uk: M,
  loadEn: () => Promise<M>,
  useModule: () => {
    readonly extension: { readonly strings?: ModuleStrings<M> | undefined }
  },
): () => ReturnType<typeof useNamespaceT<M>> {
  const resourcesFor = moduleResources<M>(uk, loadEn)
  return function useModuleT() {
    const { strings = NO_STRINGS } = useModule().extension
    useNamespaceResources(namespace, resourcesFor(strings))
    return useNamespaceT<M>(namespace)
  }
}

/** Переклад рядків модуля мовою аркуша друку й стан завантаження цієї мови. */
export interface ModuleSheetT<M> {
  readonly t: (key: MessageKey<M>, options?: Record<string, unknown>) => string
  /** Рядки мови ще вантажаться: аркуш чекає, щоб не блимнути запасною мовою. */
  readonly isLoading: boolean
  /**
   * Рядки мови не довантажились і після повторів: сторінка друку показує помилку з повтором, а не аркуш,
   * де тексти кіта однією мовою, а тексти модуля — запасною українською.
   */
  readonly error: unknown
  /** Завантажити рядки мови ще раз («Спробувати ще» сторінки друку). */
  readonly retry: () => void
}

/**
 * Рядки модуля мовою документа, а не інтерфейсу (ADR-0062 п. 6, ADR-0086): назва й тексти аркуша друку
 * в `i18n/*.json` модуля, тож `strings` розширення змінює й їх. Мова, якої ще немає, вантажиться без
 * призупинення сторінки (`isLoading`); не довантажилась — `error` і `retry`. Хук викликає сторінка друку
 * з мовою аркуша (`usePrintLanguage`) і передає `t` в аркуш: другий виклик в аркуші почав би своє
 * завантаження. Аргументи — ті самі, що в `createModuleT`.
 *
 *   export const useSalesSheetT = createModuleSheetT<SalesMessages>("B3-sales", uk, loadEn, useSalesModule)
 */
export function createModuleSheetT<M extends object>(
  namespace: string,
  uk: M,
  loadEn: () => Promise<M>,
  useModule: () => {
    readonly extension: { readonly strings?: ModuleStrings<M> | undefined }
  },
): (language: Language) => ModuleSheetT<M> {
  const resourcesFor = moduleResources<M>(uk, loadEn)
  return function useModuleSheetT(language) {
    const { strings = NO_STRINGS } = useModule().extension
    const resources = resourcesFor(strings)
    const { i18n: instance } = useTranslation()
    addDefaultBundle(instance, namespace, resources)
    const [failure, setFailure] = useState<{
      language: Language
      error: unknown
    } | null>(null)
    const [, settled] = useReducer((count: number) => count + 1, 0)
    const failed = failure?.language === language ? failure : null
    const load =
      language === DEFAULT_LANGUAGE || failed ? undefined : resources[language]
    const pending = load && loadNamespace(instance, namespace, language, load)
    // Відмова, яку ще не записано у стан, — теж очікування: аркуш не малюється запасною мовою на мить.
    const isLoading = pending !== undefined && pending.status !== "fulfilled"
    useEffect(() => {
      // Підписка — за станом із рендера: проміс міг завершитись між рендером і ефектом.
      if (!pending || !isLoading) return
      let active = true
      pending.then(
        () => {
          if (active) settled()
        },
        (error: unknown) => {
          if (active) setFailure({ language, error })
        },
      )
      return () => {
        active = false
      }
    }, [pending, isLoading, language])
    const error: unknown = failed?.error
    return useMemo(() => {
      const fixed = instance.getFixedT(language, namespace as never)
      return {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- як у useErpUiT
        t: fixed as unknown as ModuleSheetT<M>["t"],
        isLoading,
        error,
        // Невдале завантаження кеш не тримає (`loadNamespace`): новий рендер почне його знову.
        retry: () => {
          setFailure(null)
        },
      }
    }, [instance, language, isLoading, error])
  }
}

/** Українські рядки простору імен — одразу: вони приходять разом зі сторінками модуля. */
function addDefaultBundle(
  instance: i18n,
  namespace: string,
  resources: NamespaceResources,
) {
  if (!instance.hasResourceBundle(DEFAULT_LANGUAGE, namespace))
    instance.addResourceBundle(
      DEFAULT_LANGUAGE,
      namespace,
      resources[DEFAULT_LANGUAGE],
      true,
      true,
    )
}

/**
 * Завантаження рядків простору імен іншою мовою: одне на екземпляр, мову й простір, і проміс
 * лишається в кеші зі станом для `use()` (`track`): готові рядки сторінка бере без призупинення.
 * Не `hasResourceBundle`: після `changeLanguage` бекенд застосунку пише порожній набір для кожного
 * відомого простору, і він уже «є».
 */
const namespaceLoads = new WeakMap<i18n, Map<string, TrackedPromise<void>>>()

function loadNamespace(
  instance: i18n,
  namespace: string,
  language: Language,
  load: () => Promise<object>,
): TrackedPromise<void> {
  let loads = namespaceLoads.get(instance)
  if (!loads) {
    loads = new Map()
    namespaceLoads.set(instance, loads)
  }
  const key = `${language}|${namespace}`
  let pending = loads.get(key)
  if (!pending) {
    const started = track(
      withRetries(load).then((messages) => {
        instance.addResourceBundle(language, namespace, messages, true, true)
      }),
    )
    // Невдача не запам'ятовується: «Спробувати ще» межі помилок завантажить знову.
    started.catch(() => {
      if (loads.get(key) === started) loads.delete(key)
    })
    loads.set(key, started)
    pending = started
  }
  return pending
}

/**
 * Рядки простору імен модуля в i18next — на сторінці модуля, до `useNamespaceT`. Українські
 * додаються одразу; рядки поточної мови, яких ще немає, сторінка чекає (Suspense), а невдале
 * завантаження (офлайн) іде в межу помилок сторінки з повтором. `resources` — стабільні між
 * рендерами (константа чи кеш модуля). Простір імен — один на застосунок: перший набір рядків
 * перемагає, тож два екземпляри модуля з різними перевизначеннями рядків не підтримуються.
 */
export function useNamespaceResources(
  namespace: string,
  resources: NamespaceResources,
): void {
  const { i18n: instance } = useTranslation()
  addDefaultBundle(instance, namespace, resources)
  // Як `useLanguage`: рядки кіта іншою мовою не завантажились — інтерфейс українською, і модуль теж.
  const language = toLanguage(instance.resolvedLanguage ?? instance.language)
  if (language === DEFAULT_LANGUAGE) return
  const load = resources[language]
  // Без умови «вже завантажено»: вона перевертається, поки React повторює рендер після `use()`, і
  // хуки рендера розходяться. Готовий проміс з кешу `use()` віддає одразу.
  if (load) use(loadNamespace(instance, namespace, language, load))
}

/** Переклад рядків простору імен `M` (модуля) мовою інтерфейсу, без типів проекту. */
export function useNamespaceT<M>(
  namespace: string,
): (key: MessageKey<M>, options?: Record<string, unknown>) => string {
  const { i18n: instance } = useTranslation()
  const language = instance.resolvedLanguage ?? instance.language
  return useMemo(() => {
    const fixed = instance.getFixedT(language, namespace as never)
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- як у useErpUiT
    return fixed as unknown as (
      key: MessageKey<M>,
      options?: Record<string, unknown>,
    ) => string
  }, [instance, language, namespace])
}
