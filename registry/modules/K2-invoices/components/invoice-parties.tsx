import { partyRequisiteLines } from "@/components/erp/print-requisites"
import type { PartyDetails } from "@/lib/document-parties"
import { useErpUiT } from "@/lib/i18n"

import type { Invoice } from "../contract"
import { useInvoicesT } from "../use-invoices-t"

/**
 * Сторони рахунку на картці (UI45, ADR-0068): постачальник і покупець зі знімків рахунку — назва й
 * реквізити рядками без порожніх значень, як на аркуші; поруч із 32rem контейнера, вужче — одна під одною.
 */
export function InvoiceParties({ invoice }: { invoice: Invoice }) {
  const t = useInvoicesT()
  const kitT = useErpUiT()
  const parties: {
    id: string
    label: string
    name: string
    party: PartyDetails
  }[] = [
    {
      id: "supplier",
      label: t("invoice.parties.supplier"),
      name: invoice.supplier.name,
      party: invoice.supplier,
    },
    {
      id: "buyer",
      label: t("invoice.parties.buyer"),
      // Покупець без повної назви — назвою клієнта рахунку.
      name: invoice.buyer.name || invoice.clientName,
      party: invoice.buyer,
    },
  ]
  return (
    <div className="@container">
      <dl data-slot="invoice-parties" className="grid gap-4 @lg:grid-cols-2">
        {parties.map(({ id, label, name, party }) => (
          <div key={id} className="grid content-start gap-1">
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="grid gap-0.5">
              <span className="font-medium">{name}</span>
              {partyRequisiteLines(party, kitT).map((line, index) => (
                // Однаковий текст двох полів реквізитів не дає однакового ключа.
                <span key={`${String(index)}:${line}`} className="text-sm">
                  {line}
                </span>
              ))}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
