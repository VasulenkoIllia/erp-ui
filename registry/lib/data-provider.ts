/**
 * dataProvider для ra-core під REST-конвенції erp-ui (ADR-0002).
 *
 * - Ресурс ra-core = сегмент шляху: "invoices" → `/api/v1/invoices`; інший шлях — `resourcePath`.
 * - getMany — `GET /<ресурс>?id=1&id=2`; getManyReference — фільтр `<target>=<id>`.
 * - update надсилає лише змінені поля + `version`: з `data` (версія, яку відкрила форма), інакше з
 *   `previousData`. Конфлікт → ApiError 409 із `current`; «зберегти мої зміни» — повтор із
 *   `version: current.version`.
 * - updateMany/deleteMany — запит на кожен запис.
 * - Масові дії з частковою невдачею — фоновою задачею сервера (lib/jobs, ADR-0018): `startBulk`
 *   → `POST /<ресурс>/bulk/<дія>`, `getJob` → `GET /jobs/:id` (фоновий запит, відповідь
 *   перевіряється схемою, чекає до `JOB_POLL_TIMEOUT_MS`), `retryJob` → `POST /jobs/:id/retry`. У компонентах —
 *   `useDataProvider<ErpDataProvider>()`.
 * - Імпорт з файла (lib/imports, ADR-0049): `checkImport` → `POST /<ресурс>/import/check`,
 *   `startImport` → `POST /<ресурс>/import`.
 * - Закріплення й налаштування списку (ADR-0024): `setPinned` → `PUT`/`DELETE /<ресурс>/:id/pin`
 *   (lib/pins), `getListSettings`/`saveListSettings` → `GET`/`PATCH /me/list-settings/<ресурс>`
 *   (lib/list-settings; читання чекає до `LIST_SETTINGS_TIMEOUT_MS`). Провайдер, написаний
 *   повністю сам, а не обгорткою над цим (ADR-0021), має додати ці три методи.
 * - Блокування на час редагування (lib/edit-lock, ADR-0051): `getEditLock` → `GET`, `takeEditLock` →
 *   `PUT`, `releaseEditLock` → `DELETE /<ресурс>/<id>/lock`; те саме про власний провайдер.
 */
import type { DataProvider, GetListParams, Identifier, RaRecord } from "ra-core"

import {
  toSearchParams,
  type ApiClient,
  type FilterValue,
  type SortField,
} from "@/registry/lib/api"
import {
  LIST_SETTINGS_TIMEOUT_MS,
  listSettingsPath,
  listSettingsSchema,
  type ListSettings,
  type ListSettingsPatch,
} from "@/registry/lib/list-settings"
import {
  JOB_POLL_TIMEOUT_MS,
  JOBS_PATH,
  jobSchema,
  jobStartedSchema,
  type BulkSelection,
  type Job,
  type JobStarted,
} from "@/registry/lib/jobs"
import {
  IMPORT_REQUEST_TIMEOUT_MS,
  importCheckSchema,
  type ImportCheck,
  type ImportRequest,
} from "@/registry/lib/imports"
import { PIN_PATH } from "@/registry/lib/pins"
import {
  EDIT_LOCK_PATH,
  EDIT_LOCK_TIMEOUT_MS,
  editLockSchema,
  type EditLockState,
} from "@/registry/lib/edit-lock"

/** Методи масових дій поверх dataProvider ra-core (lib/jobs). */
export interface BulkDataProvider {
  startBulk: (
    resource: string,
    action: string,
    selection: BulkSelection,
  ) => Promise<JobStarted>
  getJob: (id: string, options?: { signal?: AbortSignal }) => Promise<Job>
  retryJob: (id: string) => Promise<JobStarted>
}
/** Закріплення записів і особисті налаштування списку (lib/pins, lib/list-settings; ADR-0024). */
export interface ListDataProvider {
  /** Закріпити запис угорі списку цього користувача чи відкріпити. */
  setPinned: (
    resource: string,
    id: Identifier,
    pinned: boolean,
  ) => Promise<void>
  getListSettings: (
    resource: string,
    options?: { signal?: AbortSignal },
  ) => Promise<ListSettings>
  saveListSettings: (
    resource: string,
    settings: ListSettingsPatch,
  ) => Promise<ListSettings>
}
/** Імпорт з файла (lib/imports, ADR-0049). */
export interface ImportDataProvider {
  /** Перевірка без запису: що станеться з кожним рядком. */
  checkImport: (
    resource: string,
    request: ImportRequest,
  ) => Promise<ImportCheck>
  /** Застосувати: фонова задача, той самий `requestId` — та сама задача. */
  startImport: (resource: string, request: ImportRequest) => Promise<JobStarted>
}
/** Хто редагує запис (lib/edit-lock, ADR-0051). */
export interface EditLockDataProvider {
  getEditLock: (
    resource: string,
    id: string,
    options?: { signal?: AbortSignal },
  ) => Promise<EditLockState>
  /** Взяти чи подовжити; у відповіді — той, хто тримає: я або інша людина, яка встигла раніше. */
  takeEditLock: (resource: string, id: string) => Promise<EditLockState>
  releaseEditLock: (resource: string, id: string) => Promise<void>
}

export type ErpDataProvider = DataProvider &
  BulkDataProvider &
  ListDataProvider &
  ImportDataProvider &
  EditLockDataProvider

export interface DataProviderOptions {
  /** Ресурс ra-core → шлях API без префікса. */
  resourcePath?: (resource: string) => string
}

interface ListResponse {
  data: RaRecord[]
  total: number
}

