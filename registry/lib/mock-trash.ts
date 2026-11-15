/**
 * Мок кошика (lib/trash, PF16, ADR-0095): видалені записи ресурсів у пам'яті моку, окремо для кожної
 * компанії запиту.
 *
 *   const trash = createTrashMocks({ retentionDays: 30 })
 *   createResourceHandlers({ ..., trash: { bin: trash.bin } })   // DELETE переносить запис сюди
 *   [...trash.handlers, ...]
 *
 * - `GET /trash/settings` — строк і ресурси, які зареєстрували обробники (`bin.register`).
 * - `GET /trash?resource=…` — записи, які людина могла б видалити (`<ресурс>:delete`, з `:own` — свої),
 *   новіші першими; без права на ресурс — 403. Запис, строк якого минув, мок прибирає під час читання,
 *   як сервер прибрав би його за розкладом.
 * - `POST /trash/<ресурс>/<id>/restore` — повертає запис у ресурс (нова версія, журнал, подія); місце
 *   зайняв інший (унікальне поле, зайнятий зв'язок) — 409 `restore_conflict`.
 * - Сценарії — ресурс `trash` (панель розробника): `error`, `offline`, `slow`, `forbidden` — на всіх адресах,
 *   `empty` — порожній кошик, `conflict` — відновлення відповідає 409.
 */
import { http, type HttpHandler } from "msw/http"

import { API_PREFIX, fromSearchParams } from "@/registry/lib/api"
import { mockRequestPermissions } from "@/registry/lib/mock-company-roles"
import type { MockRecord } from "@/registry/lib/mock-records"
import { scenarioFor } from "@/registry/lib/mock-scenarios"
import {
  applyScenario,
  currentMockUser,
  errorResponse,
  json,
  unauthenticated,
  type MockUser,
} from "@/registry/lib/mock-server"
import { inMockCompany } from "@/registry/lib/mock-scope"
import {
  RESTORE_CONFLICT,
  TRASH_PATH,
  type TrashEntry,
} from "@/registry/lib/trash"

/** Ресурс сценаріїв кошика в панелі розробника. */
export const TRASH_SCENARIO_RESOURCE = "trash"

const DAY_MS = 86_400_000
const DEFAULT_RETENTION_DAYS = 30
const DEFAULT_PER_PAGE = 20

/** Запис засіву, який лежить у кошику з першого запиту (демо): видалений `daysAgo` днів тому, без автора. */
export interface MockTrashSeed {
  readonly id: string
  readonly daysAgo: number
}

/** Що кошик знає про ресурс: його дає `createResourceHandlers` з опцією `trash`. */
export interface MockTrashSource {
  /** Чи може людина видаляти записи ресурсу (`<ресурс>:delete` чи `:own`). */
  readonly grants: (user: MockUser, permissions: readonly string[]) => boolean
  /** Чи може людина видалити саме цей запис (з `:own` — лише свій). */
  readonly sees: (
    user: MockUser,
    permissions: readonly string[],
    record: MockRecord,
  ) => boolean
  /** Рядок списку ресурсу: без вкладених колекцій (ADR-0019). */
  readonly listRow: (record: MockRecord) => Record<string, unknown>
  /** Повернути запис у ресурс з новою версією; `null` — місце зайняв інший, нічого не змінено. */
  readonly restore: (record: MockRecord) => MockRecord | null
  /** Засіяти дані ресурсу: записи засіву, видалені до першого запиту, переходять у кошик. */
  readonly ensureSeeded: () => void
}

/** Опція `trash` у `createResourceHandlers`: кошик і що сервер робить зі зв'язками запису. */
export interface MockResourceTrash<T extends MockRecord> {
  readonly bin: MockTrashBin
  /** Записи засіву, що лежать у кошику з першого запиту (демо). */
  readonly deleted?: readonly MockTrashSeed[]
  /** Перед відновленням: чи вільні зв'язки, які звільнило видалення (`afterDelete`); `false` — 409. */
  readonly canRestore?: (record: T) => boolean
  /** Після відновлення: зайняти звільнені зв'язки знову. */
  readonly afterRestore?: (record: T) => void
}

interface StoredEntry {
  readonly resource: string
  readonly record: MockRecord
  readonly deletedAt: number
  readonly deletedBy: TrashEntry["deletedBy"]
}

export interface MockTrashBin {
  readonly register: (resource: string, source: MockTrashSource) => void
  /**
   * Видалений запис — у кошик: `deletedBy` — людина сесії моку; із `daysAgo` — запис засіву, видалений
   * стільки днів тому без автора.
   */
  readonly keep: (
    resource: string,
    record: MockRecord,
    daysAgo?: number,
  ) => void
}

const keyOf = (resource: string, id: string) => `${resource}:${id}`

