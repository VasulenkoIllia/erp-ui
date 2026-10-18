/**
 * Точки розширення модуля (ADR-0020): зміни під клієнта лежать у файлі розширення проекту, а модуль
 * зливає їх зі своїми елементами за ключем, не даючи розширенню свого внутрішнього стану.
 *
 * - Елемент — колонка, фільтр, вкладка, дія, поле чи секція — має ключ `id`. Розширення додає
 *   елемент (`add`, місце — `place`), ховає (`hide`) чи переставляє (`move`) елемент модуля за
 *   ключем; порядок на екрані — порядок у злитому списку.
 * - Розширення — дані без функцій, крім компонентів у слотах (секції, дії): так ті самі зміни зможе
 *   прислати сервер (PF09, хвиля 2). Модуль перетворює дані на елементи шаблону (`mapKeyedChanges`)
 *   і зливає їх зі своїми (`applyKeyedChanges`) до того, як список потрапить у шаблон. Поле
 *   розширення в записі модуля — `extensionValue(record, id)`.
 * - Ключі модуля `K` — у `hide`, `move`, `change` і в орієнтирах `place`: модуль перейменував ключ —
 *   TypeScript показує місце у файлі розширення, а `applyKeyedChanges` звіряє `K` з ключами списку
 *   модуля. Під час роботи невідомий ключ пропускається (дані від сервера).
 * - `change` міняє властивості елемента модуля без заміни (назва й пріоритет колонки, підпис і
 *   підказка поля форми): які саме — задає модуль типом `C` у `KeyedChanges<T, K, C>`. Без `C` змін
 *   властивостей у списку немає.
 */

/** Елемент списку з ключем. */
export interface Keyed {
  readonly id: string
}

/**
 * Місце елемента: на початку, в кінці, перед чи після елемента модуля з ключем `K`. Кілька нових
 * елементів на одному місці стають у порядку `add`. Орієнтира немає (сховано, ключ невідомий) —
 * новий елемент стає в кінець, переставлений лишається, де був.
 */
export type Placement<K extends string = string> =
  | "start"
  | "end"
  | { readonly before: K; readonly after?: never }
  | { readonly after: K; readonly before?: never }

/** Новий елемент і його місце; без `place` — у кінці. */
export type Placed<T, K extends string = string> = T & {
  readonly place?: Placement<K>
}

export interface KeyedMove<K extends string = string> {
  readonly id: K
  readonly place: Placement<K>
}

/**
 * Нові значення властивостей елемента за ключем: `{ id: "phone", priority: 9 }`. `C` — що модуль
 * дозволяє змінити; без `C` (`never`) змін властивостей немає.
 */
export type KeyedChange<C extends object, K extends string = string> = [
  C,
] extends [never]
  ? never
  : { readonly id: K } & { readonly [P in keyof C]?: C[P] }

/** Зміни списку елементів модуля; застосовуються в порядку `hide` → `add` → `change` → `move`. */
export interface KeyedChanges<
  T extends Keyed,
  K extends string = string,
  C extends object = never,
> {
  /**
   * Нові елементи. Ключ, що вже є в модулі, — заміна: елемент розширення стає замість елемента
   * модуля (на його місці, якщо `place` не задано чи орієнтира немає), тож ключі в списку не
   * повторюються. Закріплений елемент (`locked`) не замінюється.
   */
  readonly add?: readonly Placed<T, K>[]
  /** Ключі елементів модуля, яких не показувати. */
  readonly hide?: readonly K[]
  /** Переставити елементи модуля (нові ставить на місце `place`). */
  readonly move?: readonly KeyedMove<K>[]
  /**
   * Змінити властивості елемента модуля без заміни: решта властивостей і поведінка лишаються від
   * модуля, тож оновлення модуля їх приносить. Закріплений (`locked`) елемент теж змінюється.
   */
  readonly change?: readonly KeyedChange<C, K>[]
}

export interface ApplyKeyedOptions {
  /**
   * Ключі, які розширення не ховає й не замінює (переставити можна): обов'язкові поля контракту,
   * номер-посилання на картку.
   */
  readonly locked?: readonly string[]
}

/**
 * Злити список модуля зі змінами розширення; без змін — той самий список. Ключі змін — ключі
 * елементів модуля (`T["id"]`), а додані елементи — свого типу `A` (дані розширення, вже
 * перетворені модулем). Зміни властивостей `C` — лише властивості елемента модуля з тими самими
 * типами.
 */
export function applyKeyedChanges<
  T extends Keyed,
  A extends Keyed = T,
  C extends Partial<Omit<T, "id">> = never,
