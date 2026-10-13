/**
 * Поточна компанія (PF02, ADR-0002 §5): одне джерело для заголовка `X-Company-Id` і ключів кешу.
 *
 * - Клієнт API (`createApiClient`) бере компанію лише звідси: інше джерело (напр. адреса сторінки)
 *   передається через `setCompanyId`, інакше заголовок і ключі кешу розійдуться.
 * - Профіль (`lib/auth`) після кожного завантаження викликає `syncCompany`: збережений вибір лишається,
 *   якщо компанія ще доступна користувачу, інакше — компанія з профілю. Якщо сервер відмовив у
 *   збереженій компанії (403: доступ закрили чи на цьому ПК увійшов інший користувач), профіль
 *   запитується без неї.
 * - Запити, що залежать від компанії, додають у кінець ключа `companyScope(id)`: дані іншої компанії
 *   ніколи не показуються як свої, а відповідь, що прийшла після перемикання, лягає у свій ключ.
 *   Константи `*_QUERY_KEYS` лишаються префіксами — інвалідація за ними зачіпає всі компанії.
 * - Перемикати компанію — через `useCompany()` з hooks/use-company (скидає дані й оновлює профіль).
 * - localStorage — лише щоб пам'ятати вибір між перезавантаженнями.
 */

const COMPANY_STORAGE_KEY = "erp-ui:company"
/** Id іде в заголовок: зіпсоване сховище не повинно ламати кожен запит. */
const STORED_ID = /^[\x21-\x7e]{1,128}$/

let companyId: string | null = (() => {
  try {
    const stored = globalThis.localStorage?.getItem(COMPANY_STORAGE_KEY)
    return stored && STORED_ID.test(stored) ? stored : null
  } catch {
    return null
  }
})()
const listeners = new Set<() => void>()

export function getCompanyId(): string | null {
  return companyId
}

export function setCompanyId(id: string | null): void {
  if (id === companyId) return
  companyId = id
  try {
    if (id) globalThis.localStorage?.setItem(COMPANY_STORAGE_KEY, id)
    else globalThis.localStorage?.removeItem(COMPANY_STORAGE_KEY)
  } catch {
    // Без сховища вибір живе до перезавантаження.
  }
  listeners.forEach((listener) => {
    listener()
  })
}

export function subscribeCompany(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Компанії користувача з профілю (`/me`). */
export interface CompanyMembership {
  companyId?: string | null
  companies: readonly { id: string }[]
}

/** Збережена компанія, якщо вона доступна користувачу, інакше — типова з профілю. */
export function syncCompany(me: CompanyMembership): void {
  if (companyId && me.companies.some((c) => c.id === companyId)) return
  setCompanyId(me.companyId ?? me.companies[0]?.id ?? null)
}

/** Частина ключа запиту, що залежить від компанії: `[...KEYS.list, companyScope(id)]`. */
export function companyScope(id: string | null): { companyId: string | null } {
  return { companyId: id }
}
