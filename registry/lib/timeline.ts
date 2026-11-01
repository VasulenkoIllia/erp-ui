/**
 * Стрічка запису (PF05, UI01, ADR-0053): нотатки й повідомлення, зміни полів, файли, підписники й
 * заплановані дії одного запису.
 *
 * Контракт (під `/api/v1`). Кожен запит потребує лише `<ресурс>:read`: писати може кожен, хто бачить
 * запис, змінювати сам запис для цього не треба. Запис, якого людина не бачить, — 404.
 * - `GET /<ресурс>/<id>/timeline?kind=&page=&perPage=` → { data, total }, новіші першими. Зміни полів,
 *   завершені дії й події проекту пише сам сервер.
 * - `POST /<ресурс>/<id>/timeline` { requestId, kind: "note" | "message", body } → запис, 201. Нотатку
 *   бачить лише команда, повідомлення йде назовні, надсилає його сервер проекту й сам вибирає отримувача:
 *   запис приходить зі станом `queued`, далі сервер шле подію. Згаданих і підписників сповіщає сервер.
 * - `requestId` робить запит ідемпотентним: той самий ключ повертає той самий запис, тож загублена
 *   відповідь не надсилає лист двічі. Клієнт міняє ключ, лише коли змінився сам текст чи вид.
 * - `PATCH /<ресурс>/<id>/timeline/<entryId>` { version, body } → нотатка; чужа версія — 409 із
 *   `current`. Повідомлення вже пішло, зміни полів пише сервер: їх не змінюють.
 * - `DELETE /<ресурс>/<id>/timeline/<entryId>` → 204: нотатка чи файл.
 * - `POST /<ресурс>/<id>/files` multipart (`requestId`, `file`) → запис `file`, 201. `url` у файлі —
 *   абсолютна адреса `http(s)`, що відкривається без заголовків і живе довше за відкриту картку: стрічка
 *   з каналом не перечитується сама. Відносну адресу кіт не показує посиланням.
 * - `GET /<ресурс>/<id>/followers` → { data }; `PUT`, `DELETE /<ресурс>/<id>/followers/<userId>` → 204,
 *   обидва ідемпотентні.
 * - `GET /<ресурс>/<id>/activities` → { data }: лише відкриті дії, найближчий термін першим.
 * - `POST /<ресурс>/<id>/activities` { requestId, type, title, dueDate, assigneeId } → дія, 201.
 * - `PATCH /<ресурс>/<id>/activities/<activityId>` { version, ... } → дія; `status: "done"` чи
 *   `"cancelled"` закриває її й дописує запис `activity` у стрічку. Чужа версія — 409 із `current`.
 * - Подія `<ресурс>.timeline` каналу реального часу (ADR-0051) обов'язкова, щойно канал є: опитування
 *   тоді вимкнено. З `id` — перечитати стрічку цього запису, без `id` — усі стрічки ресурсу.
 * - Запит, що не дочекався відповіді, міг дійти. Повтор `PATCH` дасть 409, `DELETE` дасть 404: кіт вважає
 *   виконаним 404 на видаленні й 409 із тим самим текстом нотатки.
 * - `deniedActions` на нотатці, файлі й дії — як на записі (ADR-0037): `{ update: "own" }`.
 * - Сервер проекту перевіряє `body` за ADR-0052: межі глибини й довжини, кожен `id` згадки, ім'я з
 *   довідника. Текст, який іде назовні, будує сам і екранує.
 *
 * Запис невідомого виду (новіша версія сервера, подія проекту) стає `other`: стрічка показує його `text`,
 * а не падає цілком. Те саме із записом, що не пройшов схему. Зіпсоване другорядне поле зникає, запис
 * лишається. Рядок без `id` чи з датою, яку не прочитати, випадає зі списку: показ дати кинув би виняток.
 * Не пройшов жоден рядок — це вже інший контракт, і людина бачить помилку, а не порожню стрічку.
 * `id` нотаток і файлів спільний: `DELETE` адресує запис лише за ним. Зміни полів і події можуть мати
 * ті самі `id`: журнал часто живе в іншій таблиці.
 */
import { z } from "zod"

