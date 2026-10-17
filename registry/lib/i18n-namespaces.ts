/**
 * Рядки модуля у своєму просторі імен i18next (ADR-0025): українські приходять разом зі сторінками
 * модуля, інші мови — лінивим чанком за потреби, а не на старті застосунку; перевизначення рядків
 * з файлу розширення проекту (ADR-0020). Окремо від `lib/i18n`, щоб перший екран за це не платив.
 */
import type { i18n } from "i18next"
import { use, useMemo } from "react"
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

/** Завантаження рядків простору імен іншою мовою: одне на екземпляр, мову й простір. */
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
  if (!instance.hasResourceBundle(DEFAULT_LANGUAGE, namespace))
    instance.addResourceBundle(
      DEFAULT_LANGUAGE,
      namespace,
      resources[DEFAULT_LANGUAGE],
      true,
      true,
    )
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
