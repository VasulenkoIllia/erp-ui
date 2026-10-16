import { ArrowLeftIcon } from "lucide-react"
import { Link, useLocation } from "react-router"

import { buttonVariants } from "@/registry/ui/button"

import { listSearchOf } from "@/router"

/**
 * «До списку …» на картці запису: з фільтрами, видом і вкладкою, з якими список відкрив картку
 * (стан переходу `listSearch`), а не `history.back()` — картку могли відкрити з посилання (ADR-0019).
 */
export function BackLink({ to, label }: { to: string; label: string }) {
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
