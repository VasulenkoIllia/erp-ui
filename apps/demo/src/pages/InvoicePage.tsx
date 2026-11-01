import { useQueryClient } from "@tanstack/react-query"
import { useAuthenticated, useCanAccess, useGetOne } from "ra-core"
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react"
import { useTranslation } from "react-i18next"
import { useLocation as useRouterLocation } from "react-router"

import { ConfirmDialog } from "@/registry/erp/confirm-dialog"
import { EditLockNotice } from "@/registry/erp/edit-lock-notice"
import { PageSkeleton } from "@/registry/erp/page-state"
import { DeniedAction } from "@/registry/erp/permission-gate"
import { RecordStatusBar, type RecordField } from "@/registry/erp/record-header"
import { RecordHistory } from "@/registry/erp/record-history"
import { useCompanyId } from "@/registry/hooks/use-company"
import { useEditLock } from "@/registry/hooks/use-edit-lock"
import { useFocusHeadingOnNavigation } from "@/registry/hooks/use-focus-heading"
import { ApiError, isApiError } from "@/registry/lib/api"
import { AUDIT_QUERY_KEYS } from "@/registry/lib/audit"
import { companyScope } from "@/registry/lib/company-scope"
import { useFormat } from "@/registry/lib/format"
import { applyKeyedChanges, type KeyedChanges } from "@/registry/lib/extensions"
import { ACTION_ICONS } from "@/registry/lib/icons"
import {
  ObjectPage,
  useRecordSlots,
  type ObjectPageAction,
  type ObjectPageHeader,
  type ObjectPageSectionItem,
} from "@/registry/templates/object-page"
import { Button } from "@/registry/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/registry/ui/field"
import { Spinner } from "@/registry/ui/spinner"
import { Textarea } from "@/registry/ui/textarea"

import {
  parseInvoiceDetail,
  type Invoice,
  type InvoiceStatus,
} from "@/data/invoices"
import { ROUTES } from "@/router"

import { BackLink } from "./back-link"

import { preloadJobProgress, useStartApproval } from "./invoice-bulk"
import { EditInvoiceDialog } from "./invoice-edit-dialog"
import {
  NO_INVOICES_EXTENSION,
  useExtendedRecordFields,
  useInvoiceSchema,
  type InvoiceActionId,
  type InvoiceFieldId,
  type InvoiceSectionId,
  type InvoicesExtension,
} from "./invoice-extension"
import { InvoiceLines } from "./invoice-lines"
import { InvoiceStatusBadge } from "./invoice-status"

/**
 * Картка рахунку стрес-сторінки (SPEC §7 Object Page, §18.1; ADR-0019): шапка з ключовими полями й
 * діями, етапи, рядки документа, історія змін із журналу аудиту на місці стрічки запису (UI01 —
 * хвиля 1). Шапка — одразу з кешу списку, рядки — з `GET /invoices/:id`. `extension` — розширення
 * проекту (ADR-0020): поля в шапці, секції й дії.
 */

const RESOURCE = "invoices"

const useCardT = () => useTranslation("demo", { keyPrefix: "invoicePage" }).t
const usePageT = () => useTranslation("demo", { keyPrefix: "dataPage" }).t

/** Етапи життєвого циклу: частково оплачений і прострочений — ще «Надіслано». */
const STEPS = ["draft", "approved", "sent", "paid"] as const
const STEP_OF: Record<InvoiceStatus, (typeof STEPS)[number]> = {
  draft: "draft",
  approved: "approved",
  sent: "sent",
  partially_paid: "sent",
  overdue: "sent",
  paid: "paid",
}

/** Відповідь без рядків (стара версія сервера) — помилка секції, а не вічний скелетон. */
const MISSING_LINES = new Error("Invoice lines are missing in the response")
/** Мережі немає, і TanStack Query тримає запит на паузі: це «немає з'єднання», а не вічний скелетон. */
const OFFLINE = new ApiError(0, {
  code: "offline",
  message: "Network is unavailable",
})

export function InvoicePage({
  id,
  extension = NO_INVOICES_EXTENSION,
}: {
  id: string
  extension?: InvoicesExtension
}) {
  // Без сесії ra-core перенаправить на /login і повернеться сюди після входу.
  const { isPending } = useAuthenticated()
  // Інший рахунок — інша картка: діалог, історія й фокус не переходять від попереднього.
  return isPending ? (
    <PageSkeleton rows={4} />
  ) : (
    <InvoiceCard key={id} id={id} extension={extension} />
  )
}

