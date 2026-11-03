/**
 * Мок потоку документів (UI13, ADR-0061): `GET /<ресурс>/:id/flow` за зв'язками записів мок-ресурсів.
 *
 *   createDocumentFlowHandlers({ sources: [
 *     documentFlowSource({ resource: "quotes", db: quotes.db, node: (quote) => ({ … }) }),
 *     documentFlowSource({ resource: "orders", db: orders.db, node, links: (order) => [ … ] }),
 *   ] })
 *
 * - Джерела — у порядку процесу: так іде й відповідь, тип за типом; у типі — за датою, від старшого.
 * - Обхід від документа запиту йде в обидва боки: за `links` (звідки документ), за записами, чиї `links`
 *   ведуть на нього, і за `related` (куди документ пішов: `amendedBy`, `reversedBy`), доки не набереться
 *   `DOCUMENT_FLOW_LIMIT`. Тоді відповідь має `truncated: true`.
 * - Запису немає в жодній компанії — `deleted` без номера; є, але людина його не бачить (немає права,
 *   чужа компанія, `read:own`) — `forbidden` з номером, як і в контракті: сервер вирішує, чи давати номер.
 * - Перевірки — як у контракті: сценарій ресурсу запиту, сесія, право `<ресурс>:read` (403), запис (404).
 */
import { http, type HttpHandler } from "msw/http"

import { API_PREFIX } from "@/registry/lib/api"
import {
  DOCUMENT_FLOW_LIMIT,
  DOCUMENT_FLOW_PATH,
  documentFlowKey,
  type DocumentFlowLink,
  type DocumentFlowNode,
} from "@/registry/lib/document-links"
import { mockRequestPermissions } from "@/registry/lib/mock-company-roles"
import { scenarioFor } from "@/registry/lib/mock-scenarios"
import { mockGrantsRecords } from "@/registry/lib/mock-scope"
import {
  applyScenario,
  currentMockUser,
  errorResponse,
  json,
  unauthenticated,
  type MockUser,
} from "@/registry/lib/mock-server"
import type { MockRecord, MockResourceDb } from "@/registry/lib/mocks"

/** Поля документа в потоці, коли людина може його відкрити. */
export type MockDocumentFlowFields = Omit<
  Extract<DocumentFlowNode, { access: "granted" }>,
  "resource" | "id" | "access" | "links"
>

/** Документ, на який посилаються: ресурс і `id`. */
export interface MockDocumentRef {
  readonly resource: string
  readonly id: string
}

export interface DocumentFlowSourceOptions<T extends MockRecord> {
  resource: string
  db: MockResourceDb<T>
  node: (record: T) => MockDocumentFlowFields
  /** Звідки документ; за замовчуванням — `amendedFrom` і `reversalOf` того самого ресурсу. */
  links?: (record: T) => DocumentFlowLink[]
  /** Куди документ пішов; за замовчуванням — `amendedBy` і `reversedBy` того самого ресурсу. */
  related?: (record: T) => MockDocumentRef[]
}

interface Viewer {
  readonly user: MockUser
  readonly permissions: string[]
  readonly companyId: string | null
}

interface FlowEntry {
  readonly node: DocumentFlowNode
  readonly next: readonly MockDocumentRef[]
  /** Дата для порядку в типі; немає — у кінці. */
  readonly date: string | undefined
}

/** Ресурс документів для потоку без типу запису: джерела різних ресурсів лежать в одному списку. */
export interface DocumentFlowMockSource {
  readonly resource: string
  /** Документ, яким його бачить людина; `null` — запису немає ніде. */
  readonly lookup: (id: string, viewer: Viewer) => FlowEntry | null
  /** Чи бачить людина документ запиту: без права — 403, невидимий — 404. */
  readonly access: (
    id: string,
    viewer: Viewer,
  ) => "ok" | "forbidden" | "missing"
  /** Зв'язки всіх записів ресурсу: зворотний обхід від документа до створених з нього. */
  readonly links: () => readonly (MockDocumentRef & {
    readonly links: readonly DocumentFlowLink[]
  })[]
}

const stringField = (record: MockRecord, field: string) => {
  const value = record[field]
  return typeof value === "string" && value ? value : undefined
}

/** Зв'язки життєвого циклу (ADR-0057) одного ресурсу. */
const lifecycleLinks =
  (resource: string) =>
  (record: MockRecord): DocumentFlowLink[] =>
    (["amendedFrom", "reversalOf"] as const).flatMap((kind) => {
      const id = stringField(record, kind)
      return id ? [{ kind, resource, id }] : []
    })

const lifecycleRelated =
  (resource: string) =>
  (record: MockRecord): MockDocumentRef[] =>
    ["amendedBy", "reversedBy"].flatMap((field) => {
      const id = stringField(record, field)
      return id ? [{ resource, id }] : []
    })

