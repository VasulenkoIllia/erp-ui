/**
 * Потік документів (UI13, ADR-0061): ланцюг пов'язаних документів зі статусами — пропозиція, замовлення,
 * відвантаження, рахунок, а в межах типу ще виправлена копія й сторно (ADR-0057).
 *
 * Контракт (під `/api/v1`):
 * - `GET /<ресурс>/:id/flow` → `{ documents, truncated? }`: цей документ і пов'язані з ним, у порядку
 *   процесу — тип за типом, у типі від старшого до новішого. Кого показати, вирішує сервер: кіт не ходить
 *   по зв'язках сам і не робить запиту на кожен документ.
 * - Документ: `resource` (ресурс API, він же тип), `id`, `number` (`null` — чернетка без номера,
 *   ADR-0058) і `access`:
 *   - `granted` — людина може відкрити документ; ще `date`, `status` (статус модуля), `docStatus`, `total`;
 *   - `forbidden` — права читати документ немає: лише тип і номер, якщо сервер його дає; решту полів кіт
 *     відкидає, навіть якщо вони прийшли;
 *   - `deleted` — документ видалено: тип і номер, якщо був.
 * - `links` — звідки документ: `basedOn` (створено з іншого: замовлення з пропозиції), `amendedFrom`
 *   (виправлена копія скасованого), `reversalOf` (сторно проведеного). Ціль — документ тієї самої відповіді;
 *   зв'язку з документом поза нею інтерфейс не показує.
 * - Право — `<ресурс>:read` на документ запиту (403, 404). Право на кожен інший документ сервер перевіряє
 *   окремо й ставить `forbidden`, а не пропускає документ: ланцюг не рветься.
 * - Документів не більше `DOCUMENT_FLOW_LIMIT`: решту сервер відрізає й ставить `truncated: true`. Довшу
 *   відповідь кіт обрізає сам і вважає обрізаною.
 */
import { z } from "zod"

import { moneyAmountSchema } from "@/registry/lib/api"
import { companyScope } from "@/registry/lib/company-scope"
import { DOCUMENT_STATES } from "@/registry/lib/document-lifecycle"

export const DOCUMENT_FLOW_PATH = "flow"
/** Документів у відповіді: потік показує найближчі, а не всю історію клієнта. */
export const DOCUMENT_FLOW_LIMIT = 100
/** Потік — частина картки: сервер, що мовчить, не тримає її в скелетоні без виходу. */
export const DOCUMENT_FLOW_TIMEOUT_MS = 15_000

export const DOCUMENT_FLOW_ACCESS = ["granted", "forbidden", "deleted"] as const
export type DocumentFlowAccess = (typeof DOCUMENT_FLOW_ACCESS)[number]

export const DOCUMENT_FLOW_LINK_KINDS = [
  "basedOn",
  "amendedFrom",
  "reversalOf",
] as const
export type DocumentFlowLinkKind = (typeof DOCUMENT_FLOW_LINK_KINDS)[number]

export const documentFlowLinkSchema = z.object({
  kind: z.enum(DOCUMENT_FLOW_LINK_KINDS),
  resource: z.string().min(1),
  id: z.string().min(1),
})
export type DocumentFlowLink = z.infer<typeof documentFlowLinkSchema>

const nodeBase = {
  resource: z.string().min(1),
  id: z.string().min(1),
  links: z.array(documentFlowLinkSchema).optional(),
}

export const documentFlowNodeSchema = z.discriminatedUnion("access", [
  z.object({
    ...nodeBase,
    access: z.literal("granted"),
    number: z.string().min(1).nullable(),
    /** Дата документа, ISO: `2026-11-02`. */
    date: z.string().min(1).optional(),
    /** Статус модуля (`lib/statuses`). */
    status: z.string().min(1).optional(),
    docStatus: z.enum(DOCUMENT_STATES).optional(),
    /** Сума документа в мінорних одиницях; у сторно — з мінусом. */
    total: z
      .object({ amount: moneyAmountSchema, currency: z.string().length(3) })
      .optional(),
  }),
  z.object({
    ...nodeBase,
    access: z.literal("forbidden"),
    number: z.string().min(1).nullable().optional(),
  }),
  z.object({
    ...nodeBase,
    access: z.literal("deleted"),
    number: z.string().min(1).nullable().optional(),
  }),
])
export type DocumentFlowNode = z.infer<typeof documentFlowNodeSchema>

export const documentFlowSchema = z
  .object({
    documents: z.array(documentFlowNodeSchema),
    truncated: z.boolean().optional(),
  })
  .transform(({ documents, truncated = false }) =>
    documents.length > DOCUMENT_FLOW_LIMIT
      ? { documents: documents.slice(0, DOCUMENT_FLOW_LIMIT), truncated: true }
      : { documents, truncated },
  )
export type DocumentFlow = z.output<typeof documentFlowSchema>

/** Ключ документа в потоці: `id` унікальний лише в межах ресурсу. */
export const documentFlowKey = (resource: string, id: string) =>
  `${resource}:${id}`

export interface DocumentFlowStep {
  readonly resource: string
  readonly documents: readonly DocumentFlowNode[]
}

/** Кроки потоку: документи за типом у порядку, в якому тип уперше з'явився у відповіді сервера. */
export function documentFlowSteps(
  documents: readonly DocumentFlowNode[],
): DocumentFlowStep[] {
  const steps = new Map<string, DocumentFlowNode[]>()
  for (const document of documents) {
    const step = steps.get(document.resource)
    if (step) step.push(document)
    else steps.set(document.resource, [document])
  }
  return [...steps].map(([resource, items]) => ({
    resource,
    documents: items,
  }))
}

/**
 * Ключ запиту потоку: починається з ресурсу, як ключі ra-core, тож подія каналу про документ і
 * перечитування ресурсу після дії над ним (ADR-0051, ADR-0057) оновлюють і потік.
 */
export const documentFlowQueryKey = (
  resource: string,
  id: string,
  companyId: string | null,
) => [resource, "getDocumentFlow", { id, meta: companyScope(companyId) }]
