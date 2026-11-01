/**
 * Мок каналу реального часу й блокувань (PF19, ADR-0051): `GET /events` віддає потік SSE із шини
 * мок-сервера, `…/:id/lock` — блокування на час редагування.
 *
 * - У потік іде лише ресурс, `id` і час: справжній сервер теж не шле даних запису.
 * - Шина живе в одній вкладці, тож демо в кількох вкладках не бачить змін сусідньої. Колегу, який
 *   змінює запис чи тримає його, показує `setMockEditLock` і звичайна зміна в `db` ресурсу.
 * - Сценарії — ресурс `realtime` (`REALTIME_SCENARIO_RESOURCE`).
 */
import { http, HttpResponse, type HttpHandler } from "msw/http"

import { API_PREFIX } from "@/registry/lib/api"
import {
  editLockEventType,
  type EditLockHolder,
  type EditLockState,
} from "@/registry/lib/edit-lock"
import { REALTIME_PATH, type RealtimeEvent } from "@/registry/lib/realtime"
import { scenarioFor } from "@/registry/lib/mock-scenarios"
import { inMockScope } from "@/registry/lib/mock-scope"
import {
  applyScenario,
  currentMockUser,
  emitMockEvent,
  json,
  mockCompanyOrForbidden,
  noContent,
  subscribeMockEvents,
  unauthenticated,
  type MockEvent,
} from "@/registry/lib/mock-server"

export const REALTIME_SCENARIO_RESOURCE = "realtime"
const HEARTBEAT_MS = 20_000
const LOCK_TTL_MS = 2 * 60_000

/* -------------------------------- Потік подій -------------------------------- */

/** Закрити потік цієї вкладки: у вкладці він один, а скасування з браузера доходить не завжди. */
let closeStream: (() => void) | null = null

/** Закрити потік, як обрив з'єднання: панель демо й тести перепідключення. */
export function dropMockRealtimeStream(): void {
  closeStream?.()
}

const encoder = new TextEncoder()

function toRealtimeEvent({ type, at, data }: MockEvent): RealtimeEvent {
  const dot = type.lastIndexOf(".")
  const id = data.id
  return {
    type,
    resource: dot === -1 ? type : type.slice(0, dot),
    at,
    ...(typeof id === "string" ? { id } : {}),
  }
}

/** Подія людини (сповіщення) — лише їй; решта — компанії запиту. */
const isVisibleTo = (
  { scope }: MockEvent,
  accountId: string,
  companyId: string | null,
) =>
  scope.accountId
    ? scope.accountId === accountId
    : inMockScope(scope, companyId)

function openStream(accountId: string, companyId: string | null): Response {
  closeStream?.()
  let sequence = 0
  let finish = () => undefined as void
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const stop = subscribeMockEvents((event) => {
        if (!isVisibleTo(event, accountId, companyId)) return
        sequence += 1
        controller.enqueue(
          encoder.encode(
            `id: ${String(sequence)}\ndata: ${JSON.stringify(toRealtimeEvent(event))}\n\n`,
          ),
        )
      })
      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(": ping\n\n"))
      }, HEARTBEAT_MS)
      finish = () => {
        stop()
        clearInterval(heartbeat)
        closeStream = null
        try {
          controller.close()
        } catch {
          // Браузер уже скасував потік.
        }
      }
      closeStream = finish
      controller.enqueue(encoder.encode(": connected\n\n"))
    },
    cancel() {
      finish()
    },
  })
  return new HttpResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
    },
  })
}

/* --------------------------------- Блокування --------------------------------- */

interface MockLock {
  holder: EditLockHolder
  expiresAt: number
}

const locks = new Map<string, MockLock>()

const lockKey = (companyId: string | null, resource: string, id: string) =>
  `${companyId ?? ""}/${resource}/${id}`

function currentLock(key: string): MockLock | null {
  const lock = locks.get(key)
  if (lock && lock.expiresAt <= Date.now()) {
    locks.delete(key)
    return null
  }
  return lock ?? null
}

const lockState = (lock: MockLock | null): EditLockState => ({
  holder: lock?.holder ?? null,
  expiresAt: lock ? new Date(lock.expiresAt).toISOString() : null,
})

/** Колега почав чи закінчив редагувати запис: подія й блокування, як від справжнього сервера. */
export function setMockEditLock(
  companyId: string | null,
  resource: string,
  id: string,
  holder: EditLockHolder | null,
): void {
  const key = lockKey(companyId, resource, id)
  if (holder) locks.set(key, { holder, expiresAt: Date.now() + LOCK_TTL_MS })
  else locks.delete(key)
  emitMockEvent(editLockEventType(resource), { id }, { companyId })
}

/** Хто тримає запис: для збирання стану демо й тестів. */
export const mockEditLockHolder = (
  companyId: string | null,
  resource: string,
  id: string,
): EditLockHolder | null =>
  currentLock(lockKey(companyId, resource, id))?.holder ?? null

export function clearMockEditLocks(): void {
  locks.clear()
}

/* --------------------------------- Обробники --------------------------------- */

const lockPath = "/:resource/:id/lock"

export function createRealtimeHandlers({
  baseUrl = API_PREFIX,
}: { baseUrl?: string } = {}): HttpHandler[] {
  /** Людина й компанія запиту або готова відмова. */
  const actor = async (request: Request) => {
    const early = await applyScenario(scenarioFor(REALTIME_SCENARIO_RESOURCE))
    if (early) return early
    const user = currentMockUser(request)
    if (!user) return unauthenticated()
    const companyId = mockCompanyOrForbidden(request, user)
    if (companyId instanceof Response) return companyId
    return { user, companyId }
  }

  return [
    http.get(`${baseUrl}${REALTIME_PATH}`, async ({ request }) => {
      const access = await actor(request)
      if (access instanceof Response) return access
      return openStream(access.user.id, access.companyId)
    }),
    http.get(`${baseUrl}${lockPath}`, async ({ request, params }) => {
      const access = await actor(request)
      if (access instanceof Response) return access
      const key = lockKey(
        access.companyId,
        String(params.resource),
        String(params.id),
      )
      return json(lockState(currentLock(key)))
    }),
    http.put(`${baseUrl}${lockPath}`, async ({ request, params }) => {
      const access = await actor(request)
      if (access instanceof Response) return access
      const { user, companyId } = access
      const resource = String(params.resource)
      const id = String(params.id)
      const key = lockKey(companyId, resource, id)
      const held = currentLock(key)
      if (held && held.holder.id !== user.id) return json(lockState(held))
      const lock: MockLock = {
        holder: { id: user.id, name: user.name },
        expiresAt: Date.now() + LOCK_TTL_MS,
      }
      locks.set(key, lock)
      if (!held)
        emitMockEvent(editLockEventType(resource), { id }, { companyId })
      return json(lockState(lock))
    }),
    http.delete(`${baseUrl}${lockPath}`, async ({ request, params }) => {
      const access = await actor(request)
      if (access instanceof Response) return access
      const { user, companyId } = access
      const resource = String(params.resource)
      const id = String(params.id)
      const key = lockKey(companyId, resource, id)
      if (currentLock(key)?.holder.id === user.id) {
        locks.delete(key)
        emitMockEvent(editLockEventType(resource), { id }, { companyId })
      }
      return noContent()
    }),
  ]
}
