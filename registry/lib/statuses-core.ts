/**
 * Статуси й переходи запису модуля без React (ADR-0093): типи, ключі для zod-схеми й граф переходів
 * (ADR-0020, ADR-0057). Їх беруть контракти модулів, моки й сервер на TypeScript; `lib/statuses`
 * реекспортує все звідси й додає хуки з підписами мовою інтерфейсу.
 *
 * - `statusIds` і `statusSchema` — ключі статусів для zod-схеми запису (модуль і розширення). Схований
 *   статус лишається дійсним у схемі: старі записи з ним не ламають відповідь сервера.
 * - Тон — колір і іконка бейджа (SPEC §6.3): статуси без власного кольору, лише токени тем.
 * - Дозволені переходи (ADR-0020, п. 2; ADR-0057): дія `id` переводить запис зі статусів `from` у `to`.
 *   Граф — дані модуля й розширення, однакові для інтерфейсу й сервера: інтерфейс показує дії зі
 *   статусу запису, сервер виконує лише їх, а що з конкретним записом — каже позначка `deniedActions`.
 */
import { z } from "zod"

import {
  applyKeyedChanges,
  mapKeyedChanges,
  type KeyedChanges,
} from "@/registry/lib/extensions"
import type { LocalizedText } from "@/registry/lib/localized-text"

export type StatusTone =
  "neutral" | "info" | "success" | "warning" | "destructive"

/**
 * Іконка бейджа статусу за назвою (SPEC §6.3): компоненти іконок — `STATUS_ICONS` у `lib/icons`, той самий
 * перелік (тест `contract-layer.test.ts` у демо). Тут — без lucide, бо назву бере й сервер.
 */
export type StatusIcon =
  | "success"
  | "warning"
  | "destructive"
  | "info"
  | "pending"
  | "draft"
  | "archived"
  | "locked"
  | "syncing"
  | "offline"

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

/* --------------------------------- Переходи --------------------------------- */

/** Чи питати причину дії: `required` — без неї сервер відповість 422, `optional` — поле без вимоги. */
export type TransitionReason = "required" | "optional"

/**
 * Дозволений перехід: дія `id` (право `<ресурс>:<дія>`, ключ `deniedActions`, шлях
 * `POST /<ресурс>/:id/<дія>`) зі статусів `from` у `to`. Без `to` статус не змінюється: дія лише
 * створює інший документ (`amend`, чи документ ресурсу `creates`).
 */
export interface StatusTransition<K extends string = string> {
  readonly id: string
  readonly from: readonly K[]
  readonly to?: K
  readonly reason?: TransitionReason
  /**
   * Ресурс документа, який дія створює на підставі цього (`basedOn`, ADR-0061): замовлення з
   * пропозиції. Відповідь 201 — новий документ цього ресурсу; панель дій веде до нього (`onCreated`).
   * Статус цього документа така дія не змінює: `to` поруч із `creates` не задають (мок його не бере).
   */
  readonly creates?: string
}

/** Тексти підтвердження дії мовою інтерфейсу: заголовок, наслідок і кнопка, що його називає. */
export interface TransitionConfirmText {
  readonly title: string
  readonly description: string
  readonly action: string
}

/** Перехід мовою інтерфейсу: кнопка дії. */
export interface ModuleTransition<
  K extends string = string,
> extends StatusTransition<K> {
  readonly label: string
  /**
   * Свої тексти підтвердження модуля: «Надіслати пропозицію?» замість «Провести документ?» кіта.
   * Без них — тексти кіта за ключем дії (`erp/document-action-dialogs`).
   */
  readonly confirm?: TransitionConfirmText
}

/**
 * Перехід із файлу розширення: підпис мовами, статуси — модуля чи нові статуси розширення. Документа
 * іншого ресурсу дія розширення не створює: це контракт модуля з його моком.
 */
export interface ExtensionTransition extends Omit<StatusTransition, "creates"> {
  readonly label: LocalizedText
}

/**
 * Що розширення змінює в переході модуля без заміни: підпис, звідки (новий статус розширення теж
 * може вести до проведення) і чи питати причину. Куди веде дія модуля, вирішує модуль.
 */
export type ExtensionTransitionChange = Pick<
  ExtensionTransition,
  "label" | "from" | "reason"
>

/**
 * Зміни переходів у файлі розширення: `add`, `hide`, `move` і `change` за ключем дії модуля (`A`).
 * Статуси в `from` і `to` — модуля чи нові статуси розширення. `add` з ключем дії модуля не діє:
 * заміна дала б іншу `to` тій самій дії на сервері, а змінити її підпис чи `from` — це `change`.
 */
export type ExtensionTransitionChanges<A extends string = string> =
  KeyedChanges<ExtensionTransition, A, ExtensionTransitionChange>

/** Граф без підписів: для сервера й моків. */
type TransitionChangeData = Pick<StatusTransition, "from" | "reason">

/**
 * Без нових переходів із ключем дії модуля (див. `ExtensionTransitionChanges`). Внутрішня: її бере
 * `useResolvedTransitions` у `lib/statuses`, проект — `mergeTransitions`.
 *
 * @internal
 */
export function onlyNewTransitions<A extends string>(
  module: readonly { readonly id: string }[],
  changes?: ExtensionTransitionChanges<A>,
): ExtensionTransitionChanges<A> | undefined {
  if (!changes?.add) return changes
  const ids = new Set(module.map((transition) => transition.id))
  return { ...changes, add: changes.add.filter(({ id }) => !ids.has(id)) }
}

/** Переходи модуля зі змінами розширення без підписів — граф для моків і сервера на TypeScript. */
export function mergeTransitions<A extends string>(
  module: readonly (StatusTransition & { readonly id: A })[],
  changes?: ExtensionTransitionChanges<A>,
): readonly StatusTransition[] {
  const data = mapKeyedChanges(
    onlyNewTransitions(module, changes),
    ({ id, from, to, reason }): StatusTransition => ({ id, from, to, reason }),
    ({ id, from, reason }) => ({ id, from, reason }),
  )
  return applyKeyedChanges<
    StatusTransition & { readonly id: A },
    StatusTransition,
    TransitionChangeData
  >(module, data)
}

/** Перехід `id` зі статусу `from`, якщо граф його дозволяє. */
export function findTransition<T extends StatusTransition>(
  transitions: readonly T[],
  from: string,
  id: string,
): T | undefined {
  return transitions.find(
    (transition) => transition.id === id && transition.from.includes(from),
  )
}

/** Дії зі статусу запису в порядку графа. */
export function transitionsFrom<T extends StatusTransition>(
  transitions: readonly T[],
  status: string,
): readonly T[] {
  return transitions.filter((transition) => transition.from.includes(status))
}
