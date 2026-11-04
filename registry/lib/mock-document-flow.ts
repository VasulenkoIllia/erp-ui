/**
 * Мок потоку документів (UI13, ADR-0061): `GET /<ресурс>/:id/flow` за зв'язками записів мок-ресурсів.
 *
 *   createDocumentFlowHandlers({ sources: [
 *     documentFlowSource({ resource: "quotes", db: quotes.db, node: (quote) => ({ … }) }),
 *     documentFlowSource({ resource: "orders", db: orders.db, node, links: (order) => [ … ] }),
 *   ] })
 *
 * - Джерела — у порядку процесу: так іде й відповідь, тип за типом. У типі — за датою, від старшого; за
 *   той самий день документ іде перед створеним із нього.
 * - Обхід від документа запиту йде в обидва боки: за `links` (звідки документ), за записами, чиї `links`
 *   ведуть на нього, і за `related` (куди документ пішов: `amendedBy`, `reversedBy`), доки не набереться
 *   `DOCUMENT_FLOW_LIMIT`. Тоді відповідь має `truncated: true`. Документ запиту — завжди перший знайдений.
 * - Запису немає — `deleted` без номера; є, але людина його не бачить (немає права, `read:own`) —
 *   `forbidden` з номером (контракт лишає це серверу). Обхід іде й крізь нього: кожен наступний документ
 *   маскується своїм правом. Запис іншої компанії (ADR-0036) і ресурс без джерела в потік не потрапляють.
 * - Сховище читається один раз на джерело за запит (`db.all()`), видимість — за одним записом.
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
import {
  inMockCompany,
  mockGrantsRecords,
  mockSeesRecord,
} from "@/registry/lib/mock-scope"
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

/** Хто питає: людина, її права й компанія запиту. */
export interface MockFlowViewer {
  readonly user: MockUser
  readonly permissions: string[]
  readonly companyId: string | null
}

/** Документ потоку з тим, куди обхід піде далі. */
export interface MockFlowEntry {
  readonly node: DocumentFlowNode
  readonly next: readonly MockDocumentRef[]
  /** Дата для порядку в типі; немає — у кінці. */
  readonly date: string | undefined
}

/** Записи ресурсу, якими їх бачить людина, на час одного запиту. */
export interface MockFlowSnapshot {
  /** Документ запиту: без права — 403, невидимий — 404. */
  readonly access: (id: string) => "ok" | "forbidden" | "missing"
  /** Документ потоку; `null` — запису немає, `"hidden"` — запис іншої компанії. */
  readonly lookup: (id: string) => MockFlowEntry | "hidden" | null
  /** Зв'язки записів компанії: зворотний обхід від документа до створених із нього. */
  readonly links: readonly (MockDocumentRef & {
    readonly links: readonly DocumentFlowLink[]
  })[]
}

/** Ресурс документів для потоку без типу запису: джерела різних ресурсів лежать в одному списку. */
export interface DocumentFlowMockSource {
  readonly resource: string
  readonly snapshot: (viewer: MockFlowViewer) => MockFlowSnapshot
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
  return {
    resource,
    snapshot: (viewer) => {
      const records = db.all()
      const byId = new Map(records.map((record) => [record.id, record]))
      const rules = db.accessOf(viewer.user, viewer.permissions)
      const canRead = mockGrantsRecords(rules, "read")
      const inCompany = (record: T) =>
        inMockCompany(record.companyId, viewer.companyId)
      const sees = (record: T) => canRead && mockSeesRecord(rules, record)
      return {
        access: (id) => {
          if (!canRead) return "forbidden"
          const record = byId.get(id)
          return record && inCompany(record) && sees(record) ? "ok" : "missing"
        },
        lookup: (id) => {
          const record = byId.get(id)
          if (!record) return null
          if (!inCompany(record)) return "hidden"
          const fields = node(record)
          const base = { resource, id, links: links(record) }
          return {
            node: sees(record)
              ? { ...base, access: "granted" as const, ...fields }
              : {
                  ...base,
                  access: "forbidden" as const,
                  number: fields.number,
                },
            next: related(record),
            date: fields.date,
          }
        },
        links: records.filter(inCompany).map((record) => ({
          resource,
          id: record.id,
          links: links(record),
        })),
      }
    },
  }
}