export function documentFlowSource<T extends MockRecord>({
  resource,
  db,
  node,
  links = lifecycleLinks(resource),
  related = lifecycleRelated(resource),
}: DocumentFlowSourceOptions<T>): DocumentFlowMockSource {
  const find = (id: string) => db.all().find((record) => record.id === id)
  const sees = (id: string, viewer: Viewer) => {
    const rules = db.accessOf(viewer.user, viewer.permissions)
    return (
      mockGrantsRecords(rules, "read") &&
      db.select({ id }, viewer.companyId, rules).length > 0
    )
  }
  return {
    resource,
    lookup: (id, viewer) => {
      const record = find(id)
      if (!record) return null
      const fields = node(record)
      const base = { resource, id, links: links(record) }
      return {
        node: sees(id, viewer)
          ? { ...base, access: "granted" as const, ...fields }
          : { ...base, access: "forbidden" as const, number: fields.number },
        next: related(record),
        date: fields.date,
      }
    },
    access: (id, viewer) => {
      if (
        !mockGrantsRecords(db.accessOf(viewer.user, viewer.permissions), "read")
      )
        return "forbidden"
      return sees(id, viewer) ? "ok" : "missing"
    },
    links: () =>
      db.all().map((record) => ({
        resource,
        id: record.id,
        links: links(record),
      })),
  }
}

/** Документи потоку від `start` в обидва боки, не більше `DOCUMENT_FLOW_LIMIT`. */
export function collectDocumentFlow(
  sources: readonly DocumentFlowMockSource[],
  start: MockDocumentRef,
  viewer: Viewer,
): { documents: DocumentFlowNode[]; truncated: boolean } {
  const byResource = new Map(sources.map((source) => [source.resource, source]))
  /** Хто посилається на документ: ключ цілі → документи, створені з неї. */
  const incoming = new Map<string, MockDocumentRef[]>()
  for (const source of sources)
    for (const entry of source.links())
      for (const link of entry.links) {
        const key = documentFlowKey(link.resource, link.id)
        const from = { resource: entry.resource, id: entry.id }
        const known = incoming.get(key)
        if (known) known.push(from)
        else incoming.set(key, [from])
      }
  const found = new Map<string, FlowEntry>()
  const queue: MockDocumentRef[] = [start]
  let truncated = false
  while (queue.length) {
    const ref = queue.shift()
    if (!ref) break
    const key = documentFlowKey(ref.resource, ref.id)
    if (found.has(key)) continue
    if (found.size === DOCUMENT_FLOW_LIMIT) {
      truncated = true
      break
    }
    const entry = byResource.get(ref.resource)?.lookup(ref.id, viewer) ?? {
      node: { resource: ref.resource, id: ref.id, access: "deleted" as const },
      next: [],
      date: undefined,
    }
    found.set(key, entry)
    queue.push(
      ...(entry.node.links ?? []),
      ...entry.next,
      ...(incoming.get(key) ?? []),
    )
  }
  const order = new Map(
    sources.map((source, index) => [source.resource, index]),
  )
  const documents = [...found.values()]
    .sort(
      (a, b) =>
        (order.get(a.node.resource) ?? order.size) -
          (order.get(b.node.resource) ?? order.size) ||
        compareDates(a.date, b.date) ||
        a.node.id.localeCompare(b.node.id),
    )
    .map((entry) => entry.node)
  return { documents, truncated }
}

const compareDates = (a: string | undefined, b: string | undefined) =>
  a === b ? 0 : a === undefined ? 1 : b === undefined ? -1 : a < b ? -1 : 1

/** `GET /<ресурс>/:id/flow` для кожного джерела. */
export function createDocumentFlowHandlers({
  sources,
  baseUrl = API_PREFIX,
}: {
  sources: readonly DocumentFlowMockSource[]
  baseUrl?: string
}): HttpHandler[] {
  return sources.map((source) =>
    http.get(
      `${baseUrl}/${source.resource}/:id/${DOCUMENT_FLOW_PATH}`,
      async ({ params, request }) => {
        const early = await applyScenario(scenarioFor(source.resource))
        if (early) return early
        const user = currentMockUser()
        if (!user) return unauthenticated()
        const scoped = mockRequestPermissions(request, user)
        if (scoped instanceof Response) return scoped
        const viewer = { user, ...scoped }
        const id = String(params.id)
        const access = source.access(id, viewer)
        if (access === "forbidden")
          return errorResponse(403, {
            code: "forbidden",
            message: `Missing permission ${source.resource}:read`,
          })
        if (access === "missing")
          return errorResponse(404, {
            code: "not_found",
            message: `${source.resource}: not found`,
          })
        return json(
          collectDocumentFlow(
            sources,
            { resource: source.resource, id },
            viewer,
          ),
        )
      },
    ),
  )
}
