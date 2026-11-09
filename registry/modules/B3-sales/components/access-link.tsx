import { Link } from "react-router"

import { DeniedAction } from "@/components/erp/permission-gate"
import { buttonVariants } from "@/components/ui/button"
import { ACTION_ICONS } from "@/lib/icons"

import { useSalesModule } from "../module-context"
import type { SalesKindBase } from "../sales-kinds"
import { useSalesAccess } from "./sales-access"

/**
 * Перехід на сторінку форми з правом `<ресурс>:<дія>` (ADR-0014): «Створити пропозицію» чи «Створити
 * замовлення» в шапці списку, «Змінити» в шапці картки. Без права, з позначкою сервера на записі
 * (проведений документ, ADR-0037) чи поки запис редагує інша людина (ADR-0051) — неактивна кнопка з
 * причиною (SPEC §8.4); поки права невідомі — нічого. Форма — сторінкою, а не діалогом: документ
 * буває на сотні рядків.
 */
export function AccessLink({
  kind,
  action,
  to,
  icon,
  label,
  deniedReason,
  variant = "outline",
  record,
  lockReason,
}: {
  kind: SalesKindBase
  action: "create" | "update"
  to: string
  icon: keyof typeof ACTION_ICONS
  label: string
  deniedReason: string
  variant?: "default" | "outline"
  /** Запис, над яким дія: його позначка сервера теж забороняє дію. */
  record?: unknown
  /** Запис редагує інша людина (`useEditLock`). */
  lockReason?: string | undefined
}) {
  const { preload } = useSalesModule()
  const { canAccess, isPending, recordReason } = useSalesAccess(
    kind,
    action,
    record,
  )
  const Icon = ACTION_ICONS[icon]
  if (isPending) return null
  const reason = canAccess ? lockReason : (recordReason ?? deniedReason)
  if (reason !== undefined)
    return (
      <DeniedAction reason={reason} variant={variant}>
        <Icon aria-hidden />
        {label}
      </DeniedAction>
    )
  return (
    <Link
      to={to}
      className={buttonVariants({ variant })}
      onPointerEnter={() => {
        preload(to)
      }}
      onFocus={() => {
        preload(to)
      }}
    >
      <Icon aria-hidden />
      {label}
    </Link>
  )
}
