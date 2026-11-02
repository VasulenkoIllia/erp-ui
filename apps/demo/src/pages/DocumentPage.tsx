import { useGetList, useGetMany, useGetOne } from "ra-core"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Link, useNavigate } from "react-router"

import type { ConflictField } from "@/registry/erp/conflict-dialog"
import { DocumentActionBar } from "@/registry/erp/document-action-bar"
import { PageState, SectionSkeleton } from "@/registry/erp/page-state"
import { RecordStatusBar } from "@/registry/erp/record-header"
import { RecordLink } from "@/registry/erp/record-link"
import { StatusBadge } from "@/registry/erp/status-badge"
import { useCompanyId } from "@/registry/hooks/use-company"
import { announce } from "@/registry/lib/announce"
import { errorStateKind, isApiError } from "@/registry/lib/api"
import { companyScope } from "@/registry/lib/company-scope"
import { DOCUMENT_STATES } from "@/registry/lib/document-lifecycle"
import { useFormat } from "@/registry/lib/format"
import { useErpUiT } from "@/registry/lib/i18n"
import { Button } from "@/registry/ui/button"

import type { DemoDocument } from "@/data/documents"
import { ROUTES, useSearchParam } from "@/router"

import {
  DOCUMENT_RESOURCE,
  useDocumentStatuses,
  useDocumentTransitions,
} from "./document-model"
import { DocumentVariants } from "./document-variants"
import { PageHeader } from "./PageHeader"
import { Section } from "./Section"

const DEFAULT_ID = "doc-1"
const LIST_SIZE = 50
const COMPARED = ["status", "dueDate", "amount"] as const
const LINKS = ["amendedFrom", "amendedBy", "reversalOf", "reversedBy"] as const

const colleague = () => import("@/mocks/colleague")
const documentHref = (id: string) =>
  `${ROUTES.document}?id=${encodeURIComponent(id)}`

/** Документ (PF03, ADR-0057): життєвий цикл, граф переходів і панель дій на моках. */
export function DocumentPage() {
  const { t } = useTranslation()
  const id = useSearchParam("id") ?? DEFAULT_ID
  return (
    <div className="space-y-6">
      <PageHeader
        title={t("app.pages.document")}
        lead={t("documentPage.lead")}
      />
      <DocumentList current={id} />
      <DocumentCard id={id} />
      <DocumentVariants />
    </div>
  )
}

/** Номер документа; чернетка номера не має, поки її не проведуть (ADR-0058). */
function DocumentNumber({ number }: { number: string | null }) {
  const kitT = useErpUiT()
  return (
    number ?? (
      <span className="text-muted-foreground">
        {kitT("numbering.noNumber")}
      </span>
    )
  )
}

