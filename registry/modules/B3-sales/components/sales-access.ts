import { useRecordAccess, type RecordAccess } from "@/hooks/use-record-access"
import { recordDenial } from "@/lib/record-access"

import type { SalesKindBase } from "../sales-kinds"
import { useSalesT } from "../use-sales-t"

/** Позначки життєвого циклу, які модуль пояснює словами документа продажу, а не документа кіта зі сторно. */
const LIFECYCLE_CODES = ["submitted", "cancelled"] as const
type LifecycleCode = (typeof LIFECYCLE_CODES)[number]
const isLifecycleCode = (code: string | undefined): code is LifecycleCode =>
  (LIFECYCLE_CODES as readonly (string | undefined)[]).includes(code)

/**
 * Дія над документом продажу (ADR-0037): право ролі й позначка сервера, як `useRecordAccess`, але
 * проведений і скасований документ пояснюються мовою модуля: «Надіслану пропозицію не змінюють…»,
 * «Підтверджене замовлення не видаляють: скасуйте його». Інші причини — кіта.
 */
export function useSalesAccess(
  kind: SalesKindBase,
  action: string,
  record: unknown,
): RecordAccess {
  const lifecycleReason = useSalesLockedReason(kind)
  const access = useRecordAccess({ resource: kind.resource, action, record })
  const code = recordDenial(record, action)
  const reason = code === undefined ? undefined : lifecycleReason(action, code)
  return access.recordReason !== undefined && reason !== undefined
    ? { ...access, recordReason: reason }
    : access
}

/**
 * Причина заборони станом документа словами модуля (`submitted`, `cancelled`) для дії `action`:
 * видалення — свої тексти, решта дій — «не змінюють». Інший код — `undefined`, текст кіта. Для картки й
 * звіту масової дії.
 */
export function useSalesLockedReason(kind: SalesKindBase) {
  const t = useSalesT()
  const { record } = kind.keys
  return (action: string, code: string): string | undefined => {
    if (!isLifecycleCode(code)) return undefined
    return action === "delete"
      ? t(`${record}.delete.locked.${code}`)
      : t(`${record}.locked.${code}`)
  }
}
