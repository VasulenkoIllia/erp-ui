import { useEffect, useMemo } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router"

import {
  PrintDocumentLines,
  PrintDocumentTitle,
  PrintDocumentTotals,
  PrintWatermark,
  type PrintTotalsRow,
} from "@/registry/erp/print-document"
import {
  PrintPreview,
  type PrintPreviewState,
} from "@/registry/erp/print-preview"
import {
  PrintCompanyHeader,
  PrintParties,
  PrintSignatures,
} from "@/registry/erp/print-requisites"
import { useCardRecord } from "@/registry/hooks/use-card-record"
import { useCompanyProfile } from "@/registry/hooks/use-company-profile"
import { errorStateKind, isApiError } from "@/registry/lib/api"
import type { CompanyProfile } from "@/registry/lib/company"
import type { DocumentState } from "@/registry/lib/document-lifecycle"
import type { DocumentBodyLine } from "@/registry/lib/document-lines"
import { toLanguage, useLanguage } from "@/registry/lib/i18n"
import { usePrintSheet } from "@/registry/lib/print"
import { buttonVariants } from "@/registry/ui/button"

import {
  INVOICE_CLIENTS,
  parseInvoiceDetail,
  type Invoice,
} from "@/data/invoices"
import { invoiceHref, ROUTES, useSearchParam } from "@/router"

import { BackLink } from "./back-link"
import { documentLines } from "./document-form-model"
import { PageHeader } from "./PageHeader"
import {
  DEFAULT_INVOICE_ID,
  DOCUMENT_TITLES,
  FOP_COMPANY,
  FORCED_STATES,
  invoiceDocStatus,
  invoicePrintLines,
  PRINT_VARIANTS,
  printVariantOf,
  settlementPrintRows,
  withDemoImages,
  type PrintVariant,
} from "./print-model"

const usePageT = () => useTranslation("demo", { keyPrefix: "printPage" }).t

/** Друк (PF08, ADR-0062): рахунок стрес-сторінки на аркуші A4 і варіанти аркуша. */
export function PrintPage() {
  const pagesT = useTranslation("demo", { keyPrefix: "app.pages" }).t
  const t = usePageT()
  const variant = printVariantOf(useSearchParam("variant"))
  const id = useSearchParam("id") ?? DEFAULT_INVOICE_ID
  return (
    <div className="space-y-6">
      <PageHeader title={pagesT("print")} lead={t("lead")} />
      <VariantNav current={variant} id={id} />
      {variant === "long" ? (
        <LongDocumentPrint />
      ) : (
        <InvoicePrint key={`${id}|${variant}`} id={id} variant={variant} />
      )}
    </div>
  )
}

