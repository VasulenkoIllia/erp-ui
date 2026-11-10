import { useCallback } from "react"

import { useRecordAccess, type RecordAccess } from "@/hooks/use-record-access"
import { recordDenial } from "@/lib/record-access"

import { INVOICES } from "../contract"
import { useInvoicesT } from "../use-invoices-t"

/** Позначки життєвого циклу, які модуль пояснює словами рахунку, а не документа кіта. */
const LIFECYCLE_CODES = ["submitted", "cancelled"] as const
type LifecycleCode = (typeof LIFECYCLE_CODES)[number]
const isLifecycleCode = (code: string | undefined): code is LifecycleCode =>
  (LIFECYCLE_CODES as readonly (string | undefined)[]).includes(code)

/**
 * Дія над рахунком (ADR-0037): право ролі й позначка сервера, як `useRecordAccess`, але виставлений і
 * скасований рахунок пояснюються мовою модуля: «Виставлений рахунок не змінюють…». Інші причини (закритий
 * період, сторно) — кіта.
 */
export function useInvoiceAccess(
  action: string,
  record: unknown,
): RecordAccess {
  const lifecycleReason = useInvoiceLockedReason()
  const access = useRecordAccess({ resource: INVOICES, action, record })
  const code = recordDenial(record, action)
  const reason = code === undefined ? undefined : lifecycleReason(action, code)
  return access.recordReason !== undefined && reason !== undefined
    ? { ...access, recordReason: reason }
    : access
}

/**
 * Причина заборони станом рахунку словами модуля (`submitted`, `cancelled`) для дії `action`: видалення —
 * свої тексти, решта дій — «не змінюють». Інший код — `undefined`, текст кіта. Для картки, панелі дій і
 * звіту масової дії.
 */
export function useInvoiceLockedReason() {
  const t = useInvoicesT()
  // Стабільна між рендерами: панель дій і `useRecordDenialReason` мемоізують причину за нею.
  return useCallback(
    (action: string, code: string): string | undefined => {
      if (!isLifecycleCode(code)) return undefined
      return action === "delete"
        ? t(`invoice.delete.locked.${code}`)
        : t(`invoice.locked.${code}`)
    },
    [t],
  )
}