>(
  items: readonly T[],
  changes?: KeyedChanges<A, T["id"], C>,
  { locked = [] }: ApplyKeyedOptions = {},
): readonly (T | A)[] {
  if (!changes) return items
  const hidden = new Set<string>(
    changes.hide?.filter((id) => !locked.includes(id)),
  )
  const result: (T | A)[] = items.filter((item) => !hidden.has(item.id))
  // Скільки нових уже стало на кожне місце: наступний — після них, у порядку `add`.
  const placedAt = new Map<string, number>()
  for (const { place, ...rest } of changes.add ?? []) {
    const item = rest as A
    const index = result.findIndex((existing) => existing.id === item.id)
    if (index >= 0 && locked.includes(item.id)) continue
    // Заміна без місця чи з орієнтиром, якого вже немає, — на місці елемента модуля.
    if (
      index >= 0 &&
      (place === undefined || !hasAnchor(result, place, item.id))
    ) {
      result[index] = item
      continue
    }
    if (index >= 0) result.splice(index, 1)
    const at = placeOf(place)
    const before = placedAt.get(at) ?? 0
    placedAt.set(at, before + 1)
    insert(result, item, place, before)
  }
  for (const change of changes.change ?? []) changeProps(result, change)
  for (const { id, place } of changes.move ?? []) {
    const index = result.findIndex((item) => item.id === id)
    const item = result[index]
    if (!item || !hasAnchor(result, place, id)) continue
    result.splice(index, 1)
    insert(result, item, place, 0)
  }
  return result
}

/**
 * Нові значення властивостей елемента з ключем; `undefined` не стирає значення модуля, а ключ і
 * місце не змінюються. Елемента немає (сховано, ключ невідомий) — пропуск.
 */
function changeProps<T extends Keyed>(items: T[], change: Keyed) {
  const index = items.findIndex((item) => item.id === change.id)
  const item = items[index]
  if (!item) return
  const props = Object.entries(change).filter(
    ([key, value]) => key !== "id" && key !== "place" && value !== undefined,
  )
  if (props.length) items[index] = { ...item, ...Object.fromEntries(props) }
}

/** Ключ місця для порядку кількох нових: "start", "end", "before:a", "after:a". */
function placeOf(place: Placement | undefined): string {
  if (place === undefined || typeof place === "string") return place ?? "end"
  return "before" in place && place.before !== undefined
    ? `before:${place.before}`
    : `after:${String(place.after)}`
}

/** Орієнтир місця; рядок, що не є місцем (дані від сервера), — як «у кінці». */
function anchorOf(place: Placement): { before: boolean; id: string } | null {
  if (typeof place !== "object") return null
  if (place.before !== undefined) return { before: true, id: place.before }
  if (place.after !== undefined) return { before: false, id: place.after }
  return null
}

function hasAnchor(items: readonly Keyed[], place: Placement, self: string) {
  const anchor = anchorOf(place)
  if (!anchor) return true
  return anchor.id !== self && items.some((item) => item.id === anchor.id)
}

/**
 * Вставити за місцем; `offset` — скільки нових уже стоїть на цьому місці (вони лишаються перед).
 * Ключа-орієнтира немає — у кінець.
 */
function insert<T extends Keyed>(
  items: T[],
  item: T,
  place: Placement | undefined,
  offset: number,
) {
  if (place === "start") {
    items.splice(offset, 0, item)
    return
  }
  const anchor = place === undefined ? null : anchorOf(place)
  const index = anchor
    ? items.findIndex((existing) => existing.id === anchor.id)
    : -1
  if (!anchor || index < 0) {
    items.push(item)
    return
  }
  items.splice(anchor.before ? index : index + 1 + offset, 0, item)
}

/**
 * Значення поля розширення з запису модуля (тип запису його не знає); немає — `undefined`. Тут, а не
 * в `lib/extension-fields`, щоб компонент слота не тягнув zod у свій чанк.
 */
export function extensionValue(record: unknown, id: string): unknown {
  return typeof record === "object" &&
    record !== null &&
    Object.hasOwn(record, id)
    ? (record as Record<string, unknown>)[id]
    : undefined
}

/**
 * Перетворити додані елементи (дані розширення → елементи шаблону); `hide`, `move` і місця — ті самі.
 * Зміни властивостей (`change`) — другою функцією: напр., підпис `{ uk, en }` → рядок мовою
 * інтерфейсу.
 */
export function mapKeyedChanges<
  A extends Keyed,
  B extends Keyed,
  K extends string,
>(
  changes: KeyedChanges<A, K> | undefined,
  map: (item: A) => B,
): KeyedChanges<B, K> | undefined
export function mapKeyedChanges<
  A extends Keyed,
  B extends Keyed,
  K extends string,
  C extends object,
  D extends object,
>(
  changes: KeyedChanges<A, K, C> | undefined,
  map: (item: A) => B,
  mapChange: (change: KeyedChange<C, K>) => KeyedChange<D, K>,
): KeyedChanges<B, K, D> | undefined
export function mapKeyedChanges(
  changes: KeyedChanges<Keyed, string, object> | undefined,
  map: (item: Keyed) => Keyed,
  mapChange?: (change: KeyedChange<object>) => KeyedChange<object>,
): KeyedChanges<Keyed, string, object> | undefined {
  if (!changes) return undefined
  return {
    ...changes,
    add: changes.add?.map(({ place, ...item }) => {
      const mapped = map(item)
      return place === undefined ? mapped : { ...mapped, place }
    }),
    change: mapChange ? changes.change?.map(mapChange) : changes.change,
  }
}
