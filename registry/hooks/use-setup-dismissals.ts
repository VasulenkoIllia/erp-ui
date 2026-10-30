import * as React from "react"

/**
 * Пункти чек-листа «Почніть роботу» з вибором «Не потрібно» (PF12, ADR-0044). Вибір лежить у браузері,
 * як вимикач клавіші «?» (ADR-0042): контракт сервера не змінюється. Сховище недоступне — вибір діє,
 * поки чек-лист на екрані: пункт просто з'явиться знову.
 */
const STORAGE_PREFIX = "erp-ui:setup-dismissed:"

function read(scope: string): ReadonlySet<string> {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_PREFIX + scope)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return new Set(
      Array.isArray(parsed)
        ? parsed.filter((id): id is string => typeof id === "string")
        : [],
    )
  } catch {
    return new Set()
  }
}

function write(scope: string, ids: ReadonlySet<string>) {
  try {
    globalThis.localStorage?.setItem(
      STORAGE_PREFIX + scope,
      JSON.stringify([...ids]),
    )
  } catch {
    // Без сховища вибір діє, поки чек-лист на екрані.
  }
}

/** `scope` — компанія: вибір однієї не переходить на іншу. Інший `scope` — новий `key` компонента. */
export function useSetupDismissals(scope: string) {
  const [dismissedIds, setDismissedIds] = React.useState(() => read(scope))
  const change = (next: ReadonlySet<string>) => {
    setDismissedIds(next)
    write(scope, next)
  }
  return {
    dismissedIds,
    dismiss: (id: string) => {
      change(new Set([...dismissedIds, id]))
    },
    restore: (id: string) => {
      change(new Set([...dismissedIds].filter((item) => item !== id)))
    },
  }
}
