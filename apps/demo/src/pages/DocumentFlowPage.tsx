import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import {
  DocumentFlowView,
  type DocumentFlowType,
} from "@/registry/erp/document-flow"
import type { DocumentFlow } from "@/registry/lib/document-links"
import type { ResolvedStatuses, StatusTone } from "@/registry/lib/statuses"

import { ROUTES, useSearchParam } from "@/router"

import {
  DEFAULT_CURRENT,
  FLOW_ERRORS,
  FLOW_TYPES,
  FLOWS,
  type FlowType,
} from "./document-flow-variants"
import { PageHeader } from "./PageHeader"
import { Section } from "./Section"

/** Статуси модуля для типів, що мають свої; решта показує стан документа кіта. */
const MODULE_STATUSES: Partial<
  Record<FlowType, readonly { id: "accepted" | "shipped"; tone: StatusTone }[]>
> = {
  quotes: [{ id: "accepted", tone: "success" }],
  shipments: [{ id: "shipped", tone: "success" }],
}

const currentHref = (resource: string, id: string) =>
  `${ROUTES.documentFlow}?current=${encodeURIComponent(`${resource}:${id}`)}`

/** Типи потоку мовою інтерфейсу; посилання робить документ поточним, як перехід на його картку. */
function useFlowTypes(): Record<FlowType, DocumentFlowType> {
  const { t } = useTranslation("demo", { keyPrefix: "documentFlowPage" })
  const statusesOf = (type: FlowType): ResolvedStatuses | undefined => {
    const list = MODULE_STATUSES[type]?.map((status) => ({
      ...status,
      label: t(`statuses.${status.id}`),
    }))
    return list
      ? { options: list, byId: new Map(list.map((s) => [s.id, s])) }
      : undefined
  }
  return Object.fromEntries(
    FLOW_TYPES.map((type) => [
      type,
      {
        label: t(`types.${type}`),
        href: (id: string) => currentHref(type, id),
        statuses: statusesOf(type),
      },
    ]),
  ) as Record<FlowType, DocumentFlowType>
}

/** Потік документів (UI13, ADR-0061): ланцюг, вузький контейнер, сторно й усі стани без запитів. */
export function DocumentFlowPage() {
  const { t } = useTranslation()
  const types = useFlowTypes()
  const [resource = "orders", id = "o-7"] = (
    useSearchParam("current") ?? DEFAULT_CURRENT
  ).split(":")
  const variant = (
    flow: DocumentFlow | undefined,
    options: { error?: unknown; current?: [string, string] } = {},
  ) => {
    const [ownResource, ownId] = options.current ?? [resource, id]
    return (
      <DocumentFlowView
        resource={ownResource}
        id={ownId}
        types={types}
        flow={flow}
        error={options.error}
        onRetry={() => {
          toast(t("documentFlowPage.noRequest"))
        }}
      />
    )
  }
  return (
    <div className="space-y-6">
      <PageHeader
        title={t("app.pages.documentFlow")}
        lead={t("documentFlowPage.lead")}
      />
      <Section
        title={t("documentFlowPage.saleTitle")}
        description={t("documentFlowPage.saleDescription")}
      >
        {variant(FLOWS.sale)}
      </Section>
      <Section
        title={t("documentFlowPage.narrowTitle")}
        description={t("documentFlowPage.narrowDescription")}
      >
        <div className="max-w-sm" data-testid="flow-narrow">
          {variant(FLOWS.sale)}
        </div>
      </Section>
      <Section
        title={t("documentFlowPage.reversalTitle")}
        description={t("documentFlowPage.reversalDescription")}
      >
        {variant(FLOWS.reversal, { current: ["invoices", "i-31"] })}
      </Section>
      <Section
        title={t("documentFlowPage.statesTitle")}
        description={t("documentFlowPage.statesDescription")}
      >
        <div className="grid gap-4 md:grid-cols-2">
          {(
            [
              ["loading", variant(undefined)],
              ["empty", variant(FLOWS.empty, { current: ["orders", "o-7"] })],
              ["error", variant(undefined, { error: FLOW_ERRORS.error })],
              ["offline", variant(undefined, { error: FLOW_ERRORS.offline })],
              [
                "forbidden",
                variant(undefined, { error: FLOW_ERRORS.forbidden }),
              ],
              [
                "refresh",
                variant(FLOWS.short, {
                  error: FLOW_ERRORS.offline,
                  current: ["orders", "o-7"],
                }),
              ],
              [
                "truncated",
                variant(FLOWS.truncated, { current: ["orders", "o-7"] }),
              ],
            ] as const
          ).map(([state, content]) => (
            <figure key={state} className="space-y-2 rounded-lg border p-3">
              <figcaption className="text-sm font-medium">
                {t(`documentFlowPage.states.${state}`)}
              </figcaption>
              {content}
            </figure>
          ))}
        </div>
      </Section>
    </div>
  )
}
