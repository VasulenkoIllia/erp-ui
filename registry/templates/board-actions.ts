import * as React from "react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { useDataProvider, type RaRecord } from "@/registry/lib/ra-core"

import { useApiErrorMessage } from "@/registry/hooks/use-api-error-message"
import { announce } from "@/registry/lib/announce"
import { isApiError } from "@/registry/lib/api"
import { useErpUiT } from "@/registry/lib/i18n"
import { ukBoard } from "@/registry/lib/i18n-uk-board"

/**
 * Частина templates/board: перенесення й швидке створення картки (ADR-0100). Ставиться разом із шаблоном.
 *
 * - Перенесення — `move` модуля чи зміна поля колонки з версією запису (`update`, ADR-0002). Після нього
 *   дошка й лічильники вкладок оновлюються (ключі ресурсу), скрінрідер чує «… тепер у колонці …», а фокус
 *   іде на меню картки на новому місці; картки там не видно (колонка згорнута, інша на телефоні, поза
 *   завантаженими) — на назву колонки (WCAG 2.4.3).
 * - 409: картку змінив інший — повідомлення й оновлена дошка; 404 (картку видалили) — так само з причиною;
 *   інша помилка — повідомлення з причиною, картка на місці.
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

  const moveCard = async (record: T, to: string) => {
    const id = String(record.id)
    const from = String(record[field])
    const label = cardLabel(record)
    setMovingIds((current) => new Set(current).add(id))
    try {
      await (move
        ? move(record, to)
        : dataProvider.update<T>(resource, {
            id: record.id,
            data: { [field]: to } as Partial<T>,
            previousData: record,
          }))
      const after = Date.now()
      await refresh()
      announce(t("board.card.moved", { label, column: labelOf(to) }))
      focusTarget.current = { id, column: to, fallback: from, after }
    } catch (error) {
      const status = isApiError(error) ? error.status : undefined
      toast.error(
        status === 409
          ? t("board.card.conflict", { label })
          : t("board.card.moveFailed", { label, message: errorMessage(error) }),
      )
      // Інша помилка — без оновлення дошки: картка на місці, фокус меню повертає саме.
      if (status !== 409 && status !== 404) return
      // Картку змінили чи видалили — дошка з сервера, фокус на картку чи назву її колонки.
      const after = Date.now()
      await refresh()
      focusTarget.current = { id, column: from, fallback: from, after }
    } finally {
      setMovingIds((current) => {
        const next = new Set(current)
        next.delete(id)
        return next
      })
    }
  }

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

  return { movingIds, moveCard, create }
}

const NONE: ReadonlySet<string> = new Set()

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
