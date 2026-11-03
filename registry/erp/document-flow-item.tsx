import { LockIcon, Trash2Icon } from "lucide-react"

import { RecordLink } from "@/registry/erp/record-link"
import { StatusBadge } from "@/registry/erp/status-badge"
import {
  documentFlowKey,
  type DocumentFlowLink,
  type DocumentFlowNode,
} from "@/registry/lib/document-links"
import type { DocumentState } from "@/registry/lib/document-lifecycle"
import { useFormat } from "@/registry/lib/format"
import { useErpUiT } from "@/registry/lib/i18n"
import type {
  ModuleStatus,
  ResolvedStatuses,
  StatusTone,
} from "@/registry/lib/statuses"
import { cn } from "@/registry/lib/utils"
import { Badge } from "@/registry/ui/badge"

/** Тип документа в потоці: підпис кроку, адреса картки й статуси модуля. */
export interface DocumentFlowType {
  /** Назва типу одниною: «Рахунок». */
  readonly label: string
  /** Адреса картки документа; без неї номер без посилання: сторінки типу в проекті немає. */
  readonly href?: (id: string) => string
  /** Статуси модуля мовою інтерфейсу (`useResolvedStatuses`); без них — стан документа кіта. */
  readonly statuses?: ResolvedStatuses
}

/** Стан кіта як бейдж, коли модуль не дав своїх статусів. */
const STATE_TONES = {
  draft: "neutral",
  submitted: "info",
  cancelled: "destructive",
} as const satisfies Record<DocumentState, StatusTone>

/**
 * Документ потоку (частина erp/document-flow): номер посиланням на картку, статус, дата й сума, звідки
 * документ. Без права читати й видалений — позначка без посилання; поточний — без посилання, з позначкою.
 */
export function DocumentFlowItem({
  node,
  type,
  isCurrent,
  numberOf,
}: {
  node: DocumentFlowNode
  type: DocumentFlowType | undefined
  isCurrent: boolean
  /** Номер документа, з якого цей, для підпису зв'язку; `undefined` — зв'язку не показуємо. */
  numberOf: (link: DocumentFlowLink) => string | undefined
}) {
  const t = useErpUiT()
  const format = useFormat()
  const title =
    node.number === undefined ? null : (node.number ?? t("numbering.noNumber"))
  const href =
    node.access === "granted" && !isCurrent ? type?.href?.(node.id) : undefined
  const status = node.access === "granted" ? statusOf(node, type, t) : null
  const details =
    node.access === "granted"
      ? [
          node.date ? format.date(node.date, "date") : null,
          node.total ? format.money(node.total) : null,
        ].filter((value) => value !== null)
      : []
  const relations = (node.links ?? []).flatMap((link) => {
    const number = numberOf(link)
    return number === undefined
      ? []
      : [
          {
            key: `${link.kind}:${documentFlowKey(link.resource, link.id)}`,
            text: t(`documentFlow.links.${link.kind}`, { number }),
          },
        ]
  })
  return (
    <li
      data-slot="document-flow-item"
      data-access={node.access}
      aria-current={isCurrent ? "page" : undefined}
      className={cn(
        "min-w-0 space-y-1.5 rounded-lg border bg-card p-3 text-sm",
        isCurrent && "border-primary ring-1 ring-primary",
        node.access !== "granted" && "border-dashed",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {title === null ? null : href ? (
          <RecordLink to={href}>
            <span className="tabular-nums">{title}</span>
          </RecordLink>
        ) : (
          <span
            className={cn(
              "font-medium break-words tabular-nums",
              node.access !== "granted" && "text-muted-foreground",
            )}
          >
            {title}
          </span>
        )}
        {status ? <StatusBadge status={status} /> : null}
        {node.access === "forbidden" ? (
          <Badge variant="secondary">
            <LockIcon aria-hidden />
            {t("documentFlow.forbidden")}
          </Badge>
        ) : null}
        {node.access === "deleted" ? (
          <Badge variant="secondary">
            <Trash2Icon aria-hidden />
            {t("documentFlow.deleted")}
          </Badge>
        ) : null}
      </div>
      {details.length ? (
        <p className="text-muted-foreground tabular-nums">
          {details.join(" · ")}
        </p>
      ) : null}
      {relations.map((relation) => (
        <p key={relation.key} className="text-muted-foreground">
          {relation.text}
        </p>
      ))}
      {isCurrent ? <Badge>{t("documentFlow.current")}</Badge> : null}
    </li>
  )
}

/** Статус модуля, якщо тип дав статуси, інакше стан кіта; нічого не прийшло — без бейджа. */
function statusOf(
  node: Extract<DocumentFlowNode, { access: "granted" }>,
  type: DocumentFlowType | undefined,
  t: ReturnType<typeof useErpUiT>,
): ModuleStatus | string | null {
  if (node.status && type?.statuses)
    return type.statuses.byId.get(node.status) ?? node.status
  if (node.docStatus)
    return {
      id: node.docStatus,
      label: t(`documentStates.${node.docStatus}`),
      tone: STATE_TONES[node.docStatus],
    }
  return node.status ?? null
}