function InvoiceCard({
  id,
  extension,
}: {
  id: string
  extension: InvoicesExtension
}) {
  const t = useCardT()
  const pageT = usePageT()
  const companyId = useCompanyId()
  const heading = useRef<HTMLHeadingElement>(null)
  const [editing, setEditing] = useState<Invoice | null>(null)
  // Список кладе рядок у кеш картки: шапка видна одразу, а рядки документа — з окремого запиту.
  const { data, isPending, isFetching, fetchStatus, error, refetch } =
    useGetOne<Invoice>(
      RESOURCE,
      { id, meta: companyScope(companyId) },
      { refetchOnMount: "always" },
    )
  const schema = useInvoiceSchema(extension)
  const {
    invoice,
    lines,
    error: invalid,
  } = useMemo(() => parseInvoiceDetail(data, schema), [data, schema])
  useEffect(() => {
    if (invalid) console.error("demo: invoice response", invalid)
  }, [invalid])
  const failure = error ?? (fetchStatus === "paused" ? OFFLINE : undefined)
  const retry = useCallback(() => {
    void refetch()
  }, [refetch])

  const pagesT = useTranslation("demo", { keyPrefix: "app.pages" }).t
  const title = invoice
    ? t("title", { number: invoice.number })
    : pagesT("invoice")
  useEffect(() => {
    document.title = `${title} · erp-ui`
  }, [title])

  // Запису немає (404) — «не знайдено», навіть якщо шапка була в кеші списку. Запис є, а запит
  // картки не вдався — це збій секції рядків, а не сторінки.
  const notFound = isApiError(error) && error.status === 404
  const pageError = notFound
    ? error
    : invoice
      ? undefined
      : (invalid ?? failure)
  const linesError =
    lines || isFetching ? undefined : (invalid ?? failure ?? MISSING_LINES)
  // Заголовок є: запис чи стан сторінки (прихований h1 «Рахунок»).
  useFocusHeadingOnNavigation(
    heading,
    useRouterLocation().pathname,
    !isPending || pageError !== undefined,
  )
  const slots = useRecordSlots({
    record: invoice,
    resource: RESOURCE,
    sections: extension.sections,
    actions: extension.actions,
  })
  const lock = useEditLock({ resource: RESOURCE, id })
  const startEditing = (record: Invoice) => {
    void lock.acquire().then((isAllowed) => {
      if (isAllowed) setEditing(record)
      else heading.current?.focus()
    })
  }
  const header = useInvoiceHeader(
    invoice,
    heading,
    startEditing,
    lock.reason,
    extension,
    slots.actions,
  )
  const sections: (ObjectPageSectionItem & { id: InvoiceSectionId })[] = invoice
    ? [
        {
          id: "lines",
          title: t("lines"),
          content: (
            <InvoiceLines
              invoice={invoice}
              lines={lines}
              isPending={!lines && isFetching}
              error={linesError}
              onRetry={retry}
            />
          ),
        },
      ]
    : []

  return (
    <>
      <ObjectPage
        title={pagesT("invoice")}
        headingRef={heading}
        back={<BackLink to={ROUTES.data} label={t("back")} />}
        isPending={isPending}
        error={pageError}
        onRetry={retry}
        header={header}
        notice={<EditLockNotice holder={lock.holder} />}
        statusBar={
          invoice ? (
            <RecordStatusBar
              label={t("steps")}
              steps={STEPS.map((step) => ({
                id: step,
                label: pageT(`statuses.${step}`),
              }))}
              current={STEP_OF[invoice.status]}
            />
          ) : null
        }
        aside={{
          label: t("history"),
          content: (
            <InvoiceHistory
              id={id}
              name={invoice?.number}
              version={invoice?.version}
            />
          ),
        }}
        sections={applyKeyedChanges(sections, slots.sections)}
      />
      {editing ? (
        <EditInvoiceDialog
          key={`${editing.id}-${String(editing.version)}`}
          invoice={editing}
          onReplace={setEditing}
          onClose={() => {
            setEditing(null)
            lock.release()
          }}
        />
      ) : null}
    </>
  )
}

/** Шапка картки: ключові поля й дії модуля разом із розширенням проекту; без запису — немає. */
function useInvoiceHeader(
  invoice: Invoice | undefined,
  heading: RefObject<HTMLHeadingElement | null>,
  onEdit: (invoice: Invoice) => void,
  lockReason: string | undefined,
  extension: InvoicesExtension,
  extensionActions: KeyedChanges<ObjectPageAction, InvoiceActionId> | undefined,
): ObjectPageHeader | undefined {
  const t = useCardT()
  const pageT = usePageT()
  const format = useFormat()
  const fields: (RecordField & { id: InvoiceFieldId })[] = invoice
    ? [
        { id: "client", label: pageT("columns.client"), value: invoice.client },
        {
          id: "date",
          label: pageT("columns.date"),
          value: format.date(invoice.date, "date"),
        },
        {
          id: "dueDate",
          label: pageT("columns.dueDate"),
          value: format.date(invoice.dueDate, "date"),
        },
        {
          id: "amount",
          label: pageT("columns.amount"),
          value: format.money({
            amount: invoice.amount,
            currency: invoice.currency,
          }),
        },
      ]
    : []
  const recordFields = useExtendedRecordFields(fields, invoice, extension)
  if (!invoice) return undefined
  const actions: (ObjectPageAction & { id: InvoiceActionId })[] = [
    ...(invoice.status === "draft"
      ? [
          {
            id: "approve" as const,
            node: <ApproveAction invoice={invoice} heading={heading} />,
          },
        ]
      : []),
    {
      id: "edit",
      node: (
        <EditAction invoice={invoice} onEdit={onEdit} lockReason={lockReason} />
      ),
    },
  ]
  return {
    title: t("title", { number: invoice.number }),
    status: <InvoiceStatusBadge status={invoice.status} />,
    fields: recordFields,
    actions: applyKeyedChanges(actions, extensionActions),
  }
}

