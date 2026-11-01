import * as React from "react"
import { createPortal } from "react-dom"

import { KeptOverTabsContext } from "@/registry/hooks/use-tab-param"

/**
 * Частина templates/object-page: вміст, що живе, доки відкрита картка (ADR-0054). Вузька й широка
 * розкладки картки різні, а вкладка монтує лише себе, тож без цього стрічка зникала б разом із
 * написаним, щойно людина глянула на іншу вкладку чи повернула планшет. Вміст один раз монтується в
 * окремий вузол через портал, а вузол переходить туди, де стрічку зараз видно. Поки її не показували,
 * вмісту немає: запити не йдуть, поки людина не відкрила вкладку.
 */
export function useKeptContent(content: React.ReactNode, isEnabled: boolean) {
  const [host] = React.useState(() => document.createElement("div"))
  const [isOpened, setIsOpened] = React.useState(false)
  const attach = React.useCallback(
    (place: HTMLDivElement | null) => {
      if (!place) return
      place.append(host)
      setIsOpened(true)
      return () => {
        host.remove()
      }
    },
    [host],
  )
  if (!isEnabled) return { slot: content, portal: null }
  return {
    slot: <div ref={attach} data-slot="object-page-kept" />,
    portal: isOpened
      ? createPortal(
          <KeptOverTabsContext value={true}>{content}</KeptOverTabsContext>,
          host,
        )
      : null,
  }
}
