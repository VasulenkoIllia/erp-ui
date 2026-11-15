/**
 * API платформи (ADR-0092): акаунт, безпека, аудит, вебхуки, ролі, запрошення, сповіщення, канал
 * подій, стрічка, компанія. Проект звертається до них через провайдер входу, як і раніше:
 * `authProvider.audit.getEvents(…)`; `createAuthProvider` бере їх звідси.
 *
 * Перший екран легкий: код API, якого оболонка на старті не потребує, вантажиться окремим чанком
 * при першому виклику будь-якого його методу. Методи — власні поля об'єкта, тож перевизначення в
 * адаптері працює як завжди: `{ ...kitAuth.admin, blockUser }` (ADR-0021). Чанк, що не завантажився
 * (офлайн, застарілий деплой), відхиляє виклик помилкою браузера (`isChunkLoadError` з lib/lazy):
 * запит повторюється раз, як після збою мережі (lib/query-client), а `useApiErrorMessage` просить
 * оновити сторінку. Наступний виклик пробує завантажити чанк знову. Компоненти кіта, що читають ці
 * API запитами, імпортують з файла API ключі й схеми, тож його чанк приходить разом із ними.
 *
 * Новий API платформи (кошик, погодження, пошта) додається сюди лінивим, з переліком методів; одразу
 * — лише те, що потрібне оболонці до першої дії людини (сповіщення, канал подій, компанія, ролі для
 * перевірки прав).
 */
import type { AccountApi } from "@/registry/lib/account"
import type { ApiClient } from "@/registry/lib/api"
import type { AuditApi } from "@/registry/lib/audit"
import { createCompanyApi, type CompanyApi } from "@/registry/lib/company"
import type { InvitationsApi } from "@/registry/lib/invitations"
import { createInboxApi, type InboxApi } from "@/registry/lib/notifications"
import { createRealtimeApi, type RealtimeApi } from "@/registry/lib/realtime"
import { createRolesApi, type RolesApi } from "@/registry/lib/roles"
import type { AdminApi } from "@/registry/lib/security-policy"
import type { TimelineApi } from "@/registry/lib/timeline"
import type { WebhooksApi } from "@/registry/lib/webhooks"

export interface PlatformApis {
  /** Фактори, резервні коди, сесії, пристрої, журнал входів, профіль, токени API (lib/account). */
  account: AccountApi
  /**
   * Політика безпеки, запити на відновлення, скидання другого кроку, доступ користувачів —
   * сесії й блокування (lib/security-policy).
   */
  admin: AdminApi
  /** Журнал аудиту (lib/audit, ADR-0013). */
  audit: AuditApi
  /** Вебхуки (lib/webhooks, ADR-0013). */
  webhooks: WebhooksApi
  /** Ролі, права й призначення ролей (lib/roles, ADR-0014). */
  roles: RolesApi
  /** Запрошення колег (lib/invitations, ADR-0014). */
  invitations: InvitationsApi
  /** Центр сповіщень (lib/notifications, ADR-0014). */
  inbox: InboxApi
  /** Канал подій сервера (lib/realtime, ADR-0051). */
  realtime: RealtimeApi
  /** Стрічка запису (lib/timeline, ADR-0053). */
  timeline: TimelineApi
  /** Налаштування поточної компанії (lib/company, ADR-0014). */
  company: CompanyApi
}

export interface PlatformApisOptions {
  /** Профіль змінився (фактори, ім'я, фото в `account`): `/me` треба завантажити заново. */
  onMeChange?: () => Promise<unknown>
}

/**
 * API, який можна вантажити ліниво: кожне поле — обов'язковий метод із рядковою назвою, що повертає
 * проміс. Необов'язковий метод чи символьний ключ обгортка підмінити не може: вона створює всі методи
 * переліку одразу, а `Object.keys` символів не бачить.
 */
export type AsyncApi<T> = {
  [K in keyof T]-?: K extends string
    ? (...args: never[]) => Promise<unknown>
    : never
}

/**
 * Об'єкт із методами `methods`, що вантажить справжній API при першому виклику. Перелік методів —
 * об'єкт з усіма ключами типу: TypeScript не дасть пропустити новий метод чи лишити зайвий (у
 * літералі об'єкта). Так додається й новий API платформи кіта, і свій API проекту, якого перший екран
 * не потребує: `load` — динамічний імпорт файла API і виклик його фабрики, як для `audit` нижче.
 */
