import { useEffect } from "react"

const MAX_SHOWN = 99

/**
 * Лічильник у назві вкладки (ADR-0046, PF19): «(3) Рахунки». Назву ставлять сторінки самі, щоразу
 * заново, тож хук стежить за нею й повертає лічильник. Знімає лише свій початок: назву, яку проект
 * почав із дужок сам, не чіпає. 0 — хук нічого не робить.
 */
export function useTabCounter(count: number): void {
  useEffect(() => {
    if (count <= 0) return
    const prefix = `(${count > MAX_SHOWN ? `${MAX_SHOWN}+` : count}) `
    const apply = () => {
      if (!document.title.startsWith(prefix))
        document.title = prefix + document.title
    }
    apply()
    const observer = new MutationObserver(apply)
    observer.observe(document.head, {
      childList: true,
      subtree: true,
      characterData: true,
    })
    return () => {
      observer.disconnect()
      if (document.title.startsWith(prefix))
        document.title = document.title.slice(prefix.length)
    }
  }, [count])
}
