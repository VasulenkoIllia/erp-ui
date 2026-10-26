import { ArrowLeftIcon } from "lucide-react"
import type { ReactNode } from "react"
import { Link, useLocation } from "react-router"

import { buttonVariants } from "@/registry/ui/button"

/**
 * Посилання між сторінками модуля на React Router (ADR-0019, ADR-0025): зі списку на картку — з
 * адресою списку в стані переходу, тож «До списку» на картці повертає вкладку, фільтри й вид; чанк
 * картки — заздалегідь, щойно на посилання навели чи сфокусувались (`preload`, ADR-0009).
 *
 *   <RecordLink to={paths.contact(id)} preload={preload} fromList>{name}</RecordLink>
 *   <BackToList to={paths.contacts} label="До контактів" />
 */

interface ListLinkState {
  readonly listSearch: string
}

/** Рядок запиту списку зі стану переходу; чужий чи зіпсований стан — список без параметрів. */
function listSearchOf(state: unknown): string {
  if (typeof state !== "object" || state === null || !("listSearch" in state))
    return ""
  const { listSearch } = state
  return typeof listSearch === "string" && listSearch.startsWith("?")
    ? listSearch
    : ""
}

export function RecordLink({
  to,
  preload,
  fromList = false,
  children,
}: {
  to: string
  /** Прогріти чанк сторінки за адресою (`preload` фабрики модуля). */
  preload?: (pathname: string) => void
  /**
   * Посилання зі списку на картку: адреса списку (вкладка, пошук, вид) — у стані переходу для «До
   * списку». Читає її саме посилання, а не колонки: інакше кожна зміна адреси перебудовувала б таблицю.
   */
  fromList?: boolean
  children: ReactNode
}) {
  const { search } = useLocation()
  const warm = () => {
    preload?.(to)
  }
  return (
    <Link
      to={to}
      state={
        fromList ? ({ listSearch: search } satisfies ListLinkState) : undefined
      }
      onPointerEnter={warm}
      onFocus={warm}
      // Ціль дотику ≥ 24 px (WCAG 2.5.8).
      className="touch-target relative inline-flex min-h-7 items-center font-medium underline underline-offset-4"
    >
      {children}
    </Link>
  )
}

/** «До списку» з фільтрами, з якими список відкрив картку, а не `history.back()`. */
export function BackToList({ to, label }: { to: string; label: string }) {
  const state: unknown = useLocation().state
  return (
    <Link
      to={`${to}${listSearchOf(state)}`}
      className={buttonVariants({ variant: "ghost", size: "sm" })}
    >
      <ArrowLeftIcon aria-hidden />
      {label}
    </Link>
  )
}
