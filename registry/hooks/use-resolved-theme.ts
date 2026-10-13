import { useSyncExternalStore } from "react"

export type ResolvedTheme = "light" | "dark"

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  })
  return () => {
    observer.disconnect()
  }
}

function getSnapshot(): ResolvedTheme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light"
}

/**
 * Тема, яку зараз показує <html> (клас `dark`, SPEC §6.2).
 * Не залежить від того, хто перемикає тему, тож компоненти реєстру не тягнуть next-themes.
 */
export function useResolvedTheme(): ResolvedTheme {
  return useSyncExternalStore(subscribe, getSnapshot, () => "light")
}
