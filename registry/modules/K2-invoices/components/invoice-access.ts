import { useCallback } from "react"

import { useRecordAccess, type RecordAccess } from "@/hooks/use-record-access"
import { RECORD_DENIAL_REASONS, recordDenial } from "@/lib/record-access"

import type { K2DocumentKind } from "../document-kind"
import { useInvoicesT } from "../use-invoices-t"

/**
 * Позначки, які модуль пояснює словами документа, а не кіта: проведений і скасований документ, рахунок із
 * виставленою кредит-нотою (`linked`), повністю покритий рахунок і чернетка кредит-ноти, яку вже не
 * виставити (ADR-0072).
 */
const LOCKED_CODES = {
  invoice: ["submitted", "cancelled", RECORD_DENIAL_REASONS.linked, "credited"],
  creditNote: ["submitted", "cancelled", "exceeds_invoice", "invoice_inactive"],
} as const
type LockedCode<K extends K2DocumentKind["key"]> =
  (typeof LOCKED_CODES)[K][number]
/** Коди видалення: свої тексти «не видаляють». */
const DELETE_CODES = ["submitted", "cancelled"] as const

/**
 * Дія над документом (ADR-0037): право ролі й позначка сервера, як `useRecordAccess`, але проведений і
 * скасований документ пояснюються мовою модуля: «Виставлений рахунок не змінюють…». Інші причини
 * (закритий період, сторно) — кіта.
 */
export function useDocumentAccess(
  kind: K2DocumentKind,
  action: string,
  record: unknown,
): RecordAccess {
  const lockedReason = useDocumentLockedReason(kind)
  const access = useRecordAccess({ resource: kind.resource, action, record })
  const code = recordDenial(record, action)
  const reason = code === undefined ? undefined : lockedReason(action, code)
  return access.recordReason !== undefined && reason !== undefined
    ? { ...access, recordReason: reason }
    : access
}

/**
 * Причина заборони словами модуля для дії `action` за кодом позначки: видалення — свої тексти, решта дій —
 * «не змінюють» чи причина документа. Інший код — `undefined`, текст кіта. Для картки, панелі дій і звіту
 * масової дії.
 */
export function useDocumentLockedReason(kind: K2DocumentKind) {
  const t = useInvoicesT()
  const { key } = kind
  // Стабільна між рендерами: панель дій і `useRecordDenialReason` мемоізують причину за нею.
  return useCallback(
    (action: string, code: string): string | undefined => {
      const codes: readonly string[] = LOCKED_CODES[key]
      if (!codes.includes(code)) return undefined
      if (action === "delete")
        return (DELETE_CODES as readonly string[]).includes(code)
          ? t(`${key}.delete.locked.${code as (typeof DELETE_CODES)[number]}`)
          : undefined
      return key === "invoice"
        ? t(`invoice.locked.${code as LockedCode<"invoice">}`)
        : t(`creditNote.locked.${code as LockedCode<"creditNote">}`)
    },
    [t, key],
  )
}
