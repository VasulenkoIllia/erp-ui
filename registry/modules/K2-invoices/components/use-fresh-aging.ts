import { useQueryClient } from "@tanstack/react-query"
import { useState } from "react"

import { INVOICE_AGING } from "../contract"

/**
 * Звіт боргів свіжий на кожному відкритті сторінки (ADR-0084): оплати, повернення й кредит-ноти змінюють борг
 * на інших сторінках, а їхні мутації скидають кеш `sales-invoices`, не підресурсу `aging`. Кеш звіту стає
 * застарілим ще до монтування таблиці (ледачий початковий стан, а не ефект): запит таблиці під час монтування
 * сам перечитує дані без другого запиту, а збережені рядки видно до відповіді.
 */
export function useFreshAging() {
  const queryClient = useQueryClient()
  useState(() => {
    void queryClient.invalidateQueries({
      queryKey: [INVOICE_AGING],
      refetchType: "none",
    })
  })
}
