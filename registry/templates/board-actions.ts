import * as React from "react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { useDataProvider, type RaRecord } from "@/registry/lib/ra-core"

import { useApiErrorMessage } from "@/registry/hooks/use-api-error-message"
import { announce } from "@/registry/lib/announce"
import { isApiError } from "@/registry/lib/api"
import { useErpUiT } from "@/registry/lib/i18n"
import { ukBoard } from "@/registry/lib/i18n-uk-board"
import type { PendingMove } from "@/registry/templates/board-data"

/**
 * Частина templates/board: перенесення й швидке створення картки (ADR-0100, ADR-0103). Ставиться разом із
 * шаблоном.
 *
 * - Перенесення — `move` модуля чи зміна поля колонки з версією запису (`update`, ADR-0002). Картка одразу
 *   стає на нове місце (`pending`, дошка накладає його через `withPendingMoves`), сервер отримує запит на
 *   кожну картку окремо. Після відповіді дошка й лічильники вкладок оновлюються (ключі ресурсу), скрінрідер
 *   чує «… тепер у колонці …», а фокус іде на меню картки на новому місці; картки там не видно (колонка
 *   згорнута, інша на телефоні, поза завантаженими) — на назву колонки (WCAG 2.4.3).
 * - Відкат: 409 (картку змінив інший) — картка повертається, повідомлення й оновлена дошка; 404 (картку
 *   видалили) — так само з причиною; інша помилка — картка повертається на місце з причиною.
 * - Кілька карток (панель вибраного, перетягування вибраної): кожна зі своєю версією; підсумок «Перенесено
 *   N з M» і перша причина, неперенесені повертаються. Фокус лишається, де був.
 * - Кілька перенесень одночасно: кожна картка зайнята до своєї відповіді. Фокус веде останнє перенесення;
 *   якщо оновлення колонки не вдалось чи затяглось (`FOCUS_WAIT_MS`), фокус іде на назву колонки, а не
 *   чекає й не перехоплює його пізніше.
 * - Швидке створення: назва, колонка й значення модуля; помилка поля назви — під полем, решта — текстом.
 */

/** Скільки чекати на свіжі дані колонки після перенесення, далі фокус — на назву колонки. */
const FOCUS_WAIT_MS = 3_000

interface FocusTarget {
  id: string
  /** Колонка, у якій картку шукати. */
  column: string
  /** Запасна колонка, якщо першої не видно. */
  fallback: string
  /** Коли почали оновлювати дошку: фокус — коли колонка отримала свіжі дані чи помилку. */
  after: number
}

/** Що дошка знає про колонку: коли прийшли дані й коли — помилка, мс. */
interface ColumnTimes {
  updatedAt: number
  failedAt: number
}

export interface BoardActionsOptions<T extends RaRecord> {
  resource: string
  field: string
  columns: readonly { id: string; label: string }[]
  cardLabel: (record: T) => string
  quickCreate?: { field: string; values?: (column: string) => Partial<T> }
  move?: (record: T, column: string) => Promise<unknown>
  container: React.RefObject<HTMLElement | null>
  /** Колонка на дошці; `undefined` — її не видно (вкладка ховає), чекати на неї не треба. */
  columnOf: (column: string) => ColumnTimes | undefined
}