import type { ApiClient } from "@/registry/lib/api"
import { auditEventSchema } from "@/registry/lib/audit"
import { isCalendarDate } from "@/registry/lib/dates"
import { richTextSchema, type RichTextDoc } from "@/registry/lib/rich-text"

/** Ресурс сценаріїв моків. */
export const TIMELINE_SCENARIO_RESOURCE = "timeline"
/** Записів на сторінку стрічки. */
export const TIMELINE_PER_PAGE = 20
/** Опитування, коли каналу реального часу немає. */
export const TIMELINE_POLL_MS = 60_000
/** Найбільший файл за замовчуванням; сервер проекту має свою межу. */
export const TIMELINE_MAX_FILE_BYTES = 25 * 1024 * 1024
/** Зависле читання не тримає опитування й дію, що чекає перечитування. */
export const TIMELINE_READ_TIMEOUT_MS = 30_000
/** Скільки чекати запис: тайм-аут не означає «не збережено», повтор іде з тим самим `requestId`. */
export const TIMELINE_WRITE_TIMEOUT_MS = 30_000
export const TIMELINE_UPLOAD_TIMEOUT_MS = 120_000
/** Найповільніший канал, на якому файл ще має дійти. */
const TIMELINE_UPLOAD_MIN_BYTES_PER_SECOND = 64 * 1024

/** Тайм-аут файла росте з розміром: великий файл на слабкому каналі інакше не дійде ніколи. */
export const timelineUploadTimeoutMs = (bytes: number) =>
  Math.max(
    TIMELINE_UPLOAD_TIMEOUT_MS,
    Math.ceil((bytes / TIMELINE_UPLOAD_MIN_BYTES_PER_SECOND) * 1_000),
  )

export const timelineEventType = (resource: string) => `${resource}.timeline`

/** Який запис і якого ресурсу. */
export interface TimelineTarget {
  readonly resource: string
  readonly id: string
}

/* --------------------------------- Схеми --------------------------------- */

export const TIMELINE_POST_KINDS = ["note", "message"] as const
export type TimelinePostKind = (typeof TIMELINE_POST_KINDS)[number]

/** Вибір у стрічці; `all` — без фільтра. */
export const TIMELINE_FILTERS = [
  "all",
  "note",
  "message",
  "change",
  "file",
] as const
export type TimelineFilter = (typeof TIMELINE_FILTERS)[number]

/** Види дій кіта; сервер може мати свої, тоді підпис — сам `type`. */
export const TIMELINE_ACTIVITY_TYPES = [
  "call",
  "meeting",
  "email",
  "task",
] as const

const deniedActionsSchema = z
  .record(z.string(), z.string())
  .optional()
  .catch(undefined)
const optionalTextSchema = z.string().optional().catch(undefined)
/** Дату показує `lib/format`, а він на нечитабельному значенні кидає виняток. */
const timestampSchema = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)))

/** Зіпсований рядок випадає, а не забирає решту списку; якщо не вижив жоден, це помилка, а не «порожньо». */
const rowsOf = <T extends z.ZodType>(schema: T) =>
  z.array(z.unknown()).transform((rows, context) => {
    const valid = rows.flatMap((row) => {
      const parsed = schema.safeParse(row)
      return parsed.success ? [parsed.data] : []
    })
    if (rows.length && !valid.length)
      context.addIssue({ code: "custom", message: "No valid rows" })
    return valid
  })

export const timelinePersonSchema = z.object({
  id: z.string(),
  name: z.string(),
})
export type TimelinePerson = z.infer<typeof timelinePersonSchema>

export const timelineFileSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Розмір у байтах. */
  size: z.number().int().min(0),
  type: optionalTextSchema,
  /** Підписана адреса: перевіряє `safeLinkHref`, сервер міг покласти що завгодно. */
  url: z.string(),
})
export type TimelineFile = z.infer<typeof timelineFileSchema>

const entryBase = {
  id: z.string(),
  at: timestampSchema,
  /** Хто написав; без `id` — клієнт ззовні чи система. Автора могли видалити. */
  author: z
    .object({ id: z.string().optional(), name: z.string() })
    .catch({ name: "" }),
}

const noteSchema = z.object({
  ...entryBase,
  kind: z.literal("note"),
  body: richTextSchema,
  version: z.number().int().min(1),
  editedAt: optionalTextSchema,
  deniedActions: deniedActionsSchema,
})