export function lazyApi<T extends AsyncApi<T>>(
  load: () => Promise<T>,
  methods: Record<keyof T, true>,
): T {
  let loading: Promise<T> | undefined
  const loaded = () =>
    // `then(load)`: і синхронний виняток у `load` стає відхиленим промісом виклику.
    (loading ??= Promise.resolve()
      .then(load)
      .catch((error: unknown) => {
        // Невдалий чанк не запам'ятовуємо: повтор («Спробувати ще») вантажить його знову.
        loading = undefined
        throw error
      }))
  const lazy: Record<string, (...args: unknown[]) => Promise<unknown>> = {}
  for (const name of Object.keys(methods) as (keyof T & string)[])
    lazy[name] = (...args) =>
      loaded().then((api) => Reflect.apply(api[name], api, args) as unknown)
  // Ті самі ключі, і кожен викликає той самий метод завантаженого API з тими самими аргументами;
  // для узагальненого T TypeScript цього довести не може.
  return lazy as unknown as T
}

const ACCOUNT_METHODS: Record<keyof AccountApi, true> = {
  getSecurity: true,
  setSignInAlerts: true,
  startTotp: true,
  verifyTotp: true,
  startSms: true,
  verifySms: true,
  enableEmail: true,
  addPasskey: true,
  renameFactor: true,
  removeFactor: true,
  regenerateBackupCodes: true,
  getSessions: true,
  endSession: true,
  endOtherSessions: true,
  getTrustedDevices: true,
  forgetDevice: true,
  forgetAllDevices: true,
  getSignIns: true,
  updateProfile: true,
  uploadAvatar: true,
  removeAvatar: true,
  getApiTokens: true,
  createApiToken: true,
  revokeApiToken: true,
  getNotificationSettings: true,
  updateNotificationSettings: true,
}

const ADMIN_METHODS: Record<keyof AdminApi, true> = {
  getSecurityPolicy: true,
  updateSecurityPolicy: true,
  getRecoveryRequests: true,
  declineRecoveryRequest: true,
  resetFactors: true,
  getUserAccess: true,
  getSessions: true,
  endSession: true,
  signOutUser: true,
  blockUser: true,
  unblockUser: true,
  removeFromCompany: true,
}

const AUDIT_METHODS: Record<keyof AuditApi, true> = {
  getEvents: true,
  exportEvents: true,
}

const WEBHOOKS_METHODS: Record<keyof WebhooksApi, true> = {
  list: true,
  create: true,
  update: true,
  remove: true,
  rotateSecret: true,
  test: true,
  getDeliveries: true,
  redeliver: true,
}

const INVITATIONS_METHODS: Record<keyof InvitationsApi, true> = {
  list: true,
  create: true,
  resend: true,
  revoke: true,
}

const TIMELINE_METHODS: Record<keyof TimelineApi, true> = {
  list: true,
  post: true,
  updateNote: true,
  remove: true,
  uploadFile: true,
  followers: true,
  follow: true,
  unfollow: true,
  activities: true,
  addActivity: true,
  updateActivity: true,
  myActivities: true,
}

export function createPlatformApis(
  client: ApiClient,
  { onMeChange }: PlatformApisOptions = {},
): PlatformApis {
  return {
    account: lazyApi(
      () =>
        import("./account").then((m) =>
          m.createAccountApi(client, { onMeChange }),
        ),
      ACCOUNT_METHODS,
    ),
    admin: lazyApi(
      () => import("./security-policy").then((m) => m.createAdminApi(client)),
      ADMIN_METHODS,
    ),
    audit: lazyApi(
      () => import("./audit").then((m) => m.createAuditApi(client)),
      AUDIT_METHODS,
    ),
    webhooks: lazyApi(
      () => import("./webhooks").then((m) => m.createWebhooksApi(client)),
      WEBHOOKS_METHODS,
    ),
    roles: createRolesApi(client),
    invitations: lazyApi(
      () => import("./invitations").then((m) => m.createInvitationsApi(client)),
      INVITATIONS_METHODS,
    ),
    inbox: createInboxApi(client),
    realtime: createRealtimeApi(client),
    timeline: lazyApi(
      () => import("./timeline").then((m) => m.createTimelineApi(client)),
      TIMELINE_METHODS,
    ),
    company: createCompanyApi(client),
  }
}