/** Хто посилається на документ: ключ цілі → документи, створені з неї. */
function incomingLinks(snapshots: readonly MockFlowSnapshot[]) {
  const incoming = new Map<string, MockDocumentRef[]>()
  for (const snapshot of snapshots)
    for (const entry of snapshot.links)
      for (const link of entry.links) {
        const key = documentFlowKey(link.resource, link.id)
        const from = { resource: entry.resource, id: entry.id }
        const known = incoming.get(key)
        if (known) known.push(from)
        else incoming.set(key, [from])
      }
  return incoming
}

const compareDates = (a: string | undefined, b: string | undefined) =>
  a === b ? 0 : a === undefined ? 1 : b === undefined ? -1 : a < b ? -1 : 1

/**
 * Глибина документа в типі: скільки документів того самого типу стоїть перед ним за зв'язками.
 * За той самий день документ іде перед створеним із нього, і в ланцюгу копій теж, а не лише в парі.
 */
function depthsInType(found: ReadonlyMap<string, MockFlowEntry>) {
  const depths = new Map<string, number>()
  const depthOf = (key: string, seen: Set<string>): number => {
    const known = depths.get(key)
    if (known !== undefined) return known
    const node = found.get(key)?.node
    // Цикл у зв'язках — хибні дані сервера: обхід зупиняється, а не зависає.
    if (!node || seen.has(key)) return 0
    seen.add(key)
    let depth = 0
    for (const link of node.links ?? []) {
      const target = documentFlowKey(link.resource, link.id)
      if (link.resource === node.resource && found.has(target))
        depth = Math.max(depth, depthOf(target, seen) + 1)
    }
    depths.set(key, depth)
    return depth
  }
  for (const key of found.keys()) depthOf(key, new Set())
  return depths
}

/** Документи потоку від `start` в обидва боки, не більше `DOCUMENT_FLOW_LIMIT`. */
function collectDocumentFlow(
  sources: readonly DocumentFlowMockSource[],
  snapshots: ReadonlyMap<string, MockFlowSnapshot>,
  start: MockDocumentRef,
): { documents: DocumentFlowNode[]; truncated: boolean } {
  const incoming = incomingLinks([...snapshots.values()])
  const found = new Map<string, MockFlowEntry>()
  const skipped = new Set<string>()
  const queue: MockDocumentRef[] = [start]
  let truncated = false
  for (let ref = queue.shift(); ref; ref = queue.shift()) {
    const key = documentFlowKey(ref.resource, ref.id)
    const snapshot = snapshots.get(ref.resource)
    if (found.has(key) || skipped.has(key) || !snapshot) continue
    const entry = snapshot.lookup(ref.id)
    if (entry === "hidden") {
      skipped.add(key)
      continue
    }
    if (found.size === DOCUMENT_FLOW_LIMIT) {
      truncated = true
      break
    }
    const value = entry ?? {
      node: { resource: ref.resource, id: ref.id, access: "deleted" as const },
      next: [],
      date: undefined,
    }
    found.set(key, value)
    queue.push(
      ...(value.node.links ?? []),
      ...value.next,
      ...(incoming.get(key) ?? []),
    )
  }
  const order = new Map(
    sources.map((source, index) => [source.resource, index]),
  )
  const depths = depthsInType(found)
  const documents = [...found.entries()]
    .sort(
      ([aKey, a], [bKey, b]) =>
        (order.get(a.node.resource) ?? 0) - (order.get(b.node.resource) ?? 0) ||
        compareDates(a.date, b.date) ||
        (depths.get(aKey) ?? 0) - (depths.get(bKey) ?? 0),
    )
    .map(([, entry]) => entry.node)
  return { documents, truncated }
}

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
        const own = source.snapshot(viewer)
        const access = own.access(id)
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
        const snapshots = new Map(
          sources.map((other) => [
            other.resource,
            other === source ? own : other.snapshot(viewer),
          ]),
        )
        return json(
          collectDocumentFlow(sources, snapshots, {
            resource: source.resource,
            id,
          }),
        )
      },
    ),
  )
}
