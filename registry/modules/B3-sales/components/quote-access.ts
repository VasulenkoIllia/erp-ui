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
 * й скасована пояснюються мовою модуля: «Надіслану пропозицію не змінюють…». Інші причини — кіта.
 */
export function useQuoteAccess(action: string, record: unknown): RecordAccess {
  const t = useSalesT()
  const access = useRecordAccess({ resource: QUOTES, action, record })
  const code = recordDenial(record, action)
  return access.recordReason !== undefined && isLifecycleCode(code)
    ? { ...access, recordReason: t(`quote.locked.${code}`) }
    : access
}
