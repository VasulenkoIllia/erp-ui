import { useGetOne } from "ra-core"
import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router"
import { toast } from "sonner"
import { z } from "zod"

import { DateInput, useDateIssueText } from "@/registry/erp/date-input"
import { DocumentActionBar } from "@/registry/erp/document-action-bar"
import { FormField } from "@/registry/erp/form"
import { PageState, SectionSkeleton } from "@/registry/erp/page-state"
import { PeriodLockBanner } from "@/registry/erp/period-lock-banner"
import type { RecordFormItem } from "@/registry/erp/record-form"
import { RecordFormPage } from "@/registry/erp/record-form-page"
import { useCompanyId } from "@/registry/hooks/use-company"
import { usePostingDate } from "@/registry/hooks/use-period-lock"
import { useRecordAccess } from "@/registry/hooks/use-record-access"
import { useRecordForm } from "@/registry/hooks/use-record-form"
import { useSearchParamState } from "@/registry/hooks/use-tab-param"
import { errorStateKind } from "@/registry/lib/api"
import { companyScope } from "@/registry/lib/company-scope"
import { Button } from "@/registry/ui/button"

import { documentSchema, type DemoDocument } from "@/data/documents"
import { ROUTES } from "@/router"

import { DOCUMENT_RESOURCE, useDocumentTransitions } from "./document-model"
import { Section } from "./Section"

/**
 * Документ демо в закритому періоді (PF13, ADR-0069): чернетка у відкритому періоді (дату можна змінити,
 * а дата в закритому — 422 біля поля), чернетка й сторно в закритому періоді (смуга, причина на кнопках).
 */
const SAMPLES = ["doc-1", "doc-6", "doc-8"] as const
type Sample = (typeof SAMPLES)[number]
const DEFAULT_SAMPLE: Sample = "doc-6"
const isSample = (value: string | null): value is Sample =>
  (SAMPLES as readonly (string | null)[]).includes(value)

export function PeriodLockDocument() {
  const { t } = useTranslation("demo", { keyPrefix: "periodLockPage" })
  const selected = useSearchParamState("doc")
  const id = isSample(selected.value) ? selected.value : DEFAULT_SAMPLE
  const companyId = useCompanyId()
  const { data, isPending, error, refetch } = useGetOne<DemoDocument>(
    DOCUMENT_RESOURCE,
    { id, meta: companyScope(companyId) },
  )
  return (
    <Section title={t("documentTitle")} description={t("documentDescription")}>
      <div className="grid gap-4" data-testid="period-lock-document">
        <ul aria-label={t("samplesLabel")} className="flex flex-wrap gap-2">
          {SAMPLES.map((sample) => (
            <li key={sample}>
              <Button
                type="button"
                variant={sample === id ? "default" : "outline"}
                aria-pressed={sample === id}
                onClick={() => {
                  selected.onValueChange(sample)
                }}
              >
                {t(`samples.${sample}`)}
              </Button>
            </li>
          ))}
        </ul>
        {isPending ? (
          <SectionSkeleton rows={3} />
        ) : !data ? (
          <PageState
            kind={errorStateKind(error)}
            headingLevel={3}
            onRetry={() => void refetch()}
          />
        ) : (
          <DocumentSample key={data.id} document={data} />
        )}
      </div>
    </Section>
  )
}

function DocumentSample({ document }: { document: DemoDocument }) {
  const { t } = useTranslation("demo", { keyPrefix: "periodLockPage" })
  const navigate = useNavigate()
  const transitions = useDocumentTransitions()
  return (
    <div className="grid gap-4">
      <PeriodLockBanner
        date={document.date}
        hint={document.docStatus === "submitted" ? t("hint") : undefined}
      />
      <DateForm document={document} />
      <DocumentActionBar
        resource={DOCUMENT_RESOURCE}
        record={document}
        transitions={transitions}
        onCreated={(created) => {
          void navigate(
            `${ROUTES.document}?id=${encodeURIComponent(String(created.id))}`,
          )
        }}
      />
    </div>
  )
}

interface DateValues {
  date: string
}

/**
 * Дата документа: календар не дає вибрати закритий день (`usePostingDate`), а введена з клавіатури
 * дата закритого періоду повертається від сервера 422 біля поля. Документ закритого періоду — лише
 * для читання з причиною сервера під полем.
 */
function DateForm({ document }: { document: DemoDocument }) {
  const { t } = useTranslation("demo", { keyPrefix: "periodLockPage" })
  const dateIssue = useDateIssueText()
  const posting = usePostingDate()
  const access = useRecordAccess({
    resource: DOCUMENT_RESOURCE,
    action: "update",
    record: document,
  })
  const readOnly = !access.canAccess
  const schema = useMemo(
    () =>
      z.object({ date: z.string() }).superRefine(({ date }, context) => {
        const issue = dateIssue(date)
        if (issue)
          context.addIssue({ code: "custom", path: ["date"], message: issue })
      }),
    [dateIssue],
  )
  const state = useRecordForm<DateValues, DemoDocument>({
    resource: DOCUMENT_RESOURCE,
    record: document,
    followRecord: true,
    schema,
    defaultValues: { date: document.date },
    recordSchema: documentSchema,
    toPayload: (values) => ({ date: values.date }),
    toValues: (record) => ({ date: record.date }),
    onSaved: () => {
      toast.success(t("dateSaved"))
    },
  })
  const items: RecordFormItem[] = [
    {
      id: "date",
      label: t("dateLabel"),
      description: (readOnly ? access.recordReason : undefined) ?? posting.hint,
      render: (props) => (
        <FormField
          {...props}
          control={state.form.control}
          name="date"
          readOnly={readOnly}
          render={({ field, control }) => (
            <DateInput
              {...control}
              ref={field.ref}
              value={field.value}
              onValueChange={field.onChange}
              onBlur={field.onBlur}
              min={posting.min}
            />
          )}
        />
      ),
    },
  ]
  return <RecordFormPage state={state} items={items} readOnly={readOnly} />
}
