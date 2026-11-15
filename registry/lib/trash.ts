/**
 * Кошик (PF16, ADR-0095): видалений запис якийсь час лежить на сервері, і його можна відновити. Кошик
 * один на застосунок, кожен список показує з нього записи свого ресурсу.
 *
 * Контракт (під `/api/v1`, компанія запиту — `X-Company-Id`):
 * - `GET /trash/settings` → `{ retentionDays, resources }`: скільки днів сервер тримає видалене й які
 *   ресурси він переносить у кошик. 404, 405, 501 — кошика немає: видалення назавжди, з підтвердженням,
 *   як без нього. Право — будь-який вхід.
 * - `DELETE /<ресурс>/:id` і масове видалення (`POST /<ресурс>/bulk/delete`) не змінюються: ресурс зі
 *   списку `resources` сервер переносить у кошик з тими самими правами й перевірками. Запис у кошику
 *   не видно ніде (список, пошук, `getMany`, `GET /:id` — 404); посилання на нього в інших записах
 *   лишаються. Після `purgeAt` сервер видаляє запис назавжди сам; кнопки «Видалити назавжди» немає.
 * - `GET /trash?resource=<ресурс>&page=&perPage=` → `{ data, total }`, новіші першими; `resource` може
 *   повторюватись. Запис кошика: `resource`, `id` запису, `deletedAt`, `purgeAt`, `deletedBy`
 *   (`{ id, name }`, `null` — сервер чи токен API) і `record` — рядок списку ресурсу, яким він був у мить
 *   видалення. Лише те, що людина могла б видалити: право `<ресурс>:delete`, з `:own` — свої записи
 *   (ADR-0039). Без права на ресурс — 403.
 * - `POST /trash/<ресурс>/<id>/restore` без тіла → 200 запис, як `GET /<ресурс>/:id`: той самий `id`,
 *   нова версія, без закріплення. Право — як для списку. 404 — запису в кошику вже немає (відновили, минув
 *   строк); 409 `restore_conflict` — поки запис лежав у кошику, його місце зайняв інший: унікальне поле
 *   має інший запис, зв'язок, який звільнило видалення, уже зайнято (з тієї самої пропозиції зробили нове
 *   замовлення). Зв'язки, які видалення звільнило, відновлення повертає.
 * - Журнал: `<ресурс>.deleted` і `<ресурс>.restored`; канал подій: `<ресурс>.deleted` і `<ресурс>.created`.
 */
import { z } from "zod"

import {
  isApiError,
  listResultSchema,
  recordBaseSchema,
  type ApiClient,
} from "@/registry/lib/api"

export const TRASH_PATH = "/trash"

/** Код 409 відновлення: місце запису зайняв інший (унікальне поле, зв'язок). */
export const RESTORE_CONFLICT = "restore_conflict"

/** Скільки чекати налаштувань: кнопка «Видалити» не стоїть без кінця, коли сервер мовчить. */
export const TRASH_SETTINGS_TIMEOUT_MS = 5_000

/** Скільки днів до `purgeAt` рядок кошика попереджає, що запис скоро зникне. */
export const TRASH_PURGE_SOON_DAYS = 3

export const trashSettingsSchema = z.object({
  retentionDays: z.number().int().positive(),
  resources: z.array(z.string()),
})
export type TrashSettings = z.infer<typeof trashSettingsSchema>

export const trashEntrySchema = z.object({
  resource: z.string(),
  id: z.string(),
  deletedAt: z.string(),
  purgeAt: z.string(),
  deletedBy: z.object({ id: z.string(), name: z.string() }).nullable(),
  /** Рядок списку ресурсу в мить видалення: модуль показує його своїм підписом. */
  record: z.record(z.string(), z.unknown()),
})
export type TrashEntry = z.infer<typeof trashEntrySchema>

const trashPageSchema = listResultSchema(trashEntrySchema)
export type TrashPage = z.infer<typeof trashPageSchema>

/** Відновлений запис: поля ресурсу перевіряє модуль, кошик — лише `id` і версію. */
const restoredSchema = recordBaseSchema.loose()
export type RestoredRecord = z.infer<typeof restoredSchema>

export const TRASH_QUERY_KEYS = {
  settings: ["erp-ui", "trash", "settings"],
  entries: ["erp-ui", "trash", "entries"],
} as const

const UNSUPPORTED_STATUSES: ReadonlySet<number> = new Set([404, 405, 501])

/** Бекенд не веде кошика: видалення назавжди. */
export const isTrashUnsupported = (error: unknown) =>
  isApiError(error) && UNSUPPORTED_STATUSES.has(error.status)

/** Чи переносить сервер записи ресурсу в кошик: `undefined`, поки налаштувань немає. */
export const keepsInTrash = (
  settings: TrashSettings | null | undefined,
  resource: string,
): boolean | undefined =>
  settings === undefined
    ? undefined
    : Boolean(settings?.resources.includes(resource))

/** Шлях запису в кошику: `/trash/<ресурс>/<id>`. */
export const trashRecordPath = (resource: string, id: string) =>
  `${TRASH_PATH}/${encodeURIComponent(resource)}/${encodeURIComponent(id)}`

/* -------------------------------- Клієнт API -------------------------------- */

export interface TrashApi {
  /** Налаштування кошика; `null` — бекенд кошика не веде (404, 405, 501). */
  getSettings: () => Promise<TrashSettings | null>
  /** Записи кошика ресурсу, новіші першими. */
  list: (resource: string, page: number, perPage: number) => Promise<TrashPage>
  /** Повернути запис із кошика. */
  restore: (resource: string, id: string) => Promise<RestoredRecord>
}

export function createTrashApi(client: ApiClient): TrashApi {
  return {
    getSettings: () =>
      client
        .get(`${TRASH_PATH}/settings`, {
          schema: trashSettingsSchema,
          timeoutMs: TRASH_SETTINGS_TIMEOUT_MS,
        })
        .catch((error: unknown) => {
          if (isTrashUnsupported(error)) return null
          throw error
        }),
    list: (resource, page, perPage) =>
      client.get(TRASH_PATH, {
        query: { resource, page: String(page), perPage: String(perPage) },
        schema: trashPageSchema,
      }),
    restore: (resource, id) =>
      client.post(`${trashRecordPath(resource, id)}/restore`, undefined, {
        schema: restoredSchema,
      }),
  }
}
