/**
 * Особисті налаштування списку (PF11; ADR-0024): поки що — скільки рядків на сторінці (`perPage` у
 * `mode: "pages"` шаблону List Report). Як вподобання (SPEC §6.2), на сервері: вибір переходить на
 * інший пристрій і переживає вихід.
 *
 * Контракт (під `/api/v1`, конвенції ADR-0002):
 * - `GET /me/list-settings/<ресурс>` → `{ perPage }`; нічого не збережено — `{ perPage: null }`;
 * - `PATCH /me/list-settings/<ресурс>` `{ perPage }` → збережені налаштування; змінює лише передані
 *   поля (нові поля потім не затруться старим клієнтом), без `version`: перемагає останнє
 *   збереження;
 * - налаштування бачить і змінює лише власник; компанія (`X-Company-Id`) на них не впливає;
 * - `perPage` — ціле від 1 до `MAX_PER_PAGE` (ADR-0002), інакше 422 `validation`.
 */
import { z } from "zod"

import { MAX_PER_PAGE } from "@/registry/lib/api"

/** Шлях API налаштувань списків: `/me/list-settings/<ресурс>`. */
export const LIST_SETTINGS_PATH = "me/list-settings"
/** Розміри сторінки на вибір за замовчуванням. */
export const LIST_PAGE_SIZES = [10, 20, 50, 100] as const
/** Скільки список чекає на налаштування, далі — типовий розмір (сценарій моків «повільно» — 3 с). */
export const LIST_SETTINGS_TIMEOUT_MS = 5_000

export const listSettingsSchema = z.object({
  perPage: z.number().int().min(1).max(MAX_PER_PAGE).nullable(),
})
export type ListSettings = z.infer<typeof listSettingsSchema>

/** Що зберегти: лише передані поля. */
export type ListSettingsPatch = Partial<ListSettings>

/** Шлях налаштувань списку ресурсу (ресурс може мати `/`: `me/views`). */
export const listSettingsPath = (resource: string) =>
  `/${LIST_SETTINGS_PATH}/${encodeURIComponent(resource)}`

/** Розміри на вибір разом із типовим розміром списку, за зростанням. */
export const withPageSize = (
  sizes: readonly number[],
  size: number,
): readonly number[] =>
  sizes.includes(size) ? sizes : [...sizes, size].sort((a, b) => a - b)

/**
 * Розмір сторінки списку: збережений, якщо він є серед запропонованих, інакше — типовий списку.
 * Інший клієнт міг зберегти розмір, якого тут немає у виборі: тоді список не показує «30 з 10, 20…».
 */
export function pickPerPage(
  saved: number | null | undefined,
  options: readonly number[],
  fallback: number,
): number {
  return saved !== null && saved !== undefined && options.includes(saved)
    ? saved
    : fallback
}
