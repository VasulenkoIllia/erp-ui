import { useMemo } from "react"
import { Link } from "react-router"

import {
  DocumentGenerator,
  DocumentGeneratorButton,
} from "@/registry/erp/document-generator"
import { useCompanyProfile } from "@/registry/hooks/use-company-profile"
import {
  partyDetailsFrom,
  partyFromCompany,
} from "@/registry/lib/document-parties"
import type { TemplateDocument } from "@/registry/lib/document-template"
import { buttonVariants } from "@/registry/ui/button"

import { MODULE_ROUTES } from "@/router"
import { useDemoTranslation } from "@/i18n"
import { ukDocumentGeneratorPage } from "@/i18n/pages"

import { DEMO_DOCUMENT, PAGE_TEMPLATES } from "./document-generator-model"
import { PageHeader } from "./PageHeader"
import { Section } from "./Section"

const usePageT = () =>
  useDemoTranslation([ukDocumentGeneratorPage], {
    keyPrefix: "documentGeneratorPage",
  }).t

/** Документ демо з нашою компанією з профілю: «Постачальник» у тексті договору. */
function useDemoDocument(): TemplateDocument {
  const company = useCompanyProfile()
  return useMemo(
    () => ({
      ...DEMO_DOCUMENT,
      parties: {
        ...DEMO_DOCUMENT.parties,
        ...(company.data
          ? {
              contractor: {
                details: partyDetailsFrom(partyFromCompany(company.data)),
                label: { uk: "Постачальник", en: "Supplier" },
              },
            }
          : {}),
      },
    }),
    [company.data],
  )
}

/**
 * Документ із шаблону .docx (UI44, ADR-0087): генератор на сторінці з шаблонами демо (зокрема з
 * помилками й такий, що не завантажується) і та сама дія кнопкою з діалогом, як на картках модулів.
 */
export function DocumentGeneratorPage() {
  const pagesT = useDemoTranslation([ukDocumentGeneratorPage], {
    keyPrefix: "app.pages",
  }).t
  const t = usePageT()
  const document = useDemoDocument()
  return (
    <div className="space-y-6">
      <PageHeader title={pagesT("documentGenerator")} lead={t("lead")} />
      <Section title={t("inline")} description={t("inlineHint")}>
        <DocumentGenerator
          document={document}
          templates={PAGE_TEMPLATES}
          fileName={DEMO_DOCUMENT.number ?? ""}
        />
      </Section>
      <Section title={t("card")} description={t("cardHint")}>
        <div className="flex flex-wrap items-center gap-3">
          <DocumentGeneratorButton
            document={document}
            templates={PAGE_TEMPLATES.slice(0, 2)}
            fileName={DEMO_DOCUMENT.number ?? ""}
          />
          <Link
            to={MODULE_ROUTES.invoicesModule}
            className={buttonVariants({ variant: "link" })}
          >
            {t("invoices")}
          </Link>
          <Link
            to={MODULE_ROUTES.salesModule}
            className={buttonVariants({ variant: "link" })}
          >
            {t("sales")}
          </Link>
        </div>
      </Section>
    </div>
  )
}
