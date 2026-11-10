import { useGetOne, type RaRecord } from "ra-core"
import { useWatch, type UseFormReturn } from "react-hook-form"

import { PartyDetailsFields } from "@/components/erp/party-details"
import { useCompanyId } from "@/hooks/use-company"
import { useCompanyProfile } from "@/hooks/use-company-profile"
import { companyScope } from "@/lib/company-scope"
import { partyFromCompany, type PartyDetails } from "@/lib/document-parties"

import { useInvoicesModule } from "../module-context"
import { useInvoicesT } from "../use-invoices-t"
import { buyerOf, type InvoiceFormValues } from "./invoice-form-items"

/** Сторони форми: поля розширення в значеннях форми (індекс `string`) ховають шляхи сторін від типу `name`. */
type PartiesValues = { supplier: PartyDetails; buyer: PartyDetails }

/**
 * Сторони рахунку у формі (UI45, ADR-0068): постачальник — наша компанія, «Заповнити з профілю компанії»;
 * покупець — клієнт рахунку, «Заповнити з картки клієнта» (реквізити дає `clients.party` проекту). Кнопка
 * заповнює лише порожні поля; поки джерела немає (клієнта не вибрано, профіль ще йде) — неактивна з
 * причиною. Поруч від 64rem контейнера, вужче — одна під одною.
 */
export function InvoicePartiesFields({
  form,
  readOnly,
}: {
  form: UseFormReturn<InvoiceFormValues>
  readOnly: boolean
}) {
  const t = useInvoicesT()
  const { clients } = useInvoicesModule()
  const companyId = useCompanyId()
  const company = useCompanyProfile()
  const clientId = useWatch({ control: form.control, name: "clientId" })
  const parties = form as unknown as UseFormReturn<PartiesValues>
  const client = useGetOne<RaRecord>(
    clients.resource,
    { id: clientId, meta: companyScope(companyId) },
    { enabled: Boolean(clientId) && !readOnly },
  )
  return (
    <div className="@container">
      <div className="grid gap-6 @5xl:grid-cols-2">
        <PartyDetailsFields
          form={parties}
          name="supplier"
          legend={t("invoiceForm.parties.supplier")}
          readOnly={readOnly}
          source={{
            label: t("invoiceForm.parties.fillCompany"),
            values: company.data && partyFromCompany(company.data),
            unavailableReason: t("invoiceForm.parties.companyLoading"),
          }}
        />
        <PartyDetailsFields
          form={parties}
          name="buyer"
          legend={t("invoiceForm.parties.buyer")}
          readOnly={readOnly}
          source={{
            label: t("invoiceForm.parties.fillClient"),
            values: client.data && buyerOf(clients)(client.data),
            unavailableReason: t("invoiceForm.parties.clientFirst"),
          }}
        />
      </div>
    </div>
  )
}
