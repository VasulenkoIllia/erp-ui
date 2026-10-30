import { setupServer } from "msw/node"
import { afterAll, afterEach, beforeAll, beforeEach } from "vitest"
import { z } from "zod"

import { createApiClient, recordBaseSchema } from "@/registry/lib/api"
import { setCompanyId } from "@/registry/lib/company-scope"
import { createBulkHandlers, createJobHandlers } from "@/registry/lib/mock-jobs"
import { applyMockRoles } from "@/registry/lib/mock-team"
import {
  createPlatformHandlers,
  createResourceHandlers,
  signInMock,
  type MockUser,
} from "@/registry/lib/mocks"

/**
 * Спільне тестів «своїх» записів у моках (ADR-0039): люди, ролі, ресурс `notes` з полем відповідального
 * й масовою дією, сервер із хуками.
 */

const BASE = "http://erp.test/api/v1"
export const COMPANY = { id: "c1", name: "ТОВ «Тест»" }
const OTHER = { id: "c2", name: "ТОВ «Інша»" }

const person = (
  id: string,
  roles: string[],
  company = COMPANY,
  extra: Partial<MockUser> = {},
): MockUser => ({
  id,
  name: `Людина ${id}`,
  email: `${id}@zoriana.example`,
  password: "demo-password",
  totpCode: "111111",
  roles,
  permissions: [],
  companies: [company],
  companyId: company.id,
  factors: [],
  ...extra,
})

export const blocked = person("b1", ["manager"])
export const people = [
  person("a1", ["admin"]),
  person("m1", ["manager"]),
  person("m2", ["manager"]),
  person("s1", ["seller"]),
  person("n1", ["viewer"]),
  person("w1", ["writer"]),
  person("pa", ["admin"], COMPANY, { isPlatformAdmin: true }),
  person("x1", ["manager"], OTHER),
  person("p1", ["manager"], OTHER, { isPlatformAdmin: true }),
  blocked,
]

const noteSchema = recordBaseSchema
  .extend({
    title: z.string(),
    companyId: z.string().nullable(),
    responsibleId: z.string().nullable().optional(),
    closed: z.boolean().optional(),
    lines: z.array(z.string()).optional(),
  })
  .loose()

const seed = () => [
  { id: "n1", version: 1, title: "Моя", companyId: "c1", responsibleId: "m1" },
  { id: "n2", version: 1, title: "Чужа", companyId: "c1", responsibleId: "m2" },
  {
    id: "n3",
    version: 1,
    title: "Нічия",
    companyId: "c1",
    responsibleId: null,
    lines: ["рядок"],
  },
  {
    id: "n4",
    version: 1,
    title: "Спільна",
    companyId: null,
    responsibleId: "m1",
  },
  {
    id: "n5",
    version: 1,
    title: "Закрита",
    companyId: "c1",
    responsibleId: "m1",
    closed: true,
  },
]

export const notes = createResourceHandlers({
  resource: "notes",
  schema: noteSchema,
  data: seed,
  searchFields: ["title"],
  baseUrl: BASE,
  pins: true,
  responsibleField: "responsibleId",
  detailFields: ["lines"],
  // Обчислене поле картки: його немає в збереженому записі.
  detail: (record) => ({ computedLocked: record.responsibleId === null }),
  deniedActions: (_actor, record) => {
    const denied: Record<string, string> = {}
    if (record.closed) denied.update = "closed_period"
    if (record.computedLocked) denied.update = "computed"
    if (record.lines?.length) denied.delete = "has_lines"
    return denied
  },
})

let clock = 1_000
export const lockedOnce = new Set<string>()

