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

/** Дії ra-core (`useCanAccess`, вбудовані контролери) → дії прав erp-ui; `Map` — без ключів прототипу. */
const RA_ACTIONS = new Map([
  ["list", "read"],
  ["show", "read"],
  ["export", "read"],
  ["edit", "update"],
])

/** Дія прав erp-ui для дії ra-core (`edit` → `update`), своя — як є. */
export const kitAction = (action: string): string =>
  RA_ACTIONS.get(action) ?? action

/** Позначка сервера на записі: дія → код причини. */
export type RecordDeniedActions = Readonly<Record<string, string>>

/** Коди причин зі своїм текстом кіта; інший код — «Цю дію з цим записом виконати не можна». */
export const RECORD_DENIAL_REASONS = {
  /** Спільний запис (без компанії): змінює лише адміністратор платформи (ADR-0036). */
  shared: "shared",
  /** Чужий запис для дії лише над своїми (`<ресурс>:<дія>:own`, ADR-0038). */
  own: "own",
} as const

export type RecordDenialReason =
  (typeof RECORD_DENIAL_REASONS)[keyof typeof RECORD_DENIAL_REASONS]

/**
 * Код причини, з якої сервер забороняє дію `action` над записом, або `undefined` — запис не
 * забороняє. `action` — дія з прав (`update`) чи ra-core (`edit`): її зводить `kitAction`.
 * Запис будь-якої форми: без поля чи з полем не того типу — заборони немає.
 */
export function recordDenial(
  record: unknown,
  action: string,
): string | undefined {
  if (typeof record !== "object" || record === null) return undefined
  const denied: unknown = (record as { deniedActions?: unknown }).deniedActions
  if (typeof denied !== "object" || denied === null) return undefined
  const key = kitAction(action)
  // Лише власні ключі: `constructor` з прототипу — не дія.
  if (!Object.hasOwn(denied, key)) return undefined
  const code: unknown = (denied as Record<string, unknown>)[key]
  return typeof code === "string" && code ? code : undefined
}

/** Чи пояснює кіт код причини своїм текстом. */
export function isKnownDenialReason(code: string): code is RecordDenialReason {
  return Object.values<string>(RECORD_DENIAL_REASONS).includes(code)
}