export function createTrashMocks({
  retentionDays = DEFAULT_RETENTION_DAYS,
  baseUrl = API_PREFIX,
}: {
  retentionDays?: number
  baseUrl?: string
} = {}) {
  const sources = new Map<string, MockTrashSource>()
  const entries = new Map<string, StoredEntry>()
  const retentionMs = retentionDays * DAY_MS

  /** Строк минув — сервер видалив би запис назавжди. */
  const purgeExpired = () => {
    const now = Date.now()
    for (const [key, entry] of entries)
      if (entry.deletedAt + retentionMs <= now) entries.delete(key)
  }

  const bin: MockTrashBin = {
    register: (resource, source) => {
      sources.set(resource, source)
    },
    keep: (resource, record, daysAgo) => {
      const user = daysAgo === undefined ? currentMockUser() : null
      entries.set(keyOf(resource, record.id), {
        resource,
        record,
        deletedAt: Date.now() - (daysAgo ?? 0) * DAY_MS,
        deletedBy: user ? { id: user.id, name: user.name } : null,
      })
    },
  }

  const toEntry = (
    entry: StoredEntry,
    source: MockTrashSource,
  ): TrashEntry => ({
    resource: entry.resource,
    id: entry.record.id,
    deletedAt: new Date(entry.deletedAt).toISOString(),
    purgeAt: new Date(entry.deletedAt + retentionMs).toISOString(),
    deletedBy: entry.deletedBy,
    record: source.listRow(entry.record),
  })

  /** Сценарій, сесія, компанія запиту: людина з правами в ній або відповідь-відмова. */
  async function guard(request: Request) {
    const early = await applyScenario(scenarioFor(TRASH_SCENARIO_RESOURCE))
    if (early) return early
    const user = currentMockUser()
    if (!user) return unauthenticated()
    const scoped = mockRequestPermissions(request, user)
    if (scoped instanceof Response) return scoped
    return { user, ...scoped }
  }

  const forbidden = (resource: string) =>
    errorResponse(403, {
      code: "forbidden",
      message: `Missing permission ${resource}:delete`,
    })

  const handlers: HttpHandler[] = [
    http.get(`${baseUrl}${TRASH_PATH}/settings`, async ({ request }) => {
      const access = await guard(request)
      if (access instanceof Response) return access
      return json({ retentionDays, resources: [...sources.keys()] })
    }),

    http.get(`${baseUrl}${TRASH_PATH}`, async ({ request }) => {
      const access = await guard(request)
      if (access instanceof Response) return access
      const { user, companyId, permissions } = access
      const params = new URL(request.url).searchParams
      const { page, perPage } = fromSearchParams(params)
      const resources = params.getAll("resource")
      for (const resource of resources) {
        const source = sources.get(resource)
        if (source && !source.grants(user, permissions))
          return forbidden(resource)
      }
      if (scenarioFor(TRASH_SCENARIO_RESOURCE) === "empty")
        return json({ data: [], total: 0 })
      purgeExpired()
      const found: TrashEntry[] = []
      for (const resource of resources) {
        const source = sources.get(resource)
        if (!source) continue
        source.ensureSeeded()
        for (const entry of entries.values())
          if (
            entry.resource === resource &&
            inMockCompany(entry.record.companyId, companyId) &&
            source.sees(user, permissions, entry.record)
          )
            found.push(toEntry(entry, source))
      }
      found.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt))
      const size = perPage ?? DEFAULT_PER_PAGE
      const start = ((page ?? 1) - 1) * size
      return json({
        data: found.slice(start, start + size),
        total: found.length,
      })
    }),

    http.post(
      `${baseUrl}${TRASH_PATH}/:resource/:id/restore`,
      async ({ request, params }) => {
        const access = await guard(request)
        if (access instanceof Response) return access
        const { user, companyId, permissions } = access
        const resource = String(params.resource)
        const source = sources.get(resource)
        if (source && !source.grants(user, permissions))
          return forbidden(resource)
        source?.ensureSeeded()
        purgeExpired()
        const key = keyOf(resource, String(params.id))
        const entry = entries.get(key)
        if (
          !source ||
          !entry ||
          !inMockCompany(entry.record.companyId, companyId) ||
          !source.sees(user, permissions, entry.record)
        )
          return errorResponse(404, {
            code: "not_found",
            message: "Not in the trash",
          })
        const restored =
          scenarioFor(TRASH_SCENARIO_RESOURCE) === "conflict"
            ? null
            : source.restore(entry.record)
        if (!restored)
          return errorResponse(409, {
            code: RESTORE_CONFLICT,
            message: "Another record took its place",
          })
        entries.delete(key)
        return json(source.listRow(restored))
      },
    ),
  ]

  return {
    handlers,
    bin,
    /** Записи кошика ресурсу без перевірок: для тестів. */
    entries: (resource: string) => {
      sources.get(resource)?.ensureSeeded()
      return [...entries.values()].filter(
        (entry) => entry.resource === resource,
      )
    },
    reset: () => {
      entries.clear()
    },
  }
}

