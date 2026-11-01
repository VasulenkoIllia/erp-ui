/**
 * Повне оновлення сторінки, коли лінивий чанк не завантажився (ADR-0055). Окремо від `erp/form`:
 * межа помилок стоїть у вхідному чанку, а знати про незбережені зміни їй треба без форм.
 *
 * - `holdUnsavedChanges()` — є незбережені зміни, поки не викликали повернене скасування. Це робить
 *   `UnsavedChangesGuard`; власна форма без нього викликає сама.
 * - `reloadPage()` оновлює сторінку й лишає мітку: запит браузера `beforeunload` пропускається, бо
 *   людина вже погодилась на місці (`ReloadPageAction`), а Safari на iOS такого запиту не показує.
 * - `reloadDidNotHelp()` — ця адреса щойно оновлювалась, а чанк знову не прийшов. Тоді кнопку не
 *   показуємо: те саме оновлення дасть той самий збій. Мітка живе хвилину, тож кнопка повертається,
 *   щойно деплой доїхав. Без сховища мітки немає, і кнопка лишається: оновлює лише людина.
 */
const RELOAD_MARK_KEY = "erp-ui:page-reload"
/** Скільки після оновлення збій тієї самої адреси вважаємо тим самим збоєм. */
const RELOAD_WINDOW_MS = 60_000

let unsavedHolds = 0
let isReloading = false

export function holdUnsavedChanges(): () => void {
  unsavedHolds += 1
  let isHeld = true
  return () => {
    if (!isHeld) return
    isHeld = false
    unsavedHolds -= 1
  }
}

export function hasUnsavedChanges(): boolean {
  return unsavedHolds > 0
}

/** Для `beforeunload`: це оновлення людина вже підтвердила на місці. */
export function isPageReloading(): boolean {
  return isReloading
}

function rememberReload(): void {
  try {
    sessionStorage.setItem(
      RELOAD_MARK_KEY,
      JSON.stringify({ at: Date.now(), url: location.href }),
    )
  } catch {
    // Без сховища лишається кнопка: оновлює лише людина, тож циклу немає.
  }
}

export function reloadPage(): void {
  isReloading = true
  // Після всіх захистів: якщо чужий запит браузера скасували, закриття вкладки знову попередить.
  window.addEventListener(
    "beforeunload",
    () => {
      isReloading = false
    },
    { once: true },
  )
  // Мітка лише тоді, коли сторінка справді пішла: той самий чужий запит людина могла відхилити.
  window.addEventListener("pagehide", rememberReload, { once: true })
  location.reload()
}

export function reloadDidNotHelp(): boolean {
  try {
    const mark = JSON.parse(
      sessionStorage.getItem(RELOAD_MARK_KEY) ?? "null",
    ) as { at?: unknown; url?: unknown } | null
    if (typeof mark?.at !== "number" || mark.url !== location.href) return false
    // Годинник могли перевести назад: мітка з майбутнього не має ховати кнопку назавжди.
    const ageMs = Date.now() - mark.at
    return ageMs >= 0 && ageMs < RELOAD_WINDOW_MS
  } catch {
    return false
  }
}
