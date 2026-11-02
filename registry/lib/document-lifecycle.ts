/**
 * Життєвий цикл документа (PF03, ADR-0057): модель ERPNext — чернетка, проведений, скасований;
 * проведений документ не змінюють, а скасовують чи сторнують.
 *
 * Контракт (під `/api/v1`):
 * - `docStatus` запису: `draft` → `submitted` → `cancelled`. Веде сервер, з тіла запиту не бере.
 *   Змінювати й видаляти можна лише чернетку: проведений і скасований документ сервер мітить
 *   `deniedActions: { update, delete }` з кодом `submitted` чи `cancelled` (ADR-0037).
 * - Дія над записом — `POST /<ресурс>/:id/<дія>` з `{ version, reason? }`. Які дії з якого статусу
 *   можна, каже граф переходів модуля (`StatusTransition`, lib/statuses); ключі нижче мають свій зміст:
 *   - `submit` — провести чернетку; `cancel` — скасувати проведений;
 *   - `amend` — виправити скасований: нова чернетка-копія з `amendedFrom`, у першого — `amendedBy`;
 *   - `reverse` — сторнувати проведений: новий проведений документ-сторно з `reversalOf`, а перший
 *     лишається проведеним із `reversedBy` і статусом `to` переходу (рішення власника 02.11.2026);
 *   - решта — переходи модуля між статусами; `docStatus` вони не змінюють.
 *   Дія кіта можлива лише зі свого стану (`DOCUMENT_STATE_BEFORE`), хоч би що дозволяв граф: розширення
 *   не проведе скасований документ і не скасує чернетку.
 *   Відповідь: 201 і новий документ для `amend` і `reverse`, інакше 200 і запис після дії.
 * - Порядок перевірок сервера: право `<ресурс>:<дія>` (403), запис (404), позначка запису (403 з
 *   `current` — запис із причиною, щоб інтерфейс показав її на кнопці), тіло (422), версія (409
 *   `conflict` з `current`), дія з поточного статусу й стану (422 `transition_not_allowed` з `current`),
 *   причина (422 `fieldErrors.reason: "required"`). Причину сервер пише в історію запису.
 */
import { z } from "zod"

export const DOCUMENT_STATES = ["draft", "submitted", "cancelled"] as const
export type DocumentState = (typeof DOCUMENT_STATES)[number]

/** Дії, які сервер виконує за змістом життєвого циклу; решта — переходи модуля. */
export const DOCUMENT_ACTIONS = [
  "submit",
  "cancel",
  "amend",
  "reverse",
] as const
export type DocumentAction = (typeof DOCUMENT_ACTIONS)[number]

export const isDocumentAction = (action: string): action is DocumentAction =>
  (DOCUMENT_ACTIONS as readonly string[]).includes(action)

/** Стан документа після дії; дія, якої тут немає, стану не змінює. */
export const DOCUMENT_STATE_AFTER: Readonly<
  Partial<Record<DocumentAction, DocumentState>>
> = { submit: "submitted", cancel: "cancelled" }

/** Стан документа, з якого дія кіта можлива: граф модуля й розширення його не обходять. */
export const DOCUMENT_STATE_BEFORE: Readonly<
  Record<DocumentAction, DocumentState>
> = {
  submit: "draft",
  cancel: "submitted",
  amend: "cancelled",
  reverse: "submitted",
}

/**
 * Чи дозволяє життєвий цикл дію: дія модуля — завжди, дія кіта — зі свого стану. Запис без `docStatus`
 * (не документ) — за графом.
 */
export const lifecycleAllows = (action: string, docStatus?: string): boolean =>
  !isDocumentAction(action) ||
  docStatus === undefined ||
  DOCUMENT_STATE_BEFORE[action] === docStatus

/** Дія створює інший документ: відповідь 201 — він. */
export const createsDocument = (action: string): boolean =>
  action === "amend" || action === "reverse"

/**
 * Скільки чекати на відповідь дії: сервер, що прийняв запит і мовчить, інакше тримав би панель і діалог
 * зайнятими без виходу. Повтор безпечний: версія вже інша, і сервер відповість 409.
 */
export const TRANSITION_TIMEOUT_MS = 30_000

/** Причина дії: довший текст — у нотатку стрічки запису, а не сюди. */
export const TRANSITION_REASON_MAX_LENGTH = 500

/** Поля життєвого циклу в записі документа: модуль додає їх до своєї схеми (`.extend`). */
export const documentLifecycleSchema = z.object({
  docStatus: z.enum(DOCUMENT_STATES),
  /** Скасований документ, з якого зроблено цю виправлену копію. */
  amendedFrom: z.string().nullable().optional(),
  /** Виправлена копія цього скасованого документа. */
  amendedBy: z.string().nullable().optional(),
  /** Проведений документ, який гасить це сторно. */
  reversalOf: z.string().nullable().optional(),
  /** Сторно цього проведеного документа. */
  reversedBy: z.string().nullable().optional(),
})
export type DocumentLifecycle = z.infer<typeof documentLifecycleSchema>

/** Тіло `POST /<ресурс>/:id/<дія>`: версія, яку бачила людина, і причина, якщо дія її питає. */
export const transitionBodySchema = z.object({
  version: z.number().int().min(1),
  reason: z
    .string()
    .trim()
    .min(1, { error: "required" })
    .max(TRANSITION_REASON_MAX_LENGTH, { error: "too_long" })
    .optional(),
})
export type TransitionBody = z.infer<typeof transitionBodySchema>
