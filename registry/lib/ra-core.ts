/**
 * Шов ra-core (ADR-0090): кіт бере ra-core лише звідси, і тут видно все, на що він спирається.
 * Нове ім'я з бібліотеки додаємо поіменно у свою групу, без `export *`. Мажорне оновлення ra-core
 * чи заміна одного хука власним зачіпає цей файл, а не кожен модуль. Статичний імпорт чи реекспорт
 * ra-core будь-де, крім цього файла, — помилка ESLint кіта. У проекті — `@/lib/ra-core`.
 */

// Застосунок: обгортка з dataProvider, authProvider, i18nProvider і queryClient (ADR-0002, ADR-0003).
export { CoreAdminContext } from "ra-core"

// Дані (CRUD): читання, зміни й оновлення кешу.
export {
  useCreate,
  useDataProvider,
  useDelete,
  useGetList,
  useGetManyAggregate,
  useGetOne,
  useRefresh,
  useUpdate,
} from "ra-core"

// Вхід і права.
export {
  useAuthenticated,
  useAuthProvider,
  useCanAccess,
  useHandleAuthCallback,
  useLogout,
} from "ra-core"

// Навігація: посилання, адреса й блокування переходу з незбереженими змінами.
export {
  LinkBase,
  useBlocker,
  useCanBlock,
  useLocation,
  useNavigate,
} from "ra-core"

// Типи провайдерів, записів і запитів списку.
export type {
  AuthProvider,
  DataProvider,
  GetListParams,
  GetListResult,
  I18nProvider,
  Identifier,
  RaRecord,
  SortPayload,
} from "ra-core"