const server = setupServer(
  ...createPlatformHandlers({
    users: people,
    baseUrl: BASE,
    linkUrl: (kind, token) => `http://demo.test/#/login/${kind}?token=${token}`,
    roles: [
      {
        id: "admin",
        name: { uk: "Адміністратор", en: "Administrator" },
        permissions: ["users:*", "roles:*", "notes:*", "audit:read"],
      },
      {
        id: "manager",
        name: { uk: "Менеджер", en: "Manager" },
        permissions: [
          "notes:read:own",
          "notes:create",
          "notes:update:own",
          "notes:delete:own",
        ],
      },
      {
        id: "seller",
        name: { uk: "Продажі", en: "Sales" },
        permissions: ["notes:read", "notes:update:own", "notes:delete:own"],
      },
      // Зміна без перегляду: запису не бачить, тож і змінити його не може.
      {
        id: "writer",
        name: { uk: "Правки", en: "Writer" },
        permissions: ["notes:update", "notes:delete"],
      },
      // Лише службове: запису не бачить, тож передати їй запис не можна.
      {
        id: "viewer",
        name: { uk: "Глядач", en: "Viewer" },
        permissions: ["audit:read"],
      },
    ],
    permissionResources: {
      notes: {
        label: { uk: "Нотатки", en: "Notes" },
        own: ["read", "update", "delete"],
      },
      users: { label: { uk: "Користувачі", en: "Users" } },
      roles: {
        label: { uk: "Ролі", en: "Roles" },
        actions: ["read", "update"],
      },
      audit: { label: { uk: "Журнал", en: "Audit" }, actions: ["read"] },
    },
    apiResources: { notes: { uk: "Нотатки", en: "Notes" } },
  }),
  ...notes.handlers,
  ...createJobHandlers({ baseUrl: BASE, now: () => clock }),
  ...createBulkHandlers({
    resource: "notes",
    db: notes.db,
    actions: {
      delete: {
        // Перша спроба над n1 зайнята: її можна повторити (перевірка повтору після зниження ролі).
        apply: ({ id }) => {
          if (id !== "n1" || !lockedOnce.has(id)) return { changes: {} }
          lockedOnce.delete(id)
          return { code: "locked", message: "Busy", retryable: true }
        },
      },
    },
    titleField: "title",
    baseUrl: BASE,
    now: () => clock,
  }),
)

export const client = createApiClient({
  baseUrl: BASE,
  getLanguage: () => "uk",
})

export const noteRow = z.object({
  id: z.string(),
  version: z.number(),
  responsibleId: z.string().nullable().optional(),
  deniedActions: z.record(z.string(), z.string()).optional(),
})
const list = z.object({ data: z.array(noteRow), total: z.number() })

export const listNotes = (query = "") =>
  client.get(`/notes${query}`, { schema: list })

export const statusOf = (promise: Promise<unknown>) =>
  promise.then(
    () => 200,
    (error: unknown) => {
      const { status, fieldErrors } = error as {
        status?: number
        fieldErrors?: unknown
      }
      return fieldErrors ? `422 ${JSON.stringify(fieldErrors)}` : status
    },
  )

export const jobSchema = z.object({
  succeeded: z.number(),
  failures: z.array(
    z.object({
      code: z.string(),
      items: z.array(z.object({ id: z.string() })),
    }),
  ),
})

/** Масова дія до кінця: годинник задачі йде вперед без очікування. */
export async function runBulk(body: unknown) {
  const { jobId } = await client.post("/notes/bulk/delete", body, {
    schema: z.object({ jobId: z.string() }),
  })
  advanceJobClock()
  const job = await client.get(`/jobs/${jobId}`, { schema: jobSchema })
  return {
    succeeded: job.succeeded,
    failed: Object.fromEntries(
      job.failures.map((group) => [
        group.code,
        group.items.map((item) => item.id),
      ]),
    ),
  }
}

/** Годинник задачі вперед: задача завершується без очікування. */
export function advanceJobClock() {
  clock += 60_000
}

/** Сервер на весь файл тестів і чисті дані на кожен тест. */
export function useOwnRecordsServer() {
  beforeAll(() => {
    server.listen({ onUnhandledFrame: "error" })
  })
  afterAll(() => {
    server.close()
  })
  beforeEach(() => {
    signInMock(null)
    localStorage.clear()
    applyMockRoles()
    notes.db.reset()
    setCompanyId(COMPANY.id)
    clock = 1_000
    lockedOnce.clear()
  })
  afterEach(() => {
    server.resetHandlers()
  })
}
