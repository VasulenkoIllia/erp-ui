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
  return () => {
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

export function reloadPage(): void {
  try {
    sessionStorage.setItem(
      RELOAD_MARK_KEY,
      JSON.stringify({ at: Date.now(), url: location.href }),
    )
  } catch {
    // Без сховища лишається кнопка: оновлює лише людина, тож циклу немає.
  }
  isReloading = true
  // Після всіх захистів: якщо чужий запит браузера скасували, закриття вкладки знову попередить.
  window.addEventListener(
    "beforeunload",
    () => {
      isReloading = false
    },
    { once: true },
  )
  location.reload()
}

export function reloadDidNotHelp(): boolean {
  try {
    const mark = JSON.parse(
      sessionStorage.getItem(RELOAD_MARK_KEY) ?? "null",
    ) as { at?: unknown; url?: unknown } | null
    return (
      typeof mark?.at === "number" &&
      mark.url === location.href &&
      Date.now() - mark.at < RELOAD_WINDOW_MS
    )
  } catch {
    return false
  }
}
