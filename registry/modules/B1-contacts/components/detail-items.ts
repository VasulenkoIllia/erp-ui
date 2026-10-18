import type { BankAccount } from "../contract"

/**
 * Вкладені колекції організації для `PATCH` (ADR-0028): колекція йде цілком, тож зміну одного
 * елемента застосовують до колекції запису, від якого рахують версію, — збереженої чи, після
 * «Зберегти мої зміни», збереженої зараз іншим користувачем.
 */

/** Елемент колекції в запиті: новий — без `id`, його дає сервер. */
type DetailItemInput<T extends { id: string }> = Omit<T, "id"> & {
  id?: string
}

/**
 * Колекція зі зміненим елементом: на своєму місці за `id`. Новий (`id` немає) — у кінці; той, що
 * інший користувач тим часом видалив, — теж у кінці й без `id`, як новий: «Зберегти мої зміни»
 * повертає його, а сервер дає новий `id`.
 */
export function withItem<T extends { id: string }>(
  items: readonly T[],
  id: string | undefined,
  values: Omit<T, "id">,
): DetailItemInput<T>[] {
  const index =
    id === undefined ? -1 : items.findIndex((item) => item.id === id)
  return index < 0
    ? [...items, values]
    : items.map((item, at) => (at === index ? { ...values, id } : item))
}

export function withoutItem<T extends { id: string }>(
  items: readonly T[],
  id: string,
): T[] {
  return items.filter((item) => item.id !== id)
}

/** Рахунки з іншим основним: рівно один позначений (ADR-0028). */
export function withPrimary(
  accounts: readonly BankAccount[],
  id: string,
): BankAccount[] {
  return accounts.map((account) => ({ ...account, primary: account.id === id }))
}

/**
 * Рахунок, що стане основним після видалення `id`: перший з решти, як рахує сервер. `null` — видаляють
 * не основний або інших рахунків немає.
 */
export function nextPrimary(
  accounts: readonly BankAccount[],
  id: string,
): BankAccount | null {
  const removed = accounts.find((account) => account.id === id)
  if (!removed?.primary) return null
  return accounts.find((account) => account.id !== id) ?? null
}

/** Ім'я поля форми для помилки сервера в колекції: `bankAccounts.1.iban` → `iban`. */
export const itemFieldOf = (collection: "addresses" | "bankAccounts") => {
  const prefix = new RegExp(`^${collection}\\.\\d+\\.`)
  return (field: string): string => field.replace(prefix, "")
}