export type MockTrash = ReturnType<typeof createTrashMocks>

/** Записи засіву з `trash.deleted` — одразу в кошику, а не в даних ресурсу (`createResourceHandlers`). */
export function withoutTrashSeeds<T extends MockRecord>(
  resource: string,
  records: T[],
  trash: MockResourceTrash<T> | undefined,
): T[] {
  const deleted = new Map(
    (trash?.deleted ?? []).map(({ id, daysAgo }) => [id, daysAgo]),
  )
  if (!trash || !deleted.size) return records
  return records.filter((record) => {
    const daysAgo = deleted.get(record.id)
    if (daysAgo !== undefined) trash.bin.keep(resource, record, daysAgo)
    return daysAgo === undefined
  })
}

/** Що дає ресурс `createResourceHandlers` кошику: права, рядок списку, вставка відновленого. */
export interface MockTrashResourceDb<T extends MockRecord> {
  readonly grants: MockTrashSource["grants"]
  readonly sees: (
    user: MockUser,
    permissions: readonly string[],
    record: T,
  ) => boolean
  readonly listRow: (record: T) => Record<string, unknown>
  /** Вставити відновлений запис із журналом і подією; `false` — повтор унікального поля. */
  readonly insert: (record: T) => boolean
  readonly ensureSeeded: () => void
}

/**
 * Ресурс у кошику: відновлення — нова версія, перевірка зв'язків (`canRestore`), вставка, зв'язки знову
 * зайняті (`afterRestore`). Записи кошика ресурсу — його ж записи, тож тип `T` відновлюється з `MockRecord`.
 */
export function connectTrash<T extends MockRecord>(
  resource: string,
  { bin, canRestore, afterRestore }: MockResourceTrash<T>,
  db: MockTrashResourceDb<T>,
): void {
  bin.register(resource, {
    grants: db.grants,
    sees: (user, permissions, record) =>
      db.sees(user, permissions, record as T),
    listRow: (record) => db.listRow(record as T),
    restore: (record) => {
      const restored = { ...(record as T), version: record.version + 1 }
      if (canRestore?.(restored) === false || !db.insert(restored)) return null
      afterRestore?.(restored)
      return restored
    },
    ensureSeeded: db.ensureSeeded,
  })
}

/**
 * Зв'язок, який видалення звільнило, а відновлення займає знову: поле `slot` запису, на який указує
 * `from` відновленого (`amendedFrom` → `amendedBy` першого документа, `quoteId` → `orderId` пропозиції).
 */
export interface MockLinkSlot<S> {
  /** Слот порожній чи вже цього запису: відновлювати можна. */
  readonly isFree: (record: S) => boolean
  /** Зайняти слот відновленим записом. */
  readonly claim: (record: S) => void
}

/** Записи ресурсу, на який указує зв'язок: `db` з `createResourceHandlers`. */
interface MockLinkDb<T extends MockRecord> {
  readonly all: () => T[]
  readonly patch: (
    id: string,
    changes: Record<string, unknown>,
  ) => { record: T } | { fieldErrors: Record<string, string> } | null
}

export function mockLinkSlot<S extends MockRecord, T extends MockRecord>(
  db: MockLinkDb<T>,
  from: keyof S & string,
  slot: keyof T & string,
): MockLinkSlot<S> {
  const targetOf = (record: S) => {
    const id = record[from]
    return typeof id === "string"
      ? db.all().find((candidate) => candidate.id === id)
      : undefined
  }
  return {
    isFree: (record) => {
      const held = targetOf(record)?.[slot]
      return held === null || held === undefined || held === record.id
    },
    claim: (record) => {
      const target = targetOf(record)
      if (!target || target[slot] === record.id) return
      const result = db.patch(target.id, { [slot]: record.id })
      // Схема запису не бере зв'язок — помилка налаштування моку, а не відповідь сервера.
      if (result && "fieldErrors" in result)
        throw new Error(
          `Mock: cannot link ${target.id}: ${JSON.stringify(result.fieldErrors)}`,
        )
    },
  }
}

/** Опції кошика для зв'язків запису: відновлення можливе, коли вільні всі; після — займає всі. */
export function trashLinks<T extends MockRecord>(
  links: () => readonly MockLinkSlot<T>[],
): Pick<MockResourceTrash<T>, "canRestore" | "afterRestore"> {
  return {
    canRestore: (record) => links().every((link) => link.isFree(record)),
    afterRestore: (record) => {
      for (const link of links()) link.claim(record)
    },
  }
}
