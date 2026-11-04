import {
  ChevronRightIcon,
  LockIcon,
  TriangleAlertIcon,
  WifiOffIcon,
  type LucideIcon,
} from "lucide-react"
import * as React from "react"

import {
  DocumentFlowItem,
  type DocumentFlowType,
} from "@/registry/erp/document-flow-item"
import { useDocumentFlow } from "@/registry/hooks/use-document-flow"
import { errorStateKind } from "@/registry/lib/api"
import {
  documentFlowKey,
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
 * - Дані — `useDocumentFlow` (hooks/use-document-flow, `GET /<ресурс>/:id/flow`); ключ запиту
 *   починається з ресурсу, тож дія над документом і подія каналу про нього перечитують потік.
 * - «Спробувати ще» переносить фокус на сам потік: кнопка зникає разом зі станом, а фокус не падає на
 *   `body`.
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
  /** Запит на паузі без мережі (TanStack Query): без даних — стан «Немає з'єднання», а не скелетон. */
  isPaused?: boolean
  onRetry?: () => void
}

export function DocumentFlow(props: DocumentFlowProps) {
  const query = useDocumentFlow(props.resource, props.id)
  return (
    <DocumentFlowView
      {...props}
      flow={query.data}
      error={query.error}
      isFetching={query.isFetching}
      isPaused={query.fetchStatus === "paused"}
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
  isPaused = false,
  onRetry,
}: DocumentFlowViewProps) {
  const t = useErpUiT()
  const root = React.useRef<HTMLDivElement>(null)
  const isUpdating = useAfterDelay(
    isFetching && flow !== undefined,
    BUSY_DELAY_MS,
  )
  const retry = onRetry
    ? () => {
        // Кнопка зникає разом зі станом: фокус лишається в потоці, а не падає на `body`.
        // Без мережі запит знову стає на паузу, стан не змінюється, і фокус лишається на кнопці.
        if (!isPaused) root.current?.focus()
        onRetry()
      }
    : undefined
  const isCurrent = (node: DocumentFlowNode) =>
    node.resource === resource && node.id === id
  let content: React.ReactNode
  if (!flow)
    content =
      error || isPaused ? (
        <FlowMessage
          kind={error ? errorStateKind(error) : "offline"}
          isFetching={isFetching}
          onRetry={retry}
        />
      ) : (
        <DocumentFlowSkeleton />
      )
  else
    content = (
      <>
        {/* Оновлення видно й скрінрідеру через `aria-busy` списку; спінер лише для очей. */}
        {isUpdating && !error ? (
          <Spinner aria-hidden className="absolute end-0 top-0" />
        ) : null}
        {error ? (
          <FlowMessage kind="refresh" isFetching={isFetching} onRetry={retry} />
        ) : null}
        {flow.documents.some((node) => !isCurrent(node)) ? (
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
      </>
    )
  return (
    <div
      ref={root}
      tabIndex={-1}
      data-slot="document-flow"
      className={cn(
        "@container relative space-y-3 focus-visible:outline-none",
        className,
      )}
    >
      {content}
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
  const baseId = React.useId()
  const steps = documentFlowSteps(documents)
  const byKey = new Map(
    documents.map((node) => [documentFlowKey(node.resource, node.id), node]),
  )
  // Документ без номера в підписі зв'язку нічого не скаже: зв'язок тоді не підписуємо.
  const numberOf = (link: DocumentFlowLink) =>
    byKey.get(documentFlowKey(link.resource, link.id))?.number ?? undefined
  return (
    <ol
      aria-label={label}
      aria-busy={isBusy || undefined}
      // Рядком лише з 56rem: кроки стоять в один ряд рівними колонками, а не 3 + 1 зі стрілкою на початку.
      className="grid gap-4 @4xl:auto-cols-fr @4xl:grid-flow-col @4xl:gap-x-6"
    >
      {steps.map((step, index) => {
        const stepId = `${baseId}-${String(index)}`
        const hasCurrent = step.documents.some(isCurrent)
        return (
          <li
            key={step.resource}
            data-slot="document-flow-step"
            className="relative min-w-0 ps-7 @4xl:ps-0"
          >
            {index < steps.length - 1 ? (
              <span
                aria-hidden
                className="absolute start-[0.4375rem] top-5 -bottom-4 w-0.5 bg-border @4xl:hidden"
              />
            ) : null}
            <span
              aria-hidden
              className={cn(
                "absolute start-0 top-0.5 size-4 rounded-full border-2 @4xl:hidden",
                hasCurrent
                  ? "border-primary bg-primary"
                  : "border-border bg-background",
              )}
            />
            <p id={stepId} className="mb-2 flex items-center gap-1 font-medium">
              {index > 0 ? (
                <ChevronRightIcon
                  aria-hidden
                  className="hidden size-4 shrink-0 text-muted-foreground @4xl:block rtl:rotate-180"
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
}: {
  kind: keyof typeof MESSAGES
  isFetching: boolean
  onRetry: (() => void) | undefined
}) {
  const t = useErpUiT()
  const { icon: Icon, text } = MESSAGES[kind]
  const canRetry = onRetry !== undefined && kind !== "forbidden"
  return (
    <div
      data-slot="document-flow-state"
      data-kind={kind}
      role={kind === "forbidden" ? undefined : "alert"}
      className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed p-4 text-sm"
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

function DocumentFlowSkeleton() {
  const t = useErpUiT()
  return (
    <div
      data-slot="document-flow-skeleton"
      role="status"
      aria-label={t("documentFlow.loading")}
      aria-busy
      className="grid gap-4 @4xl:grid-cols-3"
    >
      {[0, 1, 2].map((step) => (
        <div key={step} className="space-y-2">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-20 w-full rounded-lg" />
        </div>
      ))}
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
