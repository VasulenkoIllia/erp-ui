import { Link } from "react-router"

import { DeniedAction } from "@/registry/erp/permission-gate"
import {
  useRecordAccess,
  type RecordDenialText,
} from "@/registry/hooks/use-record-access"
import { ACTION_ICONS } from "@/registry/lib/icons"
import { buttonVariants } from "@/registry/ui/button"

/**
 * Перехід на сторінку форми з правом `<ресурс>:<дія>` (ADR-0014, ADR-0086): «Створити рахунок» у шапці
 * списку, «Змінити» й «Копіювати» в шапці картки. Без права, з позначкою сервера на записі (проведений
 * документ, ADR-0037) чи поки запис редагує інша людина (ADR-0051) — неактивна кнопка з причиною
 * (SPEC §8.4); поки права невідомі — нічого. Чанк форми — заздалегідь, щойно на посилання навели чи
 * сфокусувались (`preload` модуля). Форма документа — сторінкою, а не діалогом: документ буває на сотні
 * рядків.
 *
 *   <AccessLink resource={INVOICES} action="update" record={invoice} moduleText={lockedReason}
 *     to={paths.edit(id)} preload={preload} icon="edit" label={t("invoice.edit")}
 *     deniedReason={t("invoice.editDenied")} lockReason={lock.reason} />
 */
export function AccessLink({
  resource,
  action,
  to,
  preload,
  icon,
  label,
  deniedReason,
  variant = "outline",
  record,
  moduleText,
  lockReason,
}: {
  resource: string
  action: "create" | "update"
  to: string
  /** Прогріти чанк сторінки за адресою (`preload` хука модуля). */
  preload: (pathname: string) => void
  icon: keyof typeof ACTION_ICONS
  label: string
  /** Причина без права ролі словами модуля: «Немає права змінювати рахунки». */
  deniedReason: string
  variant?: "default" | "outline"
  /** Запис, над яким дія: його позначка сервера теж забороняє дію. */
  record?: unknown
  /** Слова модуля для кодів позначки сервера (`useRecordAccess`). */
  moduleText?: RecordDenialText | undefined
  /** Запис редагує інша людина (`useEditLock`). */
  lockReason?: string | undefined
}) {
  const { canAccess, isPending, recordReason } = useRecordAccess({
    resource,
    action,
    record,
    moduleText,
  })
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
  const warm = () => {
    preload(to)
  }
  return (
    <Link
      to={to}
      className={buttonVariants({ variant })}
      onPointerEnter={warm}
      onFocus={warm}
    >
      <Icon aria-hidden />
      {label}
    </Link>
  )
}
