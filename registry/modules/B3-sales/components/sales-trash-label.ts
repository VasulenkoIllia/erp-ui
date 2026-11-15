import { useFormat } from "@/lib/format"

import type { SalesDocument } from "../contract"
import type { SalesKindBase } from "../sales-kinds"
import { useSalesT } from "../use-sales-t"

/** Назва документа в кошику й у «Відновлено: …»: номер, у чернетки — клієнт і дата (ADR-0095). */
export function useSalesTrashLabel(kind: SalesKindBase) {
  const t = useSalesT()
  const format = useFormat()
  const { list } = kind.keys
  return (document: Pick<SalesDocument, "number" | "clientName" | "date">) =>
    document.number
      ? t(`${list}.trash.row`, { number: document.number })
      : t(`${list}.trash.rowDraft`, {
          client: document.clientName,
          date: format.date(document.date, "date"),
        })
}
