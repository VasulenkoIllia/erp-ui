/**
 * Статуси запису модуля з точкою розширення (ADR-0020, ADR-0025): модуль має свої статуси, проект у
 * файлі розширення додає нові, змінює підпис, тон чи іконку статусу модуля без заміни (`change`) чи
 * ховає його з вибору. Схований статус лишається дійсним у схемі й підписаним на бейджі (зі змінами
 * `change`): старі записи з ним не ламають відповідь сервера.
 *
 * - Типи, `statusIds`, `statusSchema` і граф переходів (`mergeTransitions`, `findTransition`,
 *   `transitionsFrom`) — у `lib/statuses-core` без React (ADR-0093); тут вони реекспортуються.
 * - `useResolvedStatuses` — статуси мовою інтерфейсу: `options` — для вкладок і вибору (без
 *   схованих), `byId` — для бейджа (усі відомі).
 * - `useResolvedTransitions` — переходи модуля зі змінами розширення мовою інтерфейсу: кнопки дій.
 */
import { useMemo } from "react"

import { localizedText } from "@/registry/lib/localized-text"
import { applyKeyedChanges, mapKeyedChanges } from "@/registry/lib/extensions"
import { useLanguage } from "@/registry/lib/i18n"
import {
  findTransition,
  mergeTransitions,
  onlyNewTransitions,
  statusIds,
  statusSchema,
  transitionsFrom,
  type ExtensionStatus,
  type ExtensionStatusChange,
  type ExtensionStatusChanges,
  type ExtensionTransition,
  type ExtensionTransitionChange,
  type ExtensionTransitionChanges,
  type ModuleStatus,
  type ModuleTransition,
  type StatusIcon,
  type StatusTone,
  type StatusTransition,
  type TransitionConfirmText,
  type TransitionReason,
} from "@/registry/lib/statuses-core"

// Типи, схема й граф без React — у `lib/statuses-core` (ADR-0093); проект бере їх і звідси, як раніше.
export {
  findTransition,
  mergeTransitions,
  statusIds,
  statusSchema,
  transitionsFrom,
  type ExtensionStatus,
  type ExtensionStatusChange,
  type ExtensionStatusChanges,
  type ExtensionTransition,
  type ExtensionTransitionChange,
  type ExtensionTransitionChanges,
  type ModuleStatus,
  type ModuleTransition,
  type StatusIcon,
  type StatusTone,
  type StatusTransition,
  type TransitionConfirmText,
  type TransitionReason,
}

/** `change` мовою інтерфейсу. */
type ResolvedStatusChange = Pick<ModuleStatus, "label" | "tone" | "icon">

export interface ResolvedStatuses {
  /** Для вкладок і вибору — у порядку злитого списку, без схованих. */
  readonly options: readonly ModuleStatus[]
  /** Для бейджа — усі відомі, зі схованими й перейменованими. */
  readonly byId: ReadonlyMap<string, ModuleStatus>
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

/**
 * Переходи модуля (`transitions` — підписи мовою інтерфейсу, стабільні між рендерами) зі змінами
 * розширення.
 */
export function useResolvedTransitions<A extends string>(
  transitions: readonly (ModuleTransition & { readonly id: A })[],
  changes?: ExtensionTransitionChanges<A>,
): readonly ModuleTransition[] {
  const { language } = useLanguage()
  return useMemo(() => {
    const resolved = mapKeyedChanges(
      onlyNewTransitions(transitions, changes),
      ({ id, from, to, reason, label }): ModuleTransition => ({
        id,
        from,
        to,
        reason,
        label: localizedText(label, language) ?? id,
      }),
      // Лише те, що розширення може змінити: дані без типів (з сервера) не перепишуть `to`.
      ({ id, from, reason, label }) => ({
        id,
        from,
        reason,
        label: localizedText(label, language),
      }),
    )
    return applyKeyedChanges<
      ModuleTransition & { readonly id: A },
      ModuleTransition,
      Pick<ModuleTransition, "label" | "from" | "reason">
    >(transitions, resolved)
  }, [transitions, changes, language])
}
