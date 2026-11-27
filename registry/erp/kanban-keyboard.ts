import type * as React from "react"

/**
 * Частина erp/kanban: перехід між картками стрілками (SPEC §10, ADR-0103). Ставиться разом з erp/kanban.
 *
 * - Фокус на елементі картки (посилання, прапорець, меню): ↑ і ↓ — та сама дія сусідньої картки в колонці,
 *   ← і → — картка на тому ж місці в сусідній колонці тієї ж доріжки (коротша колонка — її остання картка);
 *   порожні й згорнуті колонки пропускаються. Tab, як і раніше, іде за порядком документа.
 * - Обробник іде у фазі перехоплення: кнопка меню картки (Base UI) сама відкривала б меню на ↑ ↓. Меню
 *   відкривають Enter і пробіл. Стрілки в полі, у відкритому меню й з Ctrl, Alt, Meta, Shift дошка не бере.
 * - Клітинка з картками — `ul[data-kanban-cards]` з `data-kanban-lane`; картка — `li[data-kanban-card]`.
 */

const CARDS = "ul[data-kanban-cards]"
const CARD = "li[data-kanban-card]"
const FOCUSABLE =
  "a[href], button:not(:disabled), input:not(:disabled):not([aria-hidden='true']), [tabindex]:not([tabindex='-1'])"
/** Елементи, яким стрілки потрібні самим. */
const OWN_ARROWS =
  "input:not([type=checkbox]):not([type=radio]), textarea, select, [contenteditable=''], [contenteditable='true'], [role=combobox], [aria-expanded=true]"

const STEP: Record<string, { row: number; column: number } | undefined> = {
  ArrowUp: { row: -1, column: 0 },
  ArrowDown: { row: 1, column: 0 },
  ArrowLeft: { row: 0, column: -1 },
  ArrowRight: { row: 0, column: 1 },
}

const focusablesOf = (card: Element) => [
  ...card.querySelectorAll<HTMLElement>(FOCUSABLE),
]

/** Картка, куди веде стрілка, або `undefined` (край дошки). */
function targetCard(
  root: HTMLElement,
  card: HTMLElement,
  step: { row: number; column: number },
): HTMLElement | undefined {
  const cell = card.closest<HTMLElement>(CARDS)
  if (!cell) return undefined
  const cards = [...cell.querySelectorAll<HTMLElement>(`:scope > ${CARD}`)]
  const index = cards.indexOf(card)
  if (step.row) return cards[index + step.row]
  const lane = cell.getAttribute("data-kanban-lane") ?? ""
  const row = [
    ...root.querySelectorAll<HTMLElement>(
      `${CARDS}[data-kanban-lane="${CSS.escape(lane)}"]`,
    ),
  ]
  // Клітинки без карток (порожні, згорнуті) не мають списку, тож сусідня в рядку вже має картки.
  const next = row[row.indexOf(cell) + step.column]
  const nextCards = next?.querySelectorAll<HTMLElement>(`:scope > ${CARD}`)
  if (!nextCards?.length) return undefined
  return nextCards[Math.min(index, nextCards.length - 1)]
}

/** Обробник `onKeyDownCapture` дошки: стрілки між картками. */
export function onKanbanKeyDown(event: React.KeyboardEvent<HTMLElement>) {
  const step = STEP[event.key]
  if (
    !step ||
    event.defaultPrevented ||
    event.ctrlKey ||
    event.altKey ||
    event.metaKey ||
    event.shiftKey
  )
    return
  const active = event.target
  if (!(active instanceof HTMLElement) || active.closest(OWN_ARROWS)) return
  const card = active.closest<HTMLElement>(CARD)
  if (!card || !event.currentTarget.contains(card)) return
  // На краю дошки стрілка теж нічого не прокручує: фокус лишається, сторінка не стрибає.
  event.preventDefault()
  event.stopPropagation()
  const target = targetCard(event.currentTarget, card, step)
  if (!target) return
  const from = focusablesOf(card).indexOf(active)
  const options = focusablesOf(target)
  options[Math.min(Math.max(from, 0), options.length - 1)]?.focus()
}