const messageSchema = z.object({
  ...entryBase,
  kind: z.literal("message"),
  body: richTextSchema,
  direction: z.enum(["outgoing", "incoming"]),
  /** Стан вихідного: надсилає сервер, тому стан може змінитись після відповіді. */
  status: z.enum(["queued", "sent", "failed"]).optional().catch(undefined),
  /** Кому пішло чи від кого прийшло. */
  party: optionalTextSchema,
})

const changeSchema = z.object({
  ...entryBase,
  kind: z.literal("change"),
  changes: auditEventSchema.shape.changes.unwrap(),
})

const fileEntrySchema = z.object({
  ...entryBase,
  kind: z.literal("file"),
  file: timelineFileSchema,
  deniedActions: deniedActionsSchema,
})

const closedActivitySchema = z.object({
  ...entryBase,
  kind: z.literal("activity"),
  activity: z.object({
    type: z.string(),
    title: z.string(),
    status: z.enum(["done", "cancelled"]),
  }),
})

const otherSchema = z
  .object({ ...entryBase, text: z.string().optional() })
  .transform((entry) => ({ ...entry, kind: "other" as const }))

export const timelineEntrySchema = z.union([
  z.discriminatedUnion("kind", [
    noteSchema,
    messageSchema,
    changeSchema,
    fileEntrySchema,
    closedActivitySchema,
  ]),
  otherSchema,
])
export type TimelineEntry = z.output<typeof timelineEntrySchema>
export type TimelineNote = z.output<typeof noteSchema>

const timelinePageSchema = z.object({
  data: rowsOf(timelineEntrySchema),
  total: z.number().int().min(0),
})
export type TimelinePage = z.output<typeof timelinePageSchema>

export const timelineActivitySchema = z.object({
  id: z.string(),
  version: z.number().int().min(1),
  type: z.string(),
  title: z.string(),
  /** Календарна дата "2026-11-02": дія має день, а не хвилину. */
  dueDate: z.string().refine(isCalendarDate),
  assignee: timelinePersonSchema,
  deniedActions: deniedActionsSchema,
})
export type TimelineActivity = z.output<typeof timelineActivitySchema>

export const timelineActivityInputSchema = z.object({
  type: z.string().min(1),
  title: z.string().trim().min(1),
  dueDate: z.string().min(1),
  assigneeId: z.string().min(1),
})
export type TimelineActivityInput = z.output<typeof timelineActivityInputSchema>

/** Зміна дії: поля форми чи закриття. */
export type TimelineActivityPatch = Partial<TimelineActivityInput> & {
  readonly version: number
  readonly status?: "done" | "cancelled"
}

const followersSchema = z.object({ data: rowsOf(timelinePersonSchema) })
const activitiesSchema = z.object({ data: rowsOf(timelineActivitySchema) })

/* --------------------------------- Чисті функції --------------------------------- */

export const timelineEntryKey = ({ kind, id }: TimelineEntry) => `${kind}/${id}`

/**
 * Записи всіх сторінок без повторів: новий запис зсуває сторінки, тож останній рядок попередньої
 * сторінки може прийти ще раз на наступній.
 */
