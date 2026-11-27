import * as React from "react"
import {
  draggable,
  dropTargetForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter"
import { autoScrollForElements } from "@atlaskit/pragmatic-drag-and-drop-auto-scroll/element"

/**
 * Частина erp/kanban: перетягування карток між колонками на Pragmatic drag and drop (ADR-0103). Ставиться
 * разом з erp/kanban.
 *
 * - Бібліотека бере перетягування браузера: мишею, а на телефоні й планшеті — довгим натиском. Картку
 *   кидають у клітинку колонки своєї доріжки чи на згорнуту колонку; своя колонка й чужі доріжки картку
 *   не приймають. Перетягування змінює лише колонку.
 * - Підсвітка під час перетягування — атрибути `data-dragging` і `data-drop-over` прямо на елементах, без
 *   стану React: колонка на 500 карток не рендериться заново на кожен рух.
 * - Посилання й зображення в картці браузер тягне сам (адресу чи файл), і тоді картка не рушила б: перед
 *   натиском вони стають неперетягуваними. Клік за посиланням працює як раніше.
 * - Перетягування — додатковий спосіб: «Перемістити в…» картки лишається (SPEC §9, WCAG 2.5.7).
 */

/** Ключ даних картки: дошка бере лише свої картки, а не файли, текст чи картки іншої дошки. */
const CARD_KEY = "erp-ui:kanban-card"

/** Доріжка, у яку можна кинути картку з будь-якої доріжки: згорнута колонка. */
export const ANY_LANE = "erp-ui:any-lane"

export interface KanbanCardDrag {
  /** Дошка: `useId` компонента erp/kanban. */
  board: string
  id: string
  column: string
  lane: string
}

/** Куди кидають: колонка й доріжка (`ANY_LANE` — будь-яка). */
export interface KanbanDropPlace {
  board: string
  column: string
  lane: string
}

function cardDragOf(
  data: Record<string | symbol, unknown>,
  board: string,
): KanbanCardDrag | undefined {
  const card = data[CARD_KEY]
  if (!card || typeof card !== "object") return undefined
  const drag = card as KanbanCardDrag
  return drag.board === board ? drag : undefined
}

/** Чи приймає місце картку: інша колонка, та сама доріжка (чи будь-яка). */
export function acceptsCard(card: KanbanCardDrag, place: KanbanDropPlace) {
  return (
    card.board === place.board &&
    card.column !== place.column &&
    (place.lane === ANY_LANE || card.lane === place.lane)
  )
}

/** Посилання й зображення, які браузер тягнув би сам замість картки. */
const NATIVE_DRAGGABLE = "a[href], img"

function stopNativeDrag(event: PointerEvent) {
  const card = event.currentTarget
  if (!(card instanceof HTMLElement)) return
  for (const element of card.querySelectorAll<HTMLElement>(NATIVE_DRAGGABLE))
    element.draggable = false
}

/** Картка, яку можна тягнути: елемент `li` картки; `drag` — `undefined`, коли тягнути не можна. */
export function useCardDraggable(
  ref: React.RefObject<HTMLElement | null>,
  drag: KanbanCardDrag | undefined,
) {
  const { board, id, column, lane } = drag ?? {}
  React.useEffect(() => {
    const element = ref.current
    if (!element || board === undefined) return
    const data = { board, id, column, lane }
    element.addEventListener("pointerdown", stopNativeDrag, { capture: true })
    const cleanup = draggable({
      element,
      getInitialData: () => ({ [CARD_KEY]: data }),
      onDragStart: () => {
        element.setAttribute("data-dragging", "")
      },
      onDrop: () => {
        element.removeAttribute("data-dragging")
      },
    })
    return () => {
      element.removeEventListener("pointerdown", stopNativeDrag, {
        capture: true,
      })
      element.removeAttribute("data-dragging")
      cleanup()
    }
  }, [ref, board, id, column, lane])
}

/** Місце, куди кидають картку: клітинка колонки в доріжці чи згорнута колонка. */
export function useCardDropTarget(
  ref: React.RefObject<HTMLElement | null>,
  place: KanbanDropPlace | undefined,
  onDrop: (card: string, column: string) => void,
) {
  const latest = React.useRef(onDrop)
  React.useLayoutEffect(() => {
    latest.current = onDrop
  })
  const { board, column, lane } = place ?? {}
  React.useEffect(() => {
    const element = ref.current
    if (!element || board === undefined || column === undefined) return
    const self = { board, column, lane: lane ?? ANY_LANE }
    const accepts = (data: Record<string | symbol, unknown>) => {
      const card = cardDragOf(data, board)
      return card !== undefined && acceptsCard(card, self)
    }
    const clear = () => {
      element.removeAttribute("data-drop-over")
    }
    const cleanup = dropTargetForElements({
      element,
      canDrop: ({ source }) => accepts(source.data),
      onDragEnter: () => {
        element.setAttribute("data-drop-over", "")
      },
      onDragLeave: clear,
      onDrop: ({ source }) => {
        clear()
        const card = cardDragOf(source.data, board)
        if (card) latest.current(card.id, column)
      },
    })
    return () => {
      clear()
      cleanup()
    }
  }, [ref, board, column, lane])
}

/** Прокрутка дошки, коли картку підносять до краю (вбік і, на широкому контейнері, вниз). */
export function useBoardAutoScroll(
  ref: React.RefObject<HTMLElement | null>,
  board: string | undefined,
) {
  React.useEffect(() => {
    const element = ref.current
    if (!element || board === undefined) return
    return autoScrollForElements({
      element,
      canScroll: ({ source }) => cardDragOf(source.data, board) !== undefined,
    })
  }, [ref, board])
}