function sortOf(params: GetListParams): SortField[] {
  const { field, order } = params.sort ?? { field: "", order: "ASC" }
  return field ? [{ field, order: order === "DESC" ? "desc" : "asc" }] : []
}

/** Лише змінені поля: менше конфліктів і менший запит. */
export function changedFields(
  data: Record<string, unknown>,
  previous: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!previous) return data
  return Object.fromEntries(
    Object.entries(data).filter(
      ([key, value]) =>
        key !== "id" &&
        key !== "version" &&
        JSON.stringify(value) !== JSON.stringify(previous[key]),
    ),
  )
}

export function createDataProvider(
  client: ApiClient,
  { resourcePath = (resource) => resource }: DataProviderOptions = {},
): ErpDataProvider {
  const path = (resource: string, id?: Identifier) =>
    `/${resourcePath(resource)}${id === undefined ? "" : `/${encodeURIComponent(String(id))}`}`
  const jobPath = (id: string) => `/${JOBS_PATH}/${encodeURIComponent(id)}`

  const list = async (
    resource: string,
    params: GetListParams,
    extraFilter: Record<string, FilterValue> = {},
  ) => {
    const query = toSearchParams({
      page: params.pagination?.page,
      perPage: params.pagination?.perPage,
      sort: sortOf(params),
      filter: {
        ...(params.filter as Record<string, FilterValue>),
        ...extraFilter,
      },
    })
    return client.get<ListResponse>(path(resource), {
      query,
      signal: params.signal,
    })
  }

  const provider: ErpDataProvider = {
    supportAbortSignal: true,

    getList: async (resource, params) => {
      const { data, total } = await list(resource, params)
      return { data, total } as never
    },

    getOne: async (resource, { id, signal }) => {
      const data = await client.get<RaRecord>(path(resource, id), { signal })
      return { data } as never
    },

    getMany: async (resource, { ids, signal }) => {
      const { data } = await list(
        resource,
        { pagination: { page: 1, perPage: ids.length }, signal },
        { id: ids.map(String) },
      )
      return { data } as never
    },

    getManyReference: async (resource, params) => {
      const { data, total } = await list(resource, params, {
        [params.target]: String(params.id),
      })
      return { data, total } as never
    },

    create: async (resource, { data }) => {
      const created = await client.post<RaRecord>(path(resource), data)
      return { data: created } as never
    },

    update: async (resource, { id, data, previousData }) => {
      const previous = previousData as Record<string, unknown> | undefined
      const updated = await client.patch<RaRecord>(
        path(resource, id as Identifier),
        {
          ...changedFields(data as Record<string, unknown>, previous),
          version: (data as { version?: number }).version ?? previous?.version,
        },
      )
      return { data: updated } as never
    },

    updateMany: async (resource, { ids, data }) => {
      const updated = await Promise.all(
        ids.map((id) =>
          client.patch<RaRecord>(
            path(resource, id),
            data as Record<string, unknown>,
          ),
        ),
      )
      return { data: updated.map((record) => record.id) }
    },

    delete: async (resource, { id, previousData }) => {
      await client.delete(path(resource, id))
      return { data: previousData ?? { id } } as never
    },

    deleteMany: async (resource, { ids }) => {
      await Promise.all(ids.map((id) => client.delete(path(resource, id))))
      return { data: ids }
    },

    startBulk: (resource, action, selection) =>
      client.post(
        `${path(resource)}/bulk/${encodeURIComponent(action)}`,
        selection,
        { schema: jobStartedSchema },
      ),

    getJob: (id, { signal } = {}) =>
      client.get(jobPath(id), {
        schema: jobSchema,
        signal,
        background: true,
        timeoutMs: JOB_POLL_TIMEOUT_MS,
      }),

    retryJob: (id) =>
      client.post(`${jobPath(id)}/retry`, undefined, {
        schema: jobStartedSchema,
      }),

    checkImport: (resource, request) =>
      client.post(`${path(resource)}/import/check`, request, {
        schema: importCheckSchema,
        timeoutMs: IMPORT_REQUEST_TIMEOUT_MS,
      }),

    startImport: (resource, request) =>
      client.post(`${path(resource)}/import`, request, {
        schema: jobStartedSchema,
        timeoutMs: IMPORT_REQUEST_TIMEOUT_MS,
      }),

    setPinned: async (resource, id, pinned) => {
      const pin = `${path(resource, id)}/${PIN_PATH}`
      await (pinned ? client.put(pin) : client.delete(pin))
    },

    getListSettings: (resource, { signal } = {}) =>
      client.get(listSettingsPath(resource), {
        schema: listSettingsSchema,
        signal,
        // Список чекає на налаштування: сервер, що мовчить, не тримає його в скелетоні.
        timeoutMs: LIST_SETTINGS_TIMEOUT_MS,
      }),

    saveListSettings: (resource, settings) =>
      client.patch(listSettingsPath(resource), settings, {
        schema: listSettingsSchema,
      }),

    getEditLock: (resource, id, { signal } = {}) =>
      client.get(`${path(resource, id)}/${EDIT_LOCK_PATH}`, {
        schema: editLockSchema,
        signal,
        background: true,
        timeoutMs: EDIT_LOCK_TIMEOUT_MS,
      }),

    takeEditLock: (resource, id) =>
      client.put(`${path(resource, id)}/${EDIT_LOCK_PATH}`, undefined, {
        schema: editLockSchema,
        timeoutMs: EDIT_LOCK_TIMEOUT_MS,
      }),

    releaseEditLock: async (resource, id) => {
      await client.delete(`${path(resource, id)}/${EDIT_LOCK_PATH}`, {
        timeoutMs: EDIT_LOCK_TIMEOUT_MS,
      })
    },
  }
  return provider
}
