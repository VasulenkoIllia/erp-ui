/**
 * Статуси запису модуля з точкою розширення (ADR-0020, ADR-0025): модуль має свої статуси, проект у
 * файлі розширення додає нові, змінює підпис, тон чи іконку статусу модуля без заміни (`change`) чи
 * ховає його з вибору. Схований статус лишається дійсним у схемі й підписаним на бейджі (зі змінами
 * `change`): старі записи з ним не ламають відповідь сервера.
 *
 * - `statusIds` і `statusSchema` — ключі статусів для zod-схеми запису (модуль і розширення).
 * - `useResolvedStatuses` — статуси мовою інтерфейсу: `options` — для вкладок і вибору (без
 *   схованих), `byId` — для бейджа (усі відомі).
 * - Тон — колір і іконка бейджа (SPEC §6.3): статуси без власного кольору, лише токени тем.
 */
import { useMemo } from "react"
import { z } from "zod"

import { localizedText, type LocalizedText } from "@/registry/lib/auth"
import {
  applyKeyedChanges,
  mapKeyedChanges,
  type KeyedChanges,
} from "@/registry/lib/extensions"
import { useLanguage } from "@/registry/lib/i18n"
import type { StatusIcon } from "@/registry/lib/icons"

export type StatusTone =
  "neutral" | "info" | "success" | "warning" | "destructive"

/** Статус мовою інтерфейсу: бейдж, вкладка, варіант вибору. */
export interface ModuleStatus {
  readonly id: string
  readonly label: string
  readonly tone: StatusTone
  /** Іконка поруч із підписом; за замовчуванням — іконка тону. */
  readonly icon?: StatusIcon
}

/** Статус із файлу розширення проекту: підпис мовами, без функцій (дані, як решта розширення). */
export interface ExtensionStatus {
  readonly id: string
  readonly label: LocalizedText
  readonly tone: StatusTone
  readonly icon?: StatusIcon
  /** Моки: кожен N-й запис фікстур отримує цей статус (лише нові статуси). */
  readonly mockEvery?: number
}

/**
 * Що розширення змінює в статусі модуля без заміни (`change`): підпис, тон, іконку. Решта — від
 * модуля, тож зміна тону чи іконки в модулі доходить до проекту з оновленням.
 */
export type ExtensionStatusChange = Pick<
  ExtensionStatus,
  "label" | "tone" | "icon"
>

/** Зміни статусів у файлі розширення: `add`, `hide`, `move` і `change` за ключем статусу модуля. */
export type ExtensionStatusChanges<K extends string = string> = KeyedChanges<
  ExtensionStatus,
  K,
  ExtensionStatusChange
>

/** `change` мовою інтерфейсу. */
type ResolvedStatusChange = Pick<ModuleStatus, "label" | "tone" | "icon">

export interface ResolvedStatuses {
  /** Для вкладок і вибору — у порядку злитого списку, без схованих. */
  readonly options: readonly ModuleStatus[]
  /** Для бейджа — усі відомі, зі схованими й перейменованими. */
  readonly byId: ReadonlyMap<string, ModuleStatus>
}

/** Ключі статусів модуля й нових статусів розширення (схований — теж дійсний). */
export function statusIds<K extends string>(
  module: readonly K[],
  changes?: ExtensionStatusChanges<K>,
): [string, ...string[]] {
  const ids = new Set<string>(module)
  for (const status of changes?.add ?? []) ids.add(status.id)
  const [first, ...rest] = [...ids]
  if (first === undefined)
    throw new Error("erp-ui: a module must have at least one status")
  return [first, ...rest]
}

/** Схема статусу запису: ключ модуля чи розширення. */
export function statusSchema<K extends string>(
  module: readonly K[],
  changes?: ExtensionStatusChanges<K>,
) {
  return z.enum(statusIds(module, changes))
}

/**
 * Статуси модуля (`statuses` — підписи мовою інтерфейсу, стабільні між рендерами) зі змінами
 * розширення.
 */
export function useResolvedStatuses<K extends string>(
  statuses: readonly (ModuleStatus & { readonly id: K })[],
  changes?: ExtensionStatusChanges<K>,
): ResolvedStatuses {
  const { language } = useLanguage()
  return useMemo(() => {
    const resolve = (status: ExtensionStatus): ModuleStatus => ({
      id: status.id,
      label: localizedText(status.label, language) ?? status.id,
      tone: status.tone,
      icon: status.icon,
    })
    const resolved = mapKeyedChanges(changes, resolve, (change) => ({
      ...change,
      label: localizedText(change.label, language),
    }))
    const apply = (merged: typeof resolved) =>
      applyKeyedChanges<
        ModuleStatus & { readonly id: K },
        ModuleStatus,
        ResolvedStatusChange
      >(statuses, merged)
    const options = apply(resolved)
    // Бейдж знає й схований статус — з тими самими змінами підпису, тону й іконки.
    const known = resolved?.hide?.length
      ? apply({ ...resolved, hide: [] })
      : options
    const byId = new Map<string, ModuleStatus>(
      known.map((status) => [status.id, status]),
    )
    return { options, byId }
  }, [statuses, changes, language])
}
