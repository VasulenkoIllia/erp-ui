/**
 * Чи можна дію над конкретним записом (ADR-0037): право ролі (`useCanAccess` ra-core, ADR-0014) і
 * позначка сервера на записі (`deniedActions`, lib/record-access). Причина заборони запису — текстом
 * мовою інтерфейсу: кнопку показують неактивною з нею (SPEC §8.4). Немає права ролі — причину дає
 * модуль своїм текстом («Немає права змінювати організації»), як і раніше.
 */
import { useCanAccess } from "ra-core"
import { useCallback } from "react"

import { kitAction } from "@/registry/lib/auth"
import { useErpUiT } from "@/registry/lib/i18n"
import { isKnownDenialReason, recordDenial } from "@/registry/lib/record-access"

export interface RecordAccess {
  /** Права ролі ще невідомі: дії поки немає, а не «немає доступу», що за мить стане кнопкою. */
  readonly isPending: boolean
  /** Дію можна: право ролі є, і запис її не забороняє. */
  readonly canAccess: boolean
  /** Чому запис забороняє дію; без права ролі чи без заборони запису — `undefined`. */
  readonly recordReason?: string
}

/**
 * Текст причини, з якої запис забороняє дію (`edit` зводиться до `update`), або `undefined`.
 * Для колонок списку: хук викликають раз, а функцію — у комірці кожного рядка.
 */
export function useRecordDenialReason(): (
  record: unknown,
  action: string,
) => string | undefined {
  const t = useErpUiT()
  return useCallback(
    (record, action) => {
      const code = recordDenial(record, kitAction(action))
      if (code === undefined) return undefined
      return isKnownDenialReason(code)
        ? t(`recordAccess.${code}`)
        : t("recordAccess.denied")
    },
    [t],
  )
}

/** Дія ресурсу над записом: право ролі й позначка сервера; `record` — `undefined`, поки запису немає. */
export function useRecordAccess({
  resource,
  action,
  record,
}: {
  resource: string
  action: string
  record: unknown
}): RecordAccess {
  const { canAccess = false, isPending } = useCanAccess({ resource, action })
  const recordReason = useRecordDenialReason()(record, action)
  // Без права ролі причину пояснює модуль: заборона запису тут нічого не додає.
  return canAccess
    ? { isPending, canAccess: !recordReason, recordReason }
    : { isPending, canAccess: false }
}
