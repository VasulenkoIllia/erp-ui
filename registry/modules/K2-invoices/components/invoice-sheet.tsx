import {
  PrintDocumentLines,
  PrintDocumentTitle,
  PrintDocumentTotals,
  PrintWatermark,
  type PrintTotalsRow,
} from "@/components/erp/print-document"
import {
  partyRequisiteLines,
  PrintCompanyHeader,
  PrintParties,
  PrintSignatures,
} from "@/components/erp/print-requisites"
import {
  PrintExtensionFields,
  PrintSheetBlocks,
  useSheetBlocks,
  useSheetLineDetails,
} from "@/components/erp/print-sheet-blocks"
import { QrCode } from "@/components/erp/qr-code"
import type { CompanyProfile } from "@/lib/company"
import { formatDate } from "@/lib/format"
import { usePrintSheet } from "@/lib/print"

import {
  INVOICES,
  REVERSAL_STATUS,
  type Invoice,
  type InvoiceDetail,
  type K2Document,
} from "../contract"
import { useInvoicesModule } from "../module-context"
import type { InvoicesSheetT } from "../use-invoices-t"
import { invoicePaymentQr, invoiceSettlementRows } from "./invoice-payment"

/**
 * Рядки «Кредит-ноти», «Оплачено», «Повернено», «До сплати» під «Разом» мовою документа (рядки модуля
 * `invoice.sheet.settlement.*`); борг виділено, як «Разом».
 */
const settlementRows = (
  invoice: Invoice,
  totals: InvoiceDetail["totals"],
  t: InvoicesSheetT,
): PrintTotalsRow[] =>
  invoiceSettlementRows(invoice, totals).map((row) => ({
    key: row.key,
    label: t(`invoice.sheet.settlement.${row.key}`),
    amount: row.amount,
    isTotal: row.key === "debt",
  }))

/** Назва аркуша мовою документа: «Рахунок на оплату», у сторно — «Сторно рахунку». */
export const invoiceSheetTitle = (invoice: Invoice, t: InvoicesSheetT) =>
  t(
    invoice.status === REVERSAL_STATUS
      ? "invoice.sheet.reversal"
      : "invoice.sheet.title",
  )

/** Постачальник і покупець аркуша документа з реквізитами знімків (ADR-0068). */
export function SheetParties({ document }: { document: K2Document }) {
  const { t } = usePrintSheet()
  return (
    <PrintParties
      parties={[
        {
          label: t("print.sheet.supplier"),
          name: document.supplier.name,
          details: partyRequisiteLines(document.supplier, t),
        },
        {
          label: t("print.sheet.buyer"),
          name: document.buyer.name || document.clientName,
          details: partyRequisiteLines(document.buyer, t),
        },
      ]}
    />
  )
}

/**
 * Аркуш рахунку з блоків кіта (PF08, ADR-0062, ADR-0068, ADR-0070, ADR-0086): шапка компанії, «Рахунок на
 * оплату» з номером і датою, «Сплатити до …», постачальник і покупець з реквізитами знімків рахунку, поля
 * розширення з `print.fields`, рядки (і поля рядка), підсумки сервера з сумою прописом, кредит-ноти, оплати
 * й «До сплати» (ADR-0074), QR-код оплати НБУ боргу виставленого рахунку в гривнях, підписи. Тексти — рядки
 * модуля мовою документа (`invoice.sheet.*`); розширення додає свій блок, ховає чи переставляє блок модуля
 * (`print.blocks`). Чернетка й скасований — з позначкою навскіс, у чернетки «(без номера)».
 */
export function InvoiceSheet({
  invoice,
  detail,
  company,
  sheetT: t,
}: {
  invoice: Invoice
  detail: InvoiceDetail
  company: CompanyProfile
  /** Рядки модуля мовою аркуша від сторінки друку (`DocumentPrint`). */
  sheetT: InvoicesSheetT
}) {
  const { locale } = usePrintSheet()
  const { extension } = useInvoicesModule()
  const invoiceExtension = extension.invoices
  const lineDetails = useSheetLineDetails(invoiceExtension?.lineFields)
  const qr = invoicePaymentQr(invoice, detail.totals)
  const blocks = useSheetBlocks(
    [
      { id: "company", node: <PrintCompanyHeader company={company} /> },
      {
        id: "title",
        node: (
          <div className="grid gap-1 text-center">
            <PrintDocumentTitle
              title={invoiceSheetTitle(invoice, t)}
              number={invoice.number}
              date={invoice.date}
              docStatus={invoice.docStatus}
            />
            {invoice.status === REVERSAL_STATUS ? null : (
              <p>
                {t("invoice.sheet.due", {
                  date: formatDate(invoice.dueDate, "long", locale),
                })}
              </p>
            )}
          </div>
        ),
      },
      { id: "parties", node: <SheetParties document={invoice} /> },
      {
        id: "fields",
        node: (
          <PrintExtensionFields
            record={invoice}
            fields={invoiceExtension?.fields}
            shown={invoiceExtension?.print?.fields}
          />
        ),
      },
      {
        id: "lines",
        node: (
          <PrintDocumentLines
            lines={detail.lines}
            currency={invoice.currency}
            lineDetails={lineDetails}
          />
        ),
      },
      {
        id: "totals",
        node: (
          <PrintDocumentTotals
            lines={detail.lines}
            currency={invoice.currency}
            totals={detail.totals}
            after={settlementRows(invoice, detail.totals, t)}
          />
        ),
      },
      {
        id: "qr",
        node: qr?.ok ? (
          <div
            data-slot="invoice-payment-qr"
            data-print="avoid-break"
            className="flex items-center gap-[4mm]"
          >
            <QrCode
              value={qr.url}
              label={t("invoice.sheet.qrLabel", {
                number: invoice.number ?? "",
              })}
              className="size-[32mm] shrink-0 rounded-none"
            />
            <p className="max-w-[90mm] text-[8.5pt]">{t("invoice.sheet.qr")}</p>
          </div>
        ) : null,
      },
      { id: "signatures", node: <PrintSignatures company={company} /> },
    ],
    {
      record: invoice,
      resource: INVOICES,
      changes: invoiceExtension?.print?.blocks,
    },
  )
  return (
    <>
      <PrintWatermark docStatus={invoice.docStatus} />
      <div className="grid gap-[6mm]">
        <PrintSheetBlocks blocks={blocks} />
      </div>
    </>
  )
}
