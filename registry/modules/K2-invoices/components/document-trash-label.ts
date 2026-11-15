import { useFormat } from "@/lib/format"

import type { K2Document } from "../contract"
import type { K2DocumentKey } from "../document-kind"
import { useInvoicesT } from "../use-invoices-t"

/** Рядки списку виду документа: `invoices.*` чи `creditNotes.*`. */
const LIST_KEYS = {
  invoice: "invoices",
  creditNote: "creditNotes",
} as const satisfies Record<K2DocumentKey, string>

/** Назва рахунку чи кредит-ноти в кошику й у «Відновлено: …»: номер, у чернетки — клієнт і дата (ADR-0095). */
export function useDocumentTrashLabel(key: K2DocumentKey) {
  const t = useInvoicesT()
  const format = useFormat()
  const list = LIST_KEYS[key]
  return (document: Pick<K2Document, "number" | "clientName" | "date">) =>
    document.number
      ? t(`${list}.trash.row`, { number: document.number })
      : t(`${list}.trash.rowDraft`, {
          client: document.clientName,
          date: format.date(document.date, "date"),
        })
}