export function useBoardActions<T extends RaRecord>({
  resource,
  field,
  columns,
  cardLabel,
  quickCreate,
  move,
  container,
  columnOf,
}: BoardActionsOptions<T>) {
  const t = useErpUiT(ukBoard)
  const dataProvider = useDataProvider()
  const queryClient = useQueryClient()
  const errorMessage = useApiErrorMessage()
  const [movingIds, setMovingIds] = React.useState<ReadonlySet<string>>(NONE)
  const [pending, setPending] =
    React.useState<ReadonlyMap<string, PendingMove<T>>>(NO_MOVES)
  // Куди повести фокус після перенесення: у першому рендері, де колонка вже має свіжі дані чи помилку.
  const focusTarget = React.useRef<FocusTarget>(null)
  React.useLayoutEffect(() => {
    const target = focusTarget.current
    if (!target || !isSettled(columnOf(target.column), target.after)) return
    focusTarget.current = null
    // Людина вже пішла деінде (поле, інша картка) — фокус не перехоплюємо.
    if (isFocusFree(target.id)) focusCard(container.current, target)
  })

  const labelOf = (column: string) =>
    columns.find(({ id }) => id === column)?.label ?? column
  const refresh = () => queryClient.invalidateQueries({ queryKey: [resource] })
  // Час перед оновленням: фокус чекає на дані колонки, свіжіші за нього.
  const refreshFrom = async () => {
    const at = Date.now()
    await refresh()
    return at
  }

  const send = (record: T, to: string) =>
    move
      ? move(record, to)
      : dataProvider.update<T>(resource, {
          id: record.id,
          data: { [field]: to } as Partial<T>,
          previousData: record,
        })

  const start = (records: readonly T[], to: string) => {
    const ids = records.map((record) => String(record.id))
    setMovingIds((current) => new Set([...current, ...ids]))
    setPending((current) => {
      const next = new Map(current)
      for (const record of records)
        next.set(String(record.id), {
          record: { ...record, [field]: to },
          from: String(record[field]),
          to,
        })
      return next
    })
    return () => {
      setMovingIds((current) => withoutIds(current, ids))
      setPending((current) => {
        const next = new Map(current)
        for (const id of ids) next.delete(id)
        return next
      })
    }
  }

  /**
   * Перенести картки в колонку `to`: одразу на новому місці. Ті, що вже там чи зайняті, — без змін; ті, яких
   * переносити не можна (`reasonOf`: право, позначка запису, редагує інший), — у підсумок із причиною, без
   * запиту. `moveFocus: false` (кидок мишею) — фокус лишається, де був, дошка не прокручується до картки.
   */
  const moveCards = async (
    records: readonly T[],
    to: string,
    { reasonOf, moveFocus = true }: MoveOptions<T> = {},
  ) => {
    const candidates = records.filter(
      (record) =>
        String(record[field]) !== to && !movingIds.has(String(record.id)),
    )
    const blocked = candidates.flatMap((record): MoveFailure<T>[] => {
      const reason = reasonOf?.(record)
      return reason ? [{ record, reason }] : []
    })
    const moving = candidates.filter(
      (record) => !blocked.some((failure) => failure.record === record),
    )
    const [single] = moving
    if (!single) {
      if (blocked.length) reportMany(blocked, [], candidates.length, to)
      return
    }
    const isSingle = candidates.length === 1
    const from = String(single[field])
    const id = String(single.id)
    const finish = start(moving, to)
    const follow = (target: FocusTarget) => {
      if (moveFocus) focusTarget.current = target
    }
    // Одна картка: фокус іде за нею на нове місце одразу, у першому ж кадрі з нею там.
    if (isSingle) follow({ id, column: to, fallback: from, after: 0 })
    // Через `then`: `move` модуля, що кидає одразу, теж повертає картку, а не лишає її зайнятою.
    const results = await Promise.allSettled(
      moving.map((record) => Promise.resolve().then(() => send(record, to))),
    )
    const outcome = outcomeOf(moving, results)
    const after =
      outcome.done.length || outcome.refresh ? await refreshFrom() : 0
    finish()
    if (!isSingle) {
      reportMany(
        [...blocked, ...outcome.failures],
        outcome.done,
        candidates.length,
        to,
      )
      return
    }
    const failure = outcome.failures[0]
    if (!failure) {
      announce(
        t("board.card.moved", {
          label: cardLabel(single),
          column: labelOf(to),
        }),
      )
      follow({ id, column: to, fallback: from, after })
      return
    }
    toast.error(failureText(failure, true))
    // Картка повернулась: фокус на неї в старій колонці (після оновлення, якщо воно було).
    follow({
      id,
      column: from,
      fallback: from,
      after: outcome.refresh ? after : 0,
    })
  }

  const failureText = (failure: MoveFailure<T>, isSingle: boolean) => {
    if (failure.reason) return failure.reason
    const label = cardLabel(failure.record)
    if (failure.status === 409)
      return isSingle
        ? t("board.card.conflict", { label })
        : t("board.bulk.changed")
    const message = errorMessage(failure.error)
    return isSingle ? t("board.card.moveFailed", { label, message }) : message
  }

  /** Підсумок кількох карток: усі перенесені — «Перенесено N…», інакше скільки з скількох і перша причина. */
  const reportMany = (
    failures: readonly MoveFailure<T>[],
    done: readonly T[],
    total: number,
    to: string,
  ) => {
    const column = labelOf(to)
    const [failure] = failures
    if (!failure) {
      toast.success(t("board.bulk.moved", { count: done.length, column }))
      return
    }
    const reason = {
      label: cardLabel(failure.record),
      message: failureText(failure, false),
    }
    toast.error(
      done.length
        ? t("board.bulk.partial", {
            done: done.length,
            total,
            column,
            ...reason,
          })
        : t("board.bulk.none", reason),
    )
  }

  const moveCard = (record: T, to: string) => moveCards([record], to)

  const create = async (column: string, name: string) => {
    if (!quickCreate) return undefined
    try {
      await dataProvider.create<T>(resource, {
        data: {
          ...quickCreate.values?.(column),
          [quickCreate.field]: name,
          [field]: column,
        } as Partial<T>,
      })
      await refresh()
      announce(
        t("board.quickCreate.created", { name, column: labelOf(column) }),
      )
      return undefined
    } catch (error) {
      const own = isApiError(error)
        ? error.fieldErrors?.[quickCreate.field]
        : undefined
      return (
        own ?? t("board.quickCreate.failed", { message: errorMessage(error) })
      )
    }
  }

  return { movingIds, pending, moveCard, moveCards, create }
}

