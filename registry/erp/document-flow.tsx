import { useQuery } from "@tanstack/react-query"
import {
  ChevronRightIcon,
  LockIcon,
  TriangleAlertIcon,
  WifiOffIcon,
  type LucideIcon,
} from "lucide-react"
import { useDataProvider } from "ra-core"
import * as React from "react"

import {
  DocumentFlowItem,
  type DocumentFlowType,
} from "@/registry/erp/document-flow-item"
import { useCompanyId } from "@/registry/hooks/use-company"
import { errorStateKind } from "@/registry/lib/api"
import type { ErpDataProvider } from "@/registry/lib/data-provider"
import {
  documentFlowKey,
  documentFlowQueryKey,
  documentFlowSteps,
  type DocumentFlow as DocumentFlowData,
  type DocumentFlowLink,
  type DocumentFlowNode,
} from "@/registry/lib/document-links"
import { useErpUiT, type ErpUiKey } from "@/registry/lib/i18n"
import { cn } from "@/registry/lib/utils"
import { Button } from "@/registry/ui/button"
import { Skeleton } from "@/registry/ui/skeleton"
import { Spinner } from "@/registry/ui/spinner"

export type { DocumentFlowType }

/**
 * Потік документів на картці (UI13, ADR-0061): цей документ і пов'язані з ним за типами в порядку
 * процесу, статус кожного, перехід на картку посиланням. Документ без права читати — позначка без
 * посилання, видалений — позначка; на широкому контейнері кроки рядком, на вузькому (телефон) —
 * вертикально.
 *
 *   <DocumentFlow resource="orders" id={record.id} types={{
 *     quotes: { label: "Пропозиція", href: paths.quote, statuses: quoteStatuses },
 *     orders: { label: "Замовлення", href: paths.order, statuses },
 *   }} />
 *
 * - Дані — `getDocumentFlow` провайдера (`GET /<ресурс>/:id/flow`); ключ запиту починається з ресурсу,
 *   тож дія над документом і подія каналу про нього перечитують потік.
 * - Тип, якого немає в `types`, підписаний назвою ресурсу й без посилань.
 * - `DocumentFlowView` — те саме без запиту: дані й стан передає модуль (свій запит, демо).
 */

/** SPEC §8.2: оновлення до 1 с — без індикатора. */
const BUSY_DELAY_MS = 1000

export interface DocumentFlowProps {
  /** Ресурс і `id` документа картки: від нього сервер будує потік, і він позначений як поточний. */
  resource: string
  id: string
  /** Типи документів потоку: назва, адреса картки, статуси модуля. */
  types: Readonly<Record<string, DocumentFlowType>>
  /** Назва списку кроків для скрінрідера; за замовчуванням «Потік документів». */
  label?: string
  className?: string
}

export interface DocumentFlowViewProps extends DocumentFlowProps {
  /** Відповідь сервера; немає й немає помилки — первинне завантаження. */
  flow: DocumentFlowData | undefined
  /** Помилка запиту: без даних — замість потоку, з даними — рядком над ними. */
  error?: unknown
  /** Запит іде: «Спробувати ще» неактивна, а оновлення понад 1 с видно індикатором. */
  isFetching?: boolean
  onRetry?: () => void
}

/** Потік документа з сервера. */
export function useDocumentFlow(resource: string, id: string) {
  const dataProvider = useDataProvider<ErpDataProvider>()
  const companyId = useCompanyId()
  return useQuery({
    queryKey: documentFlowQueryKey(resource, id, companyId),
    queryFn: ({ signal }) =>
      dataProvider.getDocumentFlow(resource, id, { signal }),
  })
}

export function DocumentFlow(props: DocumentFlowProps) {
  const query = useDocumentFlow(props.resource, props.id)
  return (
    <DocumentFlowView
      {...props}
      flow={query.data}
      error={query.error}
      isFetching={query.isFetching}
      onRetry={() => {
        void query.refetch()
      }}
    />
  )
}

export function DocumentFlowView({
  resource,
  id,
  types,
  label,
  className,
  flow,
  error,
  isFetching = false,
  onRetry,
}: DocumentFlowViewProps) {
  const t = useErpUiT()
  const isUpdating = useAfterDelay(
    isFetching && flow !== undefined,
    BUSY_DELAY_MS,
  )
  if (!flow)
    return error ? (
      <FlowMessage
        kind={errorStateKind(error)}
        isFetching={isFetching}
        onRetry={onRetry}
        className={className}
      />
    ) : (
      <DocumentFlowSkeleton className={className} />
    )
  const isCurrent = (node: DocumentFlowNode) =>
    node.resource === resource && node.id === id
  const hasRelated = flow.documents.some((node) => !isCurrent(node))
  return (
    <div
      data-slot="document-flow"
      className={cn("@container relative space-y-3", className)}
    >
      {isUpdating ? (
        <Spinner
          label={t("documentFlow.updating")}
          className="absolute end-0 top-0"
        />
      ) : null}
      {error ? (
        <FlowMessage kind="refresh" isFetching={isFetching} onRetry={onRetry} />
      ) : null}
      {hasRelated ? (
        <FlowSteps
          documents={flow.documents}
          types={types}
          label={label ?? t("documentFlow.label")}
          isCurrent={isCurrent}
          isBusy={isFetching}
        />
      ) : (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          {t("documentFlow.empty")}
        </p>
      )}
      {flow.truncated ? (
        <p className="text-sm text-muted-foreground">
          {t("documentFlow.truncated")}
        </p>
      ) : null}
    </div>
  )
}