export function timelineEntriesOf(
  pages: readonly TimelinePage[],
): TimelineEntry[] {
  const seen = new Set<string>()
  return pages
    .flatMap((page) => page.data)
    .filter((entry) => {
      const key = timelineEntryKey(entry)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

/* -------------------------------- Клієнт API -------------------------------- */

export interface TimelineApi {
  list: (
    target: TimelineTarget,
    filter: TimelineFilter,
    page: number,
    perPage: number,
    signal?: AbortSignal,
  ) => Promise<TimelinePage>
  post: (
    target: TimelineTarget,
    input: { requestId: string; kind: TimelinePostKind; body: RichTextDoc },
  ) => Promise<TimelineEntry>
  updateNote: (
    target: TimelineTarget,
    entryId: string,
    input: { version: number; body: RichTextDoc },
  ) => Promise<TimelineEntry>
  remove: (target: TimelineTarget, entryId: string) => Promise<void>
  uploadFile: (
    target: TimelineTarget,
    file: File,
    requestId: string,
  ) => Promise<TimelineEntry>
  followers: (
    target: TimelineTarget,
    signal?: AbortSignal,
  ) => Promise<TimelinePerson[]>
  follow: (target: TimelineTarget, userId: string) => Promise<void>
  unfollow: (target: TimelineTarget, userId: string) => Promise<void>
  activities: (
    target: TimelineTarget,
    signal?: AbortSignal,
  ) => Promise<TimelineActivity[]>
  addActivity: (
    target: TimelineTarget,
    input: TimelineActivityInput & { requestId: string },
  ) => Promise<TimelineActivity>
  updateActivity: (
    target: TimelineTarget,
    activityId: string,
    patch: TimelineActivityPatch,
  ) => Promise<TimelineActivity>
}

const recordPath = ({ resource, id }: TimelineTarget, tail: string) =>
  `/${encodeURIComponent(resource)}/${encodeURIComponent(id)}/${tail}`

const READ = { timeoutMs: TIMELINE_READ_TIMEOUT_MS, background: true } as const
const WRITE = { timeoutMs: TIMELINE_WRITE_TIMEOUT_MS } as const

/**
 * Читання стрічки — фонові запити: відкрита картка, що опитує чи перечитує за подією, не продовжує
 * сесію (ADR-0014), а причину запиту `queryFn` не знає, тож фонові й дії людини. Запис — звичайні запити.
 */
export function createTimelineApi(client: ApiClient): TimelineApi {
  return {
    list: (target, filter, page, perPage, signal) =>
      client.get(recordPath(target, "timeline"), {
        ...READ,
        signal,
        query: {
          ...(filter === "all" ? {} : { kind: filter }),
          page: String(page),
          perPage: String(perPage),
        },
        schema: timelinePageSchema,
      }),
    post: (target, input) =>
      client.post(recordPath(target, "timeline"), input, {
        ...WRITE,
        schema: timelineEntrySchema,
      }),
    updateNote: (target, entryId, input) =>
      client.patch(
        recordPath(target, `timeline/${encodeURIComponent(entryId)}`),
        input,
        { ...WRITE, schema: timelineEntrySchema },
      ),
    async remove(target, entryId) {
      await client.delete(
        recordPath(target, `timeline/${encodeURIComponent(entryId)}`),
        WRITE,
      )
    },
    uploadFile(target, file, requestId) {
      const body = new FormData()
      // Ключ перед файлом: сервер, що читає форму потоком, відхилить дубль до тіла файла.
      body.set("requestId", requestId)
      body.set("file", file)
      return client.post(recordPath(target, "files"), body, {
        timeoutMs: timelineUploadTimeoutMs(file.size),
        schema: timelineEntrySchema,
      })
    },
    async followers(target, signal) {
      const { data } = await client.get(recordPath(target, "followers"), {
        ...READ,
        signal,
        schema: followersSchema,
      })
      return data
    },
    async follow(target, userId) {
      await client.put(
        recordPath(target, `followers/${encodeURIComponent(userId)}`),
        undefined,
        WRITE,
      )
    },
    async unfollow(target, userId) {
      await client.delete(
        recordPath(target, `followers/${encodeURIComponent(userId)}`),
        WRITE,
      )
    },
    async activities(target, signal) {
      const { data } = await client.get(recordPath(target, "activities"), {
        ...READ,
        signal,
        schema: activitiesSchema,
      })
      return data
    },
    addActivity: (target, input) =>
      client.post(recordPath(target, "activities"), input, {
        ...WRITE,
        schema: timelineActivitySchema,
      }),
    updateActivity: (target, activityId, patch) =>
      client.patch(
        recordPath(target, `activities/${encodeURIComponent(activityId)}`),
        patch,
        { ...WRITE, schema: timelineActivitySchema },
      ),
  }
}

/**
 * Ключі кешу починаються з ресурсу, як у ra-core: подія `<ресурс>.updated` і перечитування після обриву
 * оновлюють стрічку самі (`syncRealtimeCache`), нова зміна поля з'являється без своєї події.
 */
export const timelineQueryKey = ({ resource, id }: TimelineTarget) =>
  [resource, "timeline", id] as const
