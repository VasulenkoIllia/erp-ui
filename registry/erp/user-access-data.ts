import { useQuery, useQueryClient } from "@tanstack/react-query"

import { useErpAuthProvider } from "@/registry/erp/auth-layout"
import { useRoles } from "@/registry/erp/role-picker"
import { useCompanyId } from "@/registry/hooks/use-company"
import { useMe } from "@/registry/hooks/use-me"
import { AUDIT_QUERY_KEYS } from "@/registry/lib/audit"
import { hasPermission } from "@/registry/lib/auth"
import { companyScope } from "@/registry/lib/company-scope"
import { useErpUiT } from "@/registry/lib/i18n"
import { canGrant, permissionsOfRoles } from "@/registry/lib/roles"
import { ADMIN_QUERY_KEYS } from "@/registry/lib/security-policy"

/**
 * Дані доступу користувача для адміністратора (ADR-0013): запит `GET /users/:id/access` і
 * оновлення після змін. Спільні для панелі доступу (`erp/user-access`), дій, сесій і ролей людини.
 */

export interface AccessTarget {
  id: string
  name: string
  email: string
}

/** Стан доступу користувача (право `users:update`). */
export function useUserAccess(userId: string, enabled = true) {
  const provider = useErpAuthProvider()
  const companyId = useCompanyId()
  return useQuery({
    queryKey: [...ADMIN_QUERY_KEYS.userAccess(userId), companyScope(companyId)],
    queryFn: () => provider.admin.getUserAccess(userId),
    enabled,
    // Сесії й стан змінюються будь-коли: панель відкривається зі свіжими даними.
    refetchOnMount: "always",
  })
}

/** Що показати діям над доступом людини: причину відмови й чи ще перевіряємо (ADR-0034). */
export interface AccessCeiling {
  /** Людина понад «стелю»: дії неактивні з цією причиною (рядок кіта `userAccess.beyondCeiling`). */
  deniedReason?: string
  /** Профіль чи каталог ролей ще вантажиться: дії неактивні, щоб не мінялися під пальцем. */
  checking: boolean
}

/** «Стеля» за каталогом ролей: стан перевірки й чи дають ролі права понад свої. */
export interface RolesCeiling {
  /** Профіль чи каталог ролей ще вантажиться: дії неактивні, щоб не мінялися під пальцем. */
  checking: boolean
  /**
   * Чи дають ролі `roleIds` права, яких немає в поточної людини в компанії запиту; `false` і без
   * права на каталог чи з його помилкою — тоді вирішує сервер, відмову показує тост.
   */
  exceeds: (roleIds: readonly string[]) => boolean
}

/**
 * «Стеля» за каталогом ролей (ADR-0034, ADR-0035): для однієї людини чи списку запрошень. Поки
 * профіль вантажиться чи каталог вантажиться для того, хто має `roles:read`, — `checking`; без
 * профілю (помилка), без права на каталог чи з його помилкою — без «стелі»: вирішує сервер.
 */
export function useRolesCeiling(enabled = true): RolesCeiling {
  const profile = useMe()
  const me = profile.data
  const canReadRoles = me
    ? hasPermission(me.permissions, "roles", "read")
    : false
  const roles = useRoles(enabled && canReadRoles)
  const catalog = roles.data?.roles
  return {
    // Запит каталогу може йти й без права (секція запрошень читає ролі для назв): його стан не
    // чекаємо, інакше дії без `roles:read` були б неактивні до відповіді 403.
    checking:
      enabled &&
      (profile.isPending || (canReadRoles && !catalog && roles.isLoading)),
    exceeds: (roleIds) =>
      enabled && me && catalog
        ? !canGrant(me.permissions, permissionsOfRoles(roleIds, catalog))
        : false,
  }
}

/**
 * «Стеля» доступу (ADR-0034): чи має поточний адміністратор усі права людини з ролями `roleIds` —
 * за каталогом ролей (`roles:read`). З `deniedReason` вийти, завершити сесію, заблокувати,
 * розблокувати чи скинути другий крок сервер не дасть. Без права на каталог чи з його помилкою —
 * без причини: вирішує сервер, відмову показує тост. Результат — пропси `UserAccessButtons` і
 * `UserSessionsList`.
 */
export function useAccessCeiling(
  roleIds: readonly string[],
  enabled = true,
): AccessCeiling {
  const t = useErpUiT()
  const ceiling = useRolesCeiling(enabled)
  if (ceiling.checking) return { checking: true }
  return ceiling.exceeds(roleIds)
    ? { deniedReason: t("userAccess.beyondCeiling"), checking: false }
    : { checking: false }
}

/**
 * Після зміни доступу — оновити панель, список сесій, бейджі й журнал: вихід, завершена сесія чи
 * скинутий другий крок пишуть подію в «Історію» картки, а версії запису не змінюють.
 */
export function useRefreshAccess() {
  const queryClient = useQueryClient()
  return (userId: string) => {
    // Журнал — не чекаючи: кнопка дії не тримає спінер до відповіді журналу.
    void queryClient.invalidateQueries({ queryKey: AUDIT_QUERY_KEYS.events })
    return Promise.all([
      queryClient.invalidateQueries({
        queryKey: ADMIN_QUERY_KEYS.userAccess(userId),
      }),
      queryClient.invalidateQueries({ queryKey: ADMIN_QUERY_KEYS.sessions }),
    ])
  }
}