/** Кроки за типами: на вузькому — вертикальна лінія з точкою кроку, на широкому — колонки зі стрілкою. */
function FlowSteps({
  documents,
  types,
  label,
  isCurrent,
  isBusy,
}: {
  documents: readonly DocumentFlowNode[]
  types: DocumentFlowProps["types"]
  label: string
  isCurrent: (node: DocumentFlowNode) => boolean
  isBusy: boolean
}) {
  const t = useErpUiT()
  const baseId = React.useId()
  const steps = documentFlowSteps(documents)
  const byKey = new Map(
    documents.map((node) => [documentFlowKey(node.resource, node.id), node]),
  )
  const numberOf = (link: DocumentFlowLink) => {
    const target = byKey.get(documentFlowKey(link.resource, link.id))
    if (target?.number === undefined) return undefined
    return target.number ?? t("numbering.noNumber")
  }
  return (
    <ol
      aria-label={label}
      aria-busy={isBusy || undefined}
      className="grid gap-4 @2xl:grid-cols-[repeat(auto-fit,minmax(12rem,1fr))] @2xl:gap-x-6"
    >
      {steps.map((step, index) => {
        const stepId = `${baseId}-${String(index)}`
        const hasCurrent = step.documents.some(isCurrent)
        return (
          <li
            key={step.resource}
            data-slot="document-flow-step"
            className="relative min-w-0 ps-7 @2xl:ps-0"
          >
            {index < steps.length - 1 ? (
              <span
                aria-hidden
                className="absolute start-[0.4375rem] top-5 -bottom-4 w-0.5 bg-border @2xl:hidden"
              />
            ) : null}
            <span
              aria-hidden
              className={cn(
                "absolute start-0 top-0.5 size-4 rounded-full border-2 @2xl:hidden",
                hasCurrent
                  ? "border-primary bg-primary"
                  : "border-border bg-background",
              )}
            />
            <p id={stepId} className="mb-2 flex items-center gap-1 font-medium">
              {index > 0 ? (
                <ChevronRightIcon
                  aria-hidden
                  className="hidden size-4 shrink-0 text-muted-foreground @2xl:block rtl:rotate-180"
                />
              ) : null}
              <span className="min-w-0 break-words">
                {types[step.resource]?.label ?? step.resource}
              </span>
            </p>
            <ul aria-labelledby={stepId} className="space-y-2">
              {step.documents.map((node) => (
                <DocumentFlowItem
                  key={documentFlowKey(node.resource, node.id)}
                  node={node}
                  type={types[node.resource]}
                  isCurrent={isCurrent(node)}
                  numberOf={numberOf}
                />
              ))}
            </ul>
          </li>
        )
      })}
    </ol>
  )
}

const MESSAGES = {
  error: { icon: TriangleAlertIcon, text: "documentFlow.error" },
  offline: { icon: WifiOffIcon, text: "documentFlow.offline" },
  forbidden: { icon: LockIcon, text: "documentFlow.denied" },
  refresh: { icon: TriangleAlertIcon, text: "documentFlow.refresh" },
} as const satisfies Record<string, { icon: LucideIcon; text: ErpUiKey }>

/** Стан замість потоку чи над ним: помилка, офлайн, немає права, не вдалось оновити. */
function FlowMessage({
  kind,
  isFetching,
  onRetry,
  className,
}: {
  kind: keyof typeof MESSAGES
  isFetching: boolean
  onRetry: (() => void) | undefined
  className?: string
}) {
  const t = useErpUiT()
  const { icon: Icon, text } = MESSAGES[kind]
  const canRetry = onRetry !== undefined && kind !== "forbidden"
  return (
    <div
      data-slot="document-flow-state"
      data-kind={kind}
      role={kind === "forbidden" ? undefined : "alert"}
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-lg border border-dashed p-4 text-sm",
        className,
      )}
    >
      <p
        className={cn(
          "flex min-w-0 flex-1 items-center gap-2",
          kind === "forbidden" ? "text-muted-foreground" : "text-foreground",
        )}
      >
        <Icon aria-hidden className="size-4 shrink-0" />
        {t(text)}
      </p>
      {canRetry ? (
        <Button
          variant="outline"
          size="sm"
          disabled={isFetching}
          onClick={onRetry}
        >
          {isFetching ? <Spinner aria-hidden /> : null}
          {t("pageState.error.retry")}
        </Button>
      ) : null}
    </div>
  )
}

function DocumentFlowSkeleton({ className }: { className?: string }) {
  const t = useErpUiT()
  return (
    <div
      data-slot="document-flow-skeleton"
      role="status"
      aria-label={t("documentFlow.loading")}
      aria-busy
      className={cn("@container", className)}
    >
      <div className="grid gap-4 @2xl:grid-cols-3">
        {[0, 1, 2].map((step) => (
          <div key={step} className="space-y-2">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-20 w-full rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  )
}

/** `flag`, що тримається довше за `delayMs`: коротке оновлення не блимає індикатором. */
function useAfterDelay(flag: boolean, delayMs: number): boolean {
  const [isLate, setLate] = React.useState(false)
  React.useEffect(() => {
    if (!flag) return
    const timer = setTimeout(() => {
      setLate(true)
    }, delayMs)
    return () => {
      clearTimeout(timer)
      setLate(false)
    }
  }, [flag, delayMs])
  return flag && isLate
}
