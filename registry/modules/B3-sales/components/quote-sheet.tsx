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
import type { Language } from "@/lib/i18n"
import { usePrintSheet } from "@/lib/print"

import type { Quote, QuoteDetail } from "../contract"

/** Вид документа мовою аркуша: дані модуля, а не рядки інтерфейсу (ADR-0062). */
export const QUOTE_SHEET_TITLES: Record<Language, string> = {
  uk: "Комерційна пропозиція",
  en: "Quotation",
}

/** Строк пропозиції мовою аркуша: замість «Сплатити до» рахунку. */
const VALID_UNTIL: Record<Language, (date: string) => string> = {
  uk: (date) => `Пропозиція дійсна до ${date}`,
  en: (date) => `Valid until ${date}`,
}

/**
 * Аркуш пропозиції з блоків кіта (PF08, ADR-0062): шапка компанії, назва з номером і датою, строк дії,
 * сторони, рядки з розділами й нотатками, підсумки сервера з сумою прописом, підписи. Чернетка й
 * скасована — з позначкою навскіс, у чернетки «(без номера)».
 */
export function QuoteSheet({
  quote,
  detail,
  company,
}: {
  quote: Quote
  detail: QuoteDetail
  company: CompanyProfile
}) {
  const { t, language, locale } = usePrintSheet()
  return (
    <>
      <PrintWatermark docStatus={quote.docStatus} />
      <div className="grid gap-[6mm]">
        <PrintCompanyHeader company={company} />
        <div className="grid gap-1 text-center">
          <PrintDocumentTitle
            title={QUOTE_SHEET_TITLES[language]}
            number={quote.number}
            date={quote.date}
            docStatus={quote.docStatus}
          />
          <p>
            {VALID_UNTIL[language](
              formatDate(quote.validUntil, "long", locale),
            )}
          </p>
        </div>
        <PrintParties
          parties={[
            { label: t("print.sheet.supplier"), name: company.legalName },
            { label: t("print.sheet.buyer"), name: quote.clientName },
          ]}
        />
        <PrintDocumentLines lines={detail.lines} currency={quote.currency} />
        <PrintDocumentTotals
          lines={detail.lines}
          currency={quote.currency}
          totals={detail.totals}
        />
        <PrintSignatures company={company} />
      </div>
    </>
  )
}
