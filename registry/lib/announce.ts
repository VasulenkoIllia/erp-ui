/**
 * Оголошення для скрінрідера через постійний live-регіон (WCAG 4.1.3, SPEC §10).
 *
 * Новий елемент із `role="status"` скрінрідери часто не озвучують: регіон має бути в DOM до того,
 * як у ньому зміниться текст. Тому один прихований регіон живе в `document.body` весь час, а
 * `announce` міняє в ньому текст. Для станів, що з'являються й зникають (fallback лінивого чанка,
 * палітри), — `erp/page-state` → `LoadingFallback`.
 */

const REGION_ID = "erp-ui-announcer"
/** Регіон щойно створено — скрінрідер має встигнути його побачити до зміни тексту. */
const UPDATE_DELAY_MS = 100

let timer: ReturnType<typeof setTimeout> | undefined

function region(): HTMLElement {
  const existing = document.getElementById(REGION_ID)
  if (existing) return existing
  const created = document.createElement("div")
  created.id = REGION_ID
  created.setAttribute("role", "status")
  created.setAttribute("aria-live", "polite")
  created.setAttribute("aria-atomic", "true")
  created.className = "sr-only"
  document.body.append(created)
  return created
}

/**
 * Озвучити `message`. Повертає скасування: якщо оголошення ще не прозвучало — не прозвучить, а якщо
 * прозвучало — текст прибирається з регіону (скрінрідер у режимі перегляду не натрапить на
 * застаріле «Завантаження»).
 */
export function announce(message: string): () => void {
  if (typeof document === "undefined") return () => undefined
  const target = region()
  clearTimeout(timer)
  // Спершу порожньо: той самий текст удруге теж прозвучить.
  target.textContent = ""
  const own = setTimeout(() => {
    target.textContent = message
  }, UPDATE_DELAY_MS)
  timer = own
  return () => {
    if (timer === own) clearTimeout(own)
    if (target.textContent === message) target.textContent = ""
  }
}
