/**
 * Сеанс редагування запису на сторінці форми (SPEC §8.2, ADR-0051, ADR-0086): право й позначка сервера
 * (`access`) разом із блокуванням «Редагує …» на час сторінки. Форма лише для читання з причиною, поки
 * немає права, запис забороняє зміну чи його редагує інша людина, і поки перше взяття блокування не
 * відповіло: введене до відмови пропало б.
 *
 *   const access = useInvoiceAccess(INVOICE_KIND, "update", invoice)
 *   const session = useEditSession({ resource: INVOICES, id, access, hasRecord: Boolean(invoice),
 *     deniedReason: t("invoice.editDenied"), enabled: extension.invoices?.editLock !== false })
 *   <EditLockNotice holder={session.holder} />
 *   <InvoiceForm readOnly={session.readOnly} readOnlyReason={session.reason} mayEdit={session.mayEdit} />
 *
 * - Блокування береться, щойно право відоме й запис вільний; відпускає його `useEditLock`, коли сторінку
 *   покинули. Інша людина відпустила запис — береться знову, інакше форма стала б доступною без нього.
 * - Збій блокування не заважає редагувати (`useEditLock`): дані береже версія запису.
 * - Хук прив'язаний до запису на весь час життя: сторінка має `key={id}`.
 */
import { useEffect, useEffectEvent, useState } from "react"

import { useEditLock } from "@/registry/hooks/use-edit-lock"
import type { RecordAccess } from "@/registry/hooks/use-record-access"
import type { EditLockHolder } from "@/registry/lib/edit-lock"

export interface UseEditSessionOptions {
  readonly resource: string
  readonly id: string
  /** Право `update` і позначка сервера на записі (`useRecordAccess` чи хук модуля поверх нього). */
  readonly access: RecordAccess
  /** Запис уже прийшов: до того нічого не береться. */
  readonly hasRecord: boolean
  /** Причина без права ролі: «Немає права змінювати рахунки». */
  readonly deniedReason: string
  /** `false` — проект вимкнув блокування цього ресурсу (`editLock: false` у розширенні). */
  readonly enabled?: boolean
}

export interface EditSession {
  /** Права ще невідомі: форму поки не показують. */
  readonly isPending: boolean
  /** Хто редагує запис, якщо не я: для `EditLockNotice`. */
  readonly holder: EditLockHolder | null
  /** Право є, і запис не забороняє зміну: кнопки, яким потрібна зміна, видно. */
  readonly mayEdit: boolean
  /** Чому форма лише для читання: немає права, заборона запису чи «Редагує …»; поки право невідоме — немає. */
  readonly reason: string | undefined
  /** Форма лише для читання: причина є, блокування береться чи перше взяття ще не відповіло. */
  readonly readOnly: boolean
}

export function useEditSession({
  resource,
  id,
  access,
  hasRecord,
  deniedReason,
  enabled = true,
}: UseEditSessionOptions): EditSession {
  const lock = useEditLock({ resource, id, enabled })
  const mayEdit = hasRecord && !access.isPending && access.canAccess
  const [isLockSettled, setLockSettled] = useState(false)
  const acquire = useEffectEvent(() => lock.acquire())
  const isFree = lock.holder === null
  useEffect(() => {
    if (!mayEdit || !isFree) return
    const settle = () => {
      setLockSettled(true)
    }
    void acquire().then(settle, settle)
  }, [mayEdit, isFree])
  const reason = access.isPending
    ? undefined
    : access.canAccess
      ? lock.reason
      : (access.recordReason ?? deniedReason)
  return {
    isPending: access.isPending,
    holder: lock.holder,
    mayEdit,
    reason,
    readOnly:
      reason !== undefined || lock.isAcquiring || (mayEdit && !isLockSettled),
  }
}