function DocumentList({ current }: { current: string }) {
  const { t } = useTranslation()
  const companyId = useCompanyId()
  const statuses = useDocumentStatuses()
  const { data, isPending, error, refetch } = useGetList<DemoDocument>(
    DOCUMENT_RESOURCE,
    {
      pagination: { page: 1, perPage: LIST_SIZE },
      sort: { field: "date", order: "DESC" },
      meta: companyScope(companyId),
    },
  )
  return (
    <Section
      title={t("documentPage.listTitle")}
      description={t("documentPage.listDescription")}
    >
      {isPending ? (
        <SectionSkeleton />
      ) : error ? (
        <PageState
          kind={errorStateKind(error)}
          headingLevel={3}
          onRetry={() => void refetch()}
        />
      ) : !data?.length ? (
        <PageState kind="empty" headingLevel={3} />
      ) : (
        <ul className="divide-y rounded-lg border">
          {data.map((document) => (
            <li key={document.id}>
              <Link
                to={documentHref(document.id)}
                aria-current={document.id === current ? "page" : undefined}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none aria-[current=page]:bg-muted aria-[current=page]:font-medium"
              >
                <span className="tabular-nums">
                  <DocumentNumber number={document.number} />
                </span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">
                  {document.client}
                </span>
                <StatusBadge
                  status={statuses.byId.get(document.status) ?? document.status}
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

function DocumentCard({ id }: { id: string }) {
  const { t } = useTranslation()
  const kitT = useErpUiT()
  const format = useFormat()
  const navigate = useNavigate()
  const companyId = useCompanyId()
  const statuses = useDocumentStatuses()
  const transitions = useDocumentTransitions()
  const { data, isPending, error, refetch } = useGetOne<DemoDocument>(
    DOCUMENT_RESOURCE,
    { id, meta: companyScope(companyId) },
  )
  // Новий документ після «Виправити» чи «Сторнувати»: фокус на його номер, а не на `body`.
  const heading = useRef<HTMLHeadingElement>(null)
  const focusNext = useRef<string | null>(null)
  useEffect(() => {
    if (data && data.id === focusNext.current) {
      focusNext.current = null
      heading.current?.focus()
    }
  }, [data])
  const show = (key: (typeof COMPARED)[number], document: DemoDocument) =>
    key === "status"
      ? (statuses.byId.get(document.status)?.label ?? document.status)
      : key === "amount"
        ? format.money({ amount: document.amount, currency: document.currency })
        : format.date(document.dueDate, "date")
  const compare = (
    seen: DemoDocument,
    current: DemoDocument,
  ): ConflictField[] =>
    COMPARED.filter((key) => seen[key] !== current[key]).map((key) => ({
      key,
      label: t(`documentPage.fields.${key}`),
      mine: show(key, seen),
      theirs: show(key, current),
    }))
  return (
    <Section
      title={t("documentPage.cardTitle")}
      description={t("documentPage.cardDescription")}
    >
      {isPending ? (
        <SectionSkeleton rows={4} />
      ) : error || !data ? (
        <PageState
          kind={
            isApiError(error) && error.status === 404
              ? "not-found"
              : errorStateKind(error)
          }
          headingLevel={3}
          onRetry={() => void refetch()}
        />
      ) : (
        <div className="space-y-4" data-testid="document-card">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h3
              ref={heading}
              tabIndex={-1}
              className="text-lg font-semibold tabular-nums focus-visible:outline-none"
            >
              <DocumentNumber number={data.number} />
            </h3>
            <StatusBadge
              status={statuses.byId.get(data.status) ?? data.status}
            />
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
            <Field
              label={t("documentPage.fields.client")}
              value={data.client}
            />
            <Field
              label={t("documentPage.fields.dueDate")}
              value={show("dueDate", data)}
            />
            <Field
              label={t("documentPage.fields.amount")}
              value={show("amount", data)}
            />
            <Field
              label={t("documentPage.fields.state")}
              value={kitT(`documentStates.${data.docStatus}`)}
            />
          </dl>
          <RecordStatusBar
            label={t("documentPage.steps")}
            steps={DOCUMENT_STATES.map((state) => ({
              id: state,
              label: kitT(`documentStates.${state}`),
            }))}
            current={data.docStatus}
          />
          <DocumentActionBar
            resource={DOCUMENT_RESOURCE}
            record={data}
            transitions={transitions}
            compare={compare}
            onCreated={(created) => {
              focusNext.current = String(created.id)
              void navigate(documentHref(String(created.id)))
            }}
          />
          <DocumentLinks document={data} />
          {data.status === "submitted" ? <ColleaguePays id={data.id} /> : null}
        </div>
      )}
    </Section>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 space-y-0.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium break-words tabular-nums">{value}</dd>
    </div>
  )
}

/** Зв'язки життєвого циклу: виправлена копія й сторно — посиланнями з номером документа. */
function DocumentLinks({ document }: { document: DemoDocument }) {
  const { t } = useTranslation()
  const companyId = useCompanyId()
  const present = LINKS.flatMap((key) => {
    const target = document[key]
    return target ? [{ key, target }] : []
  })
  const { data: linked } = useGetMany<DemoDocument>(
    DOCUMENT_RESOURCE,
    { ids: present.map(({ target }) => target), meta: companyScope(companyId) },
    { enabled: present.length > 0 },
  )
  if (!present.length) return null
  const numberOf = (id: string) => {
    const found = linked?.find((item) => item.id === id)
    return found ? <DocumentNumber number={found.number} /> : id
  }
  return (
    <ul className="space-y-1 text-sm">
      {present.map(({ key, target }) => (
        <li key={key}>
          {t(`documentPage.links.${key}`)}{" "}
          <RecordLink to={documentHref(target)}>{numberOf(target)}</RecordLink>
        </li>
      ))}
    </ul>
  )
}

/** Колега провів оплату: картка цього не знає, тож «Скасувати» активна, а сервер відмовить. */
function ColleaguePays({ id }: { id: string }) {
  const { t } = useTranslation()
  const [isPaid, setPaid] = useState(false)
  return (
    <div className="space-y-2 rounded-lg border border-dashed p-3 text-sm">
      <Button
        variant="outline"
        onClick={() => {
          void colleague().then(({ colleaguePaysDocument }) => {
            colleaguePaysDocument(id)
            setPaid(true)
            announce(t("documentPage.colleague.paid"))
          })
        }}
      >
        {t("documentPage.colleague.pay")}
      </Button>
      <p className="text-muted-foreground">
        {isPaid
          ? t("documentPage.colleague.paid")
          : t("documentPage.colleague.hint")}
      </p>
    </div>
  )
}
