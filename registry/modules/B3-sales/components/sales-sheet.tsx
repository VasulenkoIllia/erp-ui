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
import type { CompanyProfile } from "@/lib/company"
import { formatDate } from "@/lib/format"
import { usePrintSheet } from "@/lib/print"

import type { SalesDocument, SalesDocumentDetail } from "../contract"
import type { SalesDocumentKind } from "../sales-kinds"

/**
 * Аркуш документа продажу з блоків кіта (PF08, ADR-0062): шапка компанії, назва з номером і датою
 * («Комерційна пропозиція», «Замовлення покупця»), друга дата («Пропозиція дійсна до …», «Виконати до
 * …»), сторони, рядки з розділами й нотатками, підсумки сервера з сумою прописом, підписи. Чернетка й
 * скасований — з позначкою навскіс, у чернетки «(без номера)».
 */
export function SalesSheet<D extends SalesDocument, Due extends string>({
  kind,
  document,
  detail,
  company,
}: {
  kind: SalesDocumentKind<D, Due>
  document: D
  detail: SalesDocumentDetail
  company: CompanyProfile
}) {
  const { t, language, locale } = usePrintSheet()
  return (
    <>
      <PrintWatermark docStatus={document.docStatus} />
      <div className="grid gap-[6mm]">
        <PrintCompanyHeader company={company} />
        <div className="grid gap-1 text-center">
          <PrintDocumentTitle
            title={kind.sheet.title[language]}
            number={document.number}
            date={document.date}
            docStatus={document.docStatus}
          />
          <p>
            {kind.sheet.due[language](
              formatDate(kind.dueOf(document), "long", locale),
            )}
          </p>
        </div>
        <PrintParties
          parties={[
            { label: t("print.sheet.supplier"), name: company.legalName },
            { label: t("print.sheet.buyer"), name: document.clientName },
          ]}
        />
        <PrintDocumentLines lines={detail.lines} currency={document.currency} />
        <PrintDocumentTotals
          lines={detail.lines}
          currency={document.currency}
          totals={detail.totals}
        />
        <PrintSignatures company={company} />
      </div>
    </>
  )
}
