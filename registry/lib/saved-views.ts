/**
 * Особисті збережені види списків (UI03, PF11; SPEC §17, ADR-0017).
 *
 * Контракт (під `/api/v1`, конвенції ADR-0002; у ra-core — ресурс `me/views`):
 * - `GET /me/views?resource=invoices` → `{ data, total }`, за назвою;
 * - `POST /me/views` `{ resource, name, params, isDefault }` → 201 і вид;
 * - `PATCH /me/views/:id` `{ name?, params?, isDefault?, version }` → вид; інша версія — 409
 *   (вид змінили в іншій вкладці);
 * - `DELETE /me/views/:id` → 204;
 * - `params` — стан списку рядком запиту без `view`, `page`, `perPage` (lib/list-state):
 *   `tab=overdue&client=A&sort=-date`;
 * - `isDefault: true` знімає позначку з інших видів того самого ресурсу;
 * - назва унікальна в межах ресурсу без урахування регістру: інакше 422 з
 *   `fieldErrors.name = "duplicate"`;
 * - види бачить і змінює лише власник; компанія (`X-Company-Id`) на них не впливає.
 */
import { z } from "zod"

import { recordBaseSchema } from "@/registry/lib/api"

/** Ресурс ra-core (і шлях API) особистих видів. */
export const SAVED_VIEWS_RESOURCE = "me/views"
export const SAVED_VIEW_NAME_MAX = 80
/** Скільки видів одного ресурсу просимо за раз (сервер може обмежити кількість). */
export const SAVED_VIEWS_PER_PAGE = 100
/** Код поля назви, коли вид із такою назвою вже є. */
export const DUPLICATE_VIEW_NAME = "duplicate"

export const savedViewSchema = recordBaseSchema.extend({
  /** Ресурс списку: `invoices`. */
  resource: z.string().min(1),
  name: z.string().trim().min(1).max(SAVED_VIEW_NAME_MAX),
  params: z.string().max(4000),
  isDefault: z.boolean(),
})
export type SavedView = z.infer<typeof savedViewSchema>

export type SavedViewInput = Pick<
  SavedView,
  "resource" | "name" | "params" | "isDefault"
>

/** Однакові назви без урахування регістру й пробілів по краях. */
export function sameViewName(a: string, b: string): boolean {
  return a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase()
}

/**
 * Список видів після збереження одного: вид замінено чи додано, а якщо він за замовчуванням —
 * позначку знято з інших видів того самого ресурсу (`touch` — що ще змінити в них, напр. версію).
 */
export function upsertView(
  views: readonly SavedView[],
  view: SavedView,
  touch: (changed: SavedView) => SavedView = (changed) => changed,
): SavedView[] {
  const next = views.map((other) => {
    if (other.id === view.id) return view
    if (view.isDefault && other.isDefault && other.resource === view.resource)
      return touch({ ...other, isDefault: false })
    return other
  })
  return next.some((other) => other.id === view.id) ? next : [...next, view]
}