function EditAction({
  invoice,
  onEdit,
  lockReason,
}: {
  invoice: Invoice
  onEdit: (invoice: Invoice) => void
  /** Рахунок редагує інша людина: режим перегляду (ADR-0051). */
  lockReason: string | undefined
}) {
  const t = useCardT()
  const pageT = usePageT()
  const { canAccess: canEdit, isPending } = useCanAccess({
    resource: RESOURCE,
    action: "edit",
  })
  const Edit = ACTION_ICONS.edit
  // Поки права невідомі — дії немає, а не «немає доступу», що за мить стане кнопкою.
  if (isPending) return null
  return canEdit === true && lockReason === undefined ? (
    <Button
      variant="outline"
      onClick={() => {
        onEdit(invoice)
      }}
    >
      <Edit aria-hidden />
      {t("edit")}
    </Button>
  ) : (
    <DeniedAction reason={lockReason ?? pageT("readOnlyHint")}>
      {t("edit")}
    </DeniedAction>
  )
}

function ApproveAction({
  invoice,
  heading,
}: {
  invoice: Invoice
  heading: RefObject<HTMLHeadingElement | null>
}) {
  const t = useCardT()
  const pageT = usePageT()
  const startApproval = useStartApproval()
  const { canAccess, isPending } = useCanAccess({
    resource: RESOURCE,
    action: "approve",
  })
  const [open, setOpen] = useState(false)
  // Задача йде: друге «Погодити» запустило б ще одну на той самий рахунок.
  const [busy, setBusy] = useState(false)
  // Чернетку погоджено, кнопка зникає разом із фокусом — фокус на заголовок, а не в нікуди
  // (WCAG 2.4.3). Очищення ref іде до видалення вузла з DOM: ще видно, що фокус був на ньому.
  const keepFocus = useCallback(
    (node: HTMLButtonElement | null) => {
      if (!node) return
      return () => {
        if (document.activeElement === node) heading.current?.focus()
      }
    },
    [heading],
  )

  if (isPending) return null
  if (canAccess !== true)
    return (
      <DeniedAction reason={pageT("approve.hint")}>
        {pageT("approve.button")}
      </DeniedAction>
    )
  const Icon = ACTION_ICONS.approve
  return (
    <>
      <Button
        ref={keepFocus}
        disabled={busy}
        focusableWhenDisabled
        aria-busy={busy || undefined}
        onClick={() => {
          preloadJobProgress()
          setOpen(true)
        }}
      >
        {busy ? <Spinner aria-hidden /> : <Icon aria-hidden />}
        {pageT("approve.button")}
      </Button>
      <ConfirmDialog
        open={open}
        title={t("approveTitle", { number: invoice.number })}
        description={t("approveDescription")}
        confirmLabel={t("approveConfirm")}
        // Задача встигла завершитись, поки діалог закривався: кнопки вже немає — на заголовок.
        returnFocus={() => heading.current}
        onClose={() => {
          setOpen(false)
        }}
        onConfirm={async () => {
          setBusy(true)
          const started = await startApproval(
            { ids: [invoice.id] },
            {
              onSettled: () => {
                setBusy(false)
              },
            },
          )
          if (started) setOpen(false)
          else setBusy(false)
        }}
      />
    </>
  )
}

/**
 * Місце стрічки запису (UI01, хвиля 1): історія змін рахунку з журналу аудиту й поле коментаря, яке
 * поки неактивне й пояснює чому.
 */
function InvoiceHistory({
  id,
  name,
  version,
}: {
  id: string
  name?: string
  version?: number
}) {
  const t = useCardT()
  const queryClient = useQueryClient()
  // Рахунок змінився (збереження, погодження задачею) — у журналі вже є подія: перечитати.
  const seen = useRef(version)
  useEffect(() => {
    if (seen.current === version) return
    seen.current = version
    void queryClient.invalidateQueries({ queryKey: AUDIT_QUERY_KEYS.events })
  }, [queryClient, version])
  return (
    <div className="space-y-4">
      <Field>
        <FieldLabel htmlFor="invoice-comment">{t("comment")}</FieldLabel>
        <Textarea
          id="invoice-comment"
          rows={2}
          disabled
          aria-describedby="invoice-comment-hint"
        />
        <FieldDescription id="invoice-comment-hint">
          {t("commentSoon")}
        </FieldDescription>
      </Field>
      <RecordHistory target={{ type: RESOURCE, id, name }} />
    </div>
  )
}
