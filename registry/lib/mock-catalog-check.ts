/**
 * Звірка прав моків із каталогом (ADR-0039): рядок, якого каталог не знає (`users:read:own`, ресурс з
 * одруком), сервер відхилив би 422, а початкові ролі, `MockUser.permissions` і ролі з localStorage ніщо
 * інше не перевіряє. Службове право з `:own` моки однаково не виконають (`mockGrantsService`), тож
 * розробник бачить попередження в консолі, а не мовчазну відмову. Моки працюють лише в розробці, демо
 * й тестах; кожен рядок — один раз. Без MSW.
 */
import {
  mockProjectRoles,
  readMockCompanyRoles,
} from "@/registry/lib/mock-company-roles"
import { mockUsersList } from "@/registry/lib/mock-server"
import {
  isCatalogPermission,
  type PermissionResource,
} from "@/registry/lib/roles"

const warned = new Set<string>()

/** Ролі й люди моків із правами, які треба звірити: ключ — звідки право. */
function mockPermissionSources(): [string, readonly string[]][] {
  const stored = Object.values(readMockCompanyRoles()).flatMap(
    ({ roles }) => roles,
  )
  return [
    ...[...mockProjectRoles(), ...stored].map(
      (role): [string, readonly string[]] => [
        `role "${role.id}"`,
        role.permissions ?? [],
      ],
    ),
    ...mockUsersList().map((user): [string, readonly string[]] => [
      `user "${user.id}"`,
      user.permissions,
    ]),
  ]
}

/** Попередити про права моків поза каталогом; без каталогу звіряти нема з чим. */
export function warnOutsideMockCatalog(
  catalog: readonly PermissionResource[],
): void {
  if (!catalog.length) return
  for (const [source, permissions] of mockPermissionSources()) {
    for (const permission of permissions) {
      if (isCatalogPermission(permission, catalog)) continue
      const message = `erp-ui: mock ${source} has permission "${permission}" outside the catalog (permissionResources)`
      if (warned.has(message)) continue
      warned.add(message)
      console.warn(message)
    }
  }
}
