/**
 * Права на рівні запису (ADR-0037): що з конкретним записом можна, вирішує сервер і каже позначкою в
 * самому записі. Кіт правил не обчислює — лише не пропонує дії, яку сервер однаково відхилить (403).
 *
 * Контракт: необов'язкове поле `deniedActions` у рядках списку (`GET /<ресурс>`), картці
 * (`GET /<ресурс>/:id`), відповідях `POST` і `PATCH` і в `current` конфлікту 409:
 *
 *   { "id": "seg-client", "name": "Клієнт", "deniedActions": { "update": "shared", "delete": "shared" } }
 *
 * - ключ — дія з прав (`update`, `delete`, `approve`…, ADR-0003), значення — код причини;
 * - обчислює сервер для того, хто питає, у компанії запиту; не зберігається, клієнт його не надсилає;
 * - немає поля чи дії в ньому — запис дії не забороняє, діють права ролі (бекенд без позначок
 *   працює як раніше);
 * - коди, які кіт пояснює своїм текстом, — `RECORD_DENIAL_REASONS`; інший код (правило проекту) —
 *   загальний текст.
 */

/** Позначка сервера на записі: дія → код причини. */
export type RecordDeniedActions = Readonly<Record<string, string>>

/** Коди причин зі своїм текстом кіта; інший код — «Цю дію з цим записом виконати не можна». */
export const RECORD_DENIAL_REASONS = {
  /** Спільний запис (без компанії): змінює лише адміністратор платформи (ADR-0036). */
  shared: "shared",
} as const

export type RecordDenialReason =
  (typeof RECORD_DENIAL_REASONS)[keyof typeof RECORD_DENIAL_REASONS]

/**
 * Код причини, з якої сервер забороняє дію `action` над записом, або `undefined` — запис не
 * забороняє. `action` — дія з прав (`update`), не ra-core (`edit`): її зводить `kitAction` з lib/auth.
 * Запис будь-якої форми: без поля чи з полем не того типу — заборони немає.
 */
export function recordDenial(
  record: unknown,
  action: string,
): string | undefined {
  if (typeof record !== "object" || record === null) return undefined
  const denied: unknown = (record as { deniedActions?: unknown }).deniedActions
  if (typeof denied !== "object" || denied === null) return undefined
  // Лише власні ключі: `constructor` з прототипу — не дія.
  if (!Object.hasOwn(denied, action)) return undefined
  const code: unknown = (denied as Record<string, unknown>)[action]
  return typeof code === "string" && code ? code : undefined
}

/** Чи пояснює кіт код причини своїм текстом. */
export function isKnownDenialReason(code: string): code is RecordDenialReason {
  return Object.values<string>(RECORD_DENIAL_REASONS).includes(code)
}
