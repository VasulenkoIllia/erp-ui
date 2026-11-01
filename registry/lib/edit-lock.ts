/**
 * Блокування запису на час редагування: «Редагує [ім'я]» (SPEC §8.2, PF19, ADR-0051).
 *
 * Контракт (під `/api/v1`):
 * - `GET /<ресурс>/<id>/lock` → `{ holder, expiresAt }`: хто редагує; нікого — `holder: null`;
 * - `PUT /<ресурс>/<id>/lock` → те саме: взяти чи подовжити. Статус 200 і тоді, коли запис уже тримає інша
 *   людина: вона й буде в `holder`, тож обидва запити з двох вкладок дають однакову відповідь;
 * - `DELETE /<ресурс>/<id>/lock` → 204: відпустити своє; чуже блокування цей запит не знімає;
 * - подія `<ресурс>.locked` каналу реального часу, з `id` запису, коли `holder` змінився.
 *
 * Блокування тримається стільки, скільки дав сервер (`expiresAt`, не менше двох інтервалів
 * `EDIT_LOCK_REFRESH_MS`): закрита вкладка чи згасла батарея відпускають запис самі. Це домовленість між
 * людьми, а не захист даних: збереження береже версія запису (409, ADR-0002). Тому збій блокування не
 * заважає редагувати, а бекенд без цих адрес (404, 405, 501) просто працює без «Редагує …».
 * Подовження — фоновий запит (`X-Background-Request`): відкрита форма не продовжує сесію.
 */
import { z } from "zod"

import { isApiError } from "@/registry/lib/api"

export const EDIT_LOCK_PATH = "lock"
/** Запит блокування не тримає кнопку «Редагувати»: сервер мовчить — форма відкривається без нього. */
export const EDIT_LOCK_TIMEOUT_MS = 5_000
/** Подовження, поки людина редагує. */
export const EDIT_LOCK_REFRESH_MS = 60_000
/** Без дій стільки часу запис відпускається: людина пішла, форма лишилась відкритою (як у SAP Fiori). */
export const EDIT_LOCK_IDLE_MS = 30 * 60_000
/** Опитування, коли каналу реального часу немає. */
export const EDIT_LOCK_POLL_MS = 30_000

export const editLockHolderSchema = z.object({
  id: z.string(),
  name: z.string(),
})
export type EditLockHolder = z.infer<typeof editLockHolderSchema>

export const editLockSchema = z.object({
  holder: editLockHolderSchema.nullable(),
  expiresAt: z.string().nullable(),
})
export type EditLockState = z.infer<typeof editLockSchema>

export const EDIT_LOCK_QUERY_KEY = ["erp-ui", "edit-lock"] as const

const UNSUPPORTED_STATUSES = new Set([404, 405, 501])

/** Бекенд не веде блокувань; решта збоїв минає, і запит повториться. */
export const isEditLockUnsupported = (error: unknown) =>
  isApiError(error) && UNSUPPORTED_STATUSES.has(error.status)

/** Подія каналу про зміну блокування записів ресурсу. */
export const editLockEventType = (resource: string) => `${resource}.locked`
