/**
 * Прогрес майстра UI06 (SPEC §7, шаблон Wizard; ADR-0043): на якому кроці людина й до якого дійшла.
 *
 * Майстер не вирішує, де лежить прогрес: це може бути сервер (перший запуск, A1) чи браузер (імпорт,
 * A4). Для браузера — `loadWizardProgress` і `saveWizardProgress`:
 *
 *   const saved = loadWizardProgress<Values>(key)
 *   useWizard({ initial: saved ?? undefined, onProgress: (p) => { saveWizardProgress(key, { ...p, draft }) } })
 *
 * Ключ містить компанію й людину, щоб чернетка не перейшла до іншої. Чернетка лежить у браузері
 * відкрито: паролів і токенів у неї не кладуть.
 */
export interface WizardProgress<TDraft = unknown> {
  readonly stepId: string
  /** Найдальший відкритий крок: на нього й на попередні можна повернутись. */
  readonly reachedIndex: number
  /** Введене в майстрі: те, що проект хоче відновити після перезавантаження. */
  readonly draft?: TDraft
}

const STORAGE_PREFIX = "erp-ui:wizard:"

const isProgress = (value: unknown): value is WizardProgress => {
  if (typeof value !== "object" || value === null) return false
  const { stepId, reachedIndex } = value as Partial<WizardProgress>
  return (
    typeof stepId === "string" &&
    Number.isInteger(reachedIndex) &&
    (reachedIndex as number) >= 0
  )
}

/** Збережений прогрес; немає чи пошкоджений — `null`, майстер почнеться спочатку. */
export function loadWizardProgress<TDraft>(
  key: string,
): WizardProgress<TDraft> | null {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_PREFIX + key)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    return isProgress(parsed) ? (parsed as WizardProgress<TDraft>) : null
  } catch {
    // Сховище недоступне чи запис пошкоджений: майстер працює, прогрес — до перезавантаження.
    return null
  }
}

export function saveWizardProgress(
  key: string,
  progress: WizardProgress,
): void {
  try {
    globalThis.localStorage?.setItem(
      STORAGE_PREFIX + key,
      JSON.stringify(progress),
    )
  } catch {
    // Без сховища (приватний режим, переповнення) — до перезавантаження.
  }
}

export function clearWizardProgress(key: string): void {
  try {
    globalThis.localStorage?.removeItem(STORAGE_PREFIX + key)
  } catch {
    // Сховище недоступне: прибирати нічого.
  }
}
