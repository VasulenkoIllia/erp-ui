import { useCallback } from "react"

import { useRecordAccess, type RecordAccess } from "@/hooks/use-record-access"
import { RECORD_DENIAL_REASONS } from "@/lib/record-access"

import { CREATE_INVOICE, CREATE_ORDER } from "../contract"
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
  return useRecordAccess({
    resource: kind.resource,
    action,
    record,
    moduleText: useSalesLockedReason(kind),
  })
}

/**
 * Причина заборони станом документа словами модуля (`submitted`, `cancelled`, `linked`) для дії
 * `action`: видалення — свої тексти, решта дій — «не змінюють»; `linked` — є документ, створений із
 * цього (замовлення з пропозиції, ADR-0067; рахунок із замовлення, ADR-0070): створити вдруге — «уже
 * створено», решта дій — «спершу скасуйте». Інший код — `undefined`, текст кіта. Для картки, панелі дій і звіту масової дії.
 */
export function useSalesLockedReason(kind: SalesKindBase) {
  const t = useSalesT()
  const { record } = kind.keys
  // Стабільна між рендерами: панель дій і `useRecordDenialReason` мемоізують причину за нею.
  return useCallback(
    (action: string, code: string): string | undefined => {
      if (code === RECORD_DENIAL_REASONS.linked) {
        if (record === "quote" && action === CREATE_ORDER)
          return t("quote.order.exists")
        if (record === "order" && action === CREATE_INVOICE)
          return t("order.invoice.exists")
        return t(`${record}.locked.linked`)
      }
      if (!isLifecycleCode(code)) return undefined
      return action === "delete"
        ? t(`${record}.delete.locked.${code}`)
        : t(`${record}.locked.${code}`)
    },
    [t, record],
  )
}
