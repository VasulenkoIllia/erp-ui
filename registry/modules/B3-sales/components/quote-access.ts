import { useRecordAccess, type RecordAccess } from "@/hooks/use-record-access"
import { recordDenial } from "@/lib/record-access"

import { QUOTES } from "../contract"
import { useSalesT } from "../use-sales-t"

/** Позначки життєвого циклу, які модуль пояснює словами пропозиції, а не документа кіта зі сторно. */
const LIFECYCLE_CODES = ["submitted", "cancelled"] as const
type LifecycleCode = (typeof LIFECYCLE_CODES)[number]
const isLifecycleCode = (code: string | undefined): code is LifecycleCode =>
  (LIFECYCLE_CODES as readonly (string | undefined)[]).includes(code)

/**
 * Дія над пропозицією (ADR-0037): право ролі й позначка сервера, як `useRecordAccess`, але надіслана
 * й скасована пояснюються мовою модуля: «Надіслану пропозицію не змінюють…», а для видалення —
 * «Надіслану пропозицію не видаляють: скасуйте її». Інші причини — кіта.
 */
export function useQuoteAccess(action: string, record: unknown): RecordAccess {
  const lifecycleReason = useQuoteLockedReason()
  const access = useRecordAccess({ resource: QUOTES, action, record })
  const code = recordDenial(record, action)
  const reason = code === undefined ? undefined : lifecycleReason(action, code)
  return access.recordReason !== undefined && reason !== undefined
    ? { ...access, recordReason: reason }
    : access
}

/**
 * Причина заборони станом пропозиції словами модуля (`submitted`, `cancelled`) для дії `action`:
 * видалення — свої тексти, решта дій — «не змінюють». Інший код — `undefined`, текст кіта. Для картки й
 * звіту масової дії.
 */
export function useQuoteLockedReason() {
  const t = useSalesT()
  return (action: string, code: string): string | undefined => {
    if (!isLifecycleCode(code)) return undefined
    return action === "delete"
      ? t(`quote.delete.locked.${code}`)
      : t(`quote.locked.${code}`)
  }
}
