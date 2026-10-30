/**
 * Відповідальний за запис у моках (ADR-0039): автор під час створення й перевірка, кому можна
 * передати запис. Окремо від `lib/mock-scope`: тут потрібні права й стан людей, а `lib/mock-company-roles`
 * сам спирається на `lib/mock-scope`. Без MSW.
 */
import { mockBlocked } from "@/registry/lib/mock-account"
import {
  mockPermissionsAcross,
  mockPermissionsIn,
} from "@/registry/lib/mock-company-roles"
import {
  hasMockCompanies,
  isMockCompanyMember,
  mockUsersList,
  type MockUser,
} from "@/registry/lib/mock-server"
import { grants } from "@/registry/lib/roles"

/** Тіло `POST`: відповідальний — з форми, а не передала — автор. */
export function withMockResponsible(
  body: Record<string, unknown>,
  field: string | undefined,
  author: MockUser,
): Record<string, unknown> {
  return field ? { ...body, [field]: body[field] ?? author.id } : body
}

/** Людина працює з записами ресурсу в компанії запису; спільний запис — у будь-якій своїй компанії. */
function canWorkWith(
  person: MockUser,
  resource: string,
  companyId: string | null,
) {
  const isShared = companyId === null && hasMockCompanies()
  const works = isShared
    ? person.companies.length > 0
    : isMockCompanyMember(person, companyId)
  const permissions = isShared
    ? mockPermissionsAcross(person)
    : mockPermissionsIn(person, companyId)
  return works && grants(permissions, resource, "read")
}

/**
 * Помилка поля, якщо запис не можна передати людині: вона має працювати в компанії запису, бути
 * активною й мати право бачити ресурс. Перевіряється лише справжня зміна: колега, що вже пішов,
 * не заважає зберегти інші поля; порожнє значення — запис без відповідального.
 */
export function mockResponsibleErrors({
  field,
  resource,
  companyId,
  value,
  previous,
}: {
  field: string | undefined
  resource: string
  companyId: string | null
  value: unknown
  previous: unknown
}): Record<string, string> | null {
  if (!field || value === previous || value === null || value === undefined)
    return null
  const person = mockUsersList().find((user) => user.id === value)
  const canHold =
    person !== undefined &&
    mockBlocked(person) === null &&
    canWorkWith(person, resource, companyId)
  return canHold ? null : { [field]: "invalid" }
}