/** Варіанти посиланнями: на сторінці один аркуш, бо друкується саме він. */
function VariantNav({ current, id }: { current: PrintVariant; id: string }) {
  const t = usePageT()
  const query = (variant: PrintVariant) =>
    new URLSearchParams({ id, variant }).toString()
  return (
    <nav aria-label={t("variantsLabel")}>
      <ul className="flex flex-wrap gap-2">
        {PRINT_VARIANTS.map((variant) => (
          <li key={variant}>
            <Link
              to={`${ROUTES.print}?${query(variant)}`}
              aria-current={variant === current ? "page" : undefined}
              className={buttonVariants({
                variant: variant === current ? "secondary" : "outline",
                size: "sm",
              })}
            >
              {t(`variants.${variant}`)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}

/** Стан аркуша: варіант стану, «не знайдено», помилка чи завантаження рахунку й компанії. */
function stateOf(
  variant: PrintVariant,
  failure: unknown,
  isLoading: boolean,
): PrintPreviewState | undefined {
  if (variant in FORCED_STATES)
    return FORCED_STATES[variant as keyof typeof FORCED_STATES]
  if (isApiError(failure) && failure.status === 404) return "not-found"
  if (failure) return errorStateKind(failure)
  return isLoading ? "loading" : undefined
}

function InvoicePrint({ id, variant }: { id: string; variant: PrintVariant }) {
  const t = usePageT()
  const ui = useLanguage()
  const card = useCardRecord<Invoice>("invoices", id)
  const company = useCompanyProfile()
  const {
    invoice,
    lines,
    error: invalid,
  } = useMemo(() => parseInvoiceDetail(card.record), [card.record])
  useEffect(() => {
    if (invalid) console.error("demo: invoice response", invalid)
  }, [invalid])
  const language =
    variant === "en" ? "en" : (company.data?.language ?? ui.language)
  const state = stateOf(
    variant,
    card.failure ?? invalid ?? company.error,
    !invoice || !lines || !company.data,
  )
  const retry = () => {
    card.retry()
    void company.refetch()
  }
  const number = invoice?.number ?? id
  return (
    <PrintPreview
      title={`${DOCUMENT_TITLES[toLanguage(language)]} ${number}`}
      language={language}
      state={state}
      onRetry={retry}
      actions={<BackLink to={invoiceHref(id)} label={t("back")} />}
    >
      {invoice && lines && company.data ? (
        <InvoiceSheet
          invoice={invoice}
          lines={lines}
          company={company.data}
          variant={variant}
        />
      ) : null}
    </PrintPreview>
  )
}

/** Компанія на аркуші варіанта: ФОП без ПДВ, без логотипа й печатки чи з демо-зображеннями. */
function issuerOf(company: CompanyProfile, variant: PrintVariant) {
  if (variant === "fop") return { ...company, ...FOP_COMPANY }
  if (variant === "plain") return { ...company, logoUrl: null, stampUrl: null }
  return withDemoImages(company)
}

function InvoiceSheet({
  invoice,
  lines,
  company,
  variant,
}: {
  invoice: Invoice
  lines: Parameters<typeof invoicePrintLines>[0]
  company: CompanyProfile
  variant: PrintVariant
}) {
  const { language } = usePrintSheet()
  const issuer = issuerOf(company, variant)
  const docStatus =
    variant === "draft" || variant === "cancelled"
      ? variant
      : invoiceDocStatus(invoice)
  const body =
    variant === "empty"
      ? []
      : invoicePrintLines(lines, invoice.currency, language, issuer.vatPayer)
  return (
    <DocumentSheet
      company={issuer}
      title={DOCUMENT_TITLES[language]}
      number={docStatus === "draft" ? null : invoice.number}
      date={invoice.date}
      dueDate={invoice.dueDate}
      docStatus={docStatus}
      client={invoice.client}
      lines={body}
      currency={invoice.currency}
      after={
        variant === "settlement"
          ? settlementPrintRows(invoice.amount, language)
          : undefined
      }
    />
  )
}

/** Довгий документ: 500 рядків «Великого документа» з розділами й нотатками на кількох сторінках. */
function LongDocumentPrint() {
  const formT = useTranslation("demo", { keyPrefix: "documentFormPage" }).t
  const company = useCompanyProfile()
  const lines = useMemo(
    () =>
      documentLines(500, {
        section: (index) => formT("section", { index }),
        note: formT("note"),
      }),
    [formT],
  )
  return (
    <PrintPreview
      title={`${DOCUMENT_TITLES.uk} ${LONG_DOCUMENT.number}`}
      language={company.data?.language}
      state={stateOf("long", company.error, !company.data)}
      onRetry={() => void company.refetch()}
    >
      {company.data ? (
        <DocumentSheet
          {...LONG_DOCUMENT}
          company={withDemoImages(company.data)}
          title={DOCUMENT_TITLES.uk}
          lines={lines}
          currency="UAH"
        />
      ) : null}
    </PrintPreview>
  )
}

const LONG_DOCUMENT = {
  number: "2026-0500",
  date: "2026-11-02",
  dueDate: "2026-11-16",
  docStatus: "submitted",
  client: INVOICE_CLIENTS[0],
} as const

/** Аркуш документа з блоків кіта: шапка, назва, сторони, рядки, підсумки, підписи. */
function DocumentSheet({
  company,
  title,
  number,
  date,
  dueDate,
  docStatus,
  client,
  lines,
  currency,
  after,
}: {
  company: CompanyProfile
  title: string
  number: string | null
  date: string
  dueDate: string
  docStatus: DocumentState
  client: string
  lines: readonly DocumentBodyLine[]
  currency: string
  /** Рядки під «Разом»: частково оплачений рахунок. */
  after?: readonly PrintTotalsRow[]
}) {
  const { t } = usePrintSheet()
  return (
    <>
      <PrintWatermark docStatus={docStatus} />
      <div className="grid gap-[6mm]">
        <PrintCompanyHeader company={company} />
        <PrintDocumentTitle
          title={title}
          number={number}
          date={date}
          dueDate={dueDate}
          docStatus={docStatus}
        />
        <PrintParties
          parties={[
            { label: t("print.sheet.supplier"), name: company.legalName },
            { label: t("print.sheet.buyer"), name: client },
          ]}
        />
        <PrintDocumentLines lines={lines} currency={currency} />
        <PrintDocumentTotals lines={lines} currency={currency} after={after} />
        <PrintSignatures company={company} />
      </div>
    </>
  )
}