/** Що дає дошці `useBoardActions`. */
export type BoardActions<T extends RaRecord> = ReturnType<
  typeof useBoardActions<T>
>

export interface MoveOptions<T> {
  /** Чому картку не можна перенести; `undefined` — можна. */
  reasonOf?: (record: T) => string | undefined
  /** `false` — фокус не йде за карткою (кидок мишею). */
  moveFocus?: boolean
}

const NONE: ReadonlySet<string> = new Set()
const NO_MOVES: ReadonlyMap<string, never> = new Map<string, never>()

const withoutIds = (current: ReadonlySet<string>, ids: readonly string[]) => {
  const next = new Set(current)
  for (const id of ids) next.delete(id)
  return next
}

interface MoveFailure<T> {
  record: T
  error?: unknown
  status?: number
  /** Причина без запиту: переносити не можна. */
  reason?: string
}

interface MoveOutcome<T> {
  done: T[]
  failures: MoveFailure<T>[]
  /** Картку змінили чи видалили: дошка з сервера. */
  refresh: boolean
}

/** Що вийшло з перенесень: успішні, невдачі з причиною, чи треба оновити дошку (409, 404). */
function outcomeOf<T>(
  records: readonly T[],
  results: readonly PromiseSettledResult<unknown>[],
): MoveOutcome<T> {
  const outcome: MoveOutcome<T> = { done: [], failures: [], refresh: false }
  results.forEach((result, index) => {
    const record = records[index]
    if (record === undefined) return
    if (result.status === "fulfilled") {
      outcome.done.push(record)
      return
    }
    const error: unknown = result.reason
    const status = isApiError(error) ? error.status : undefined
    if (status === 409 || status === 404) outcome.refresh = true
    outcome.failures.push({ record, error, status })
  })
  return outcome
}

/** Фокус загубився (картка зникла) чи лишився на перенесеній картці. */
const isFocusFree = (id: string) => {
  const active = document.activeElement
  return (
    !active ||
    active === document.body ||
    Boolean(active.closest(`[data-kanban-card="${CSS.escape(id)}"]`))
  )
}

/** Колонка отримала свіжі дані чи помилку, її не видно, або чекали досить. */
const isSettled = (column: ColumnTimes | undefined, after: number) =>
  !column ||
  column.updatedAt >= after ||
  column.failedAt >= after ||
  Date.now() - after > FOCUS_WAIT_MS

/**
 * Меню картки в колонці `column`, інакше назва `column` (згорнута — її кнопка «розгорнути»), далі так само
 * в колонці `fallback`.
 */
function focusCard(root: HTMLElement | null, target: FocusTarget) {
  if (!root) return
  const id = CSS.escape(target.id)
  const inColumn = (column: string) =>
    `[data-kanban-cards="${CSS.escape(column)}"] [data-kanban-card="${id}"] [data-kanban-card-menu]`
  const heading = (column: string) =>
    `[data-kanban-column="${CSS.escape(column)}"] h2`
  const toggle = (column: string) =>
    `[data-kanban-toggle="${CSS.escape(column)}"]`
  // По черзі: один селектор зі списком повернув би перший у документі, а не за пріоритетом.
  for (const selector of [
    inColumn(target.column),
    heading(target.column),
    toggle(target.column),
    heading(target.fallback),
    toggle(target.fallback),
  ]) {
    const element = root.querySelector<HTMLElement>(selector)
    if (element) {
      element.focus()
      return
    }
  }
}
