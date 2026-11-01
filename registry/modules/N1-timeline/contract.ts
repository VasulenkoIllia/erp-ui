/**
 * Контракт модуля N1 «Стрічка запису» (SPEC §14, §17; ADR-0002, ADR-0037, ADR-0051, ADR-0052, ADR-0053,
 * ADR-0054).
 *
 * Адреси стрічки однієї картки вже є в кіті: `lib/timeline`, під `/api/v1`, для кожного ресурсу, що її має.
 * Модуль додає лише адресу верхнього рівня для людини, що ввійшла:
 *
 * - `GET /me/activities?dueFrom=&dueTo=&page=&perPage=` → `{ data, total }`: відкриті дії людини через
 *   усі записи, які вона бачить, найближчий термін першим. `dueFrom`, `dueTo` — календарні дати включно,
 *   який сьогодні день у людини, рахує клієнт. Рядок — дія з `lib/timeline` і `record: { resource, id,
 *   title? }`, де `title` — назва запису для людини. Запис, якого людина вже не бачить, у список не йде.
 * - Змінюють дію адреси її запису: `PATCH /<ресурс>/<id>/activities/<activityId>`.
 * - Дія змінилась чи закрилась — подія `<ресурс>.timeline`, та сама, що для картки (ADR-0053).
 */
export { TIMELINE, TIMELINE_RESOURCES } from "./resources"
export {
  timelineMyActivitySchema,
  type TimelineActivity,
  type TimelineActivityPatch,
  type TimelineApi,
  type TimelineDueRange,
  type TimelineEntry,
  type TimelineMyActivitiesPage,
  type TimelineMyActivity,
  type TimelineTarget,
} from "@/lib/timeline"
