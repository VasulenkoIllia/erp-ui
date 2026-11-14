import {
  PrintDocumentLines,
  PrintDocumentTitle,
  PrintDocumentTotals,
  PrintWatermark,
} from "@/components/erp/print-document"
import {
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
import type { CompanyProfile } from "@/lib/company"
import { formatDate } from "@/lib/format"
import { usePrintSheet } from "@/lib/print"

import type { SalesDocument, SalesDocumentDetail } from "../contract"
import { useSalesModule } from "../module-context"
import type { SalesDocumentKind } from "../sales-kinds"
import type { SalesSheetT } from "../use-sales-t"

/**
 * Аркуш документа продажу з блоків кіта (PF08, ADR-0062, ADR-0086): шапка компанії, назва з номером і
 * датою («Комерційна пропозиція», «Замовлення покупця»), друга дата («Пропозиція дійсна до …», «Виконати до
 * …»), сторони, поля розширення з `print.fields`, рядки з розділами й нотатками (і полями рядка), підсумки
 * сервера з сумою прописом, підписи. Назва й друга дата — рядки модуля мовою документа (`<запис>.sheet.*`).
 * Розширення додає свій блок, ховає чи переставляє блок модуля (`print.blocks`). Чернетка й скасований — з
 * позначкою навскіс, у чернетки «(без номера)».
 */
export function SalesSheet<D extends SalesDocument, Due extends string>({
  kind,
  document,
  detail,
  company,
  sheetT,
}: {
  kind: SalesDocumentKind<D, Due>
  document: D
  detail: SalesDocumentDetail
  company: CompanyProfile
  /** Рядки модуля мовою аркуша від сторінки друку (`useSalesSheetT`). */
  sheetT: SalesSheetT
}) {
  const { t, locale } = usePrintSheet()
  const { extension } = useSalesModule()
  const documentExtension = kind.extensionOf(extension)
  const { record } = kind.keys
  const lineDetails = useSheetLineDetails(documentExtension?.lineFields)
  const blocks = useSheetBlocks(
    [
      { id: "company", node: <PrintCompanyHeader company={company} /> },
      {
        id: "title",
        node: (
          <div className="grid gap-1 text-center">
            <PrintDocumentTitle
              title={sheetT(`${record}.sheet.title`)}
              number={document.number}
              date={document.date}
              docStatus={document.docStatus}
            />
            <p>
              {sheetT(`${record}.sheet.due`, {
                date: formatDate(kind.dueOf(document), "long", locale),
              })}
            </p>
          </div>
        ),
      },
      {
        id: "parties",
        node: (
          <PrintParties
            parties={[
              { label: t("print.sheet.supplier"), name: company.legalName },
              { label: t("print.sheet.buyer"), name: document.clientName },
            ]}
          />
        ),
      },
      {
        id: "fields",
        node: (
          <PrintExtensionFields
            record={document}
            fields={documentExtension?.fields}
            shown={documentExtension?.print?.fields}
          />
        ),
      },
      {
        id: "lines",
        node: (
          <PrintDocumentLines
            lines={detail.lines}
            currency={document.currency}
            lineDetails={lineDetails}
          />
        ),
      },
      {
        id: "totals",
        node: (
          <PrintDocumentTotals
            lines={detail.lines}
            currency={document.currency}
            totals={detail.totals}
          />
        ),
      },
      { id: "signatures", node: <PrintSignatures company={company} /> },
    ],
    {
      record: document,
      resource: kind.resource,
      changes: documentExtension?.print?.blocks,
    },
  )
  return (
    <>
      <PrintWatermark docStatus={document.docStatus} />
      <div className="grid gap-[6mm]">
        <PrintSheetBlocks blocks={blocks} />
      </div>
    </>
  )
}
