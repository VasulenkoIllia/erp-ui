import { setupServer } from "msw/node"
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest"

import { createApiClient } from "@/registry/lib/api"
import { createDataProvider } from "@/registry/lib/data-provider"
import { setCompanyId } from "@/registry/lib/company-scope"
import {
  clearMockEditLocks,
  createRealtimeHandlers,
  dropMockRealtimeStream,
  mockEditLockHolder,
  REALTIME_SCENARIO_RESOURCE,
  setMockEditLock,
} from "@/registry/lib/mock-realtime"
import { setScenario } from "@/registry/lib/mock-scenarios"
import {
  emitMockEvent,
  setMockUsers,
  signInMock,
  type MockUser,
} from "@/registry/lib/mock-server"
import { REALTIME_PATH } from "@/registry/lib/realtime"
import { createSseParser, readSseBody } from "@/registry/lib/sse"

const USER = {
  id: "u-1",
  name: "Олена",
  email: "olena@test.example",
  companies: [{ id: "a", name: "A" }],
  companyId: "a",
} as unknown as MockUser
const OTHER = { id: "u-2", name: "Марта" }

const server = setupServer(...createRealtimeHandlers())
const client = createApiClient()
const provider = createDataProvider(client)

beforeAll(() => {
  server.listen()
})

beforeEach(() => {
  setMockUsers([USER])
  signInMock(USER.id)
  setCompanyId("a")
  clearMockEditLocks()
})

afterEach(() => {
  dropMockRealtimeStream()
  setScenario("success", REALTIME_SCENARIO_RESOURCE)
  setCompanyId(null)
})

afterAll(() => {
  server.close()
})

/** Відкрити потік і збирати повідомлення. */
async function listen() {
  const controller = new AbortController()
  const response = await client.stream(REALTIME_PATH, {
    signal: controller.signal,
  })
  const messages: Record<string, unknown>[] = []
  const parser = createSseParser({
    onMessage: ({ data }) =>
      messages.push(JSON.parse(data) as Record<string, unknown>),
  })
  if (!response.body) throw new Error("no body")
  const reading = readSseBody(
    response.body,
    parser,
    () => undefined,
    controller.signal,
  )
  return { response, messages, reading }
}

const waitForMessages = async (messages: unknown[], count: number) => {
  for (let tries = 0; messages.length < count && tries < 50; tries += 1)
    await new Promise((resolve) => setTimeout(resolve, 10))
}

describe("GET /events", () => {
  it("потік SSE: лише ресурс, id і час, без даних запису", async () => {
    const { response, messages, reading } = await listen()
    expect(response.headers.get("content-type")).toContain("text/event-stream")
    emitMockEvent(
      "invoices.updated",
      { id: "inv-1", client: "Секрет" },
      { companyId: "a" },
    )
    await waitForMessages(messages, 1)
    expect(messages).toEqual([
      {
        type: "invoices.updated",
        resource: "invoices",
        id: "inv-1",
        at: expect.any(String) as string,
      },
    ])
    dropMockRealtimeStream()
    await reading
  })

  it("подія іншої компанії й чуже сповіщення не доходять", async () => {
    const { messages, reading } = await listen()
    emitMockEvent("invoices.updated", { id: "b-1" }, { companyId: "b" })
    emitMockEvent("notifications.created", { id: "n" }, { accountId: "u-9" })
    emitMockEvent("notifications.created", { id: "m" }, { accountId: USER.id })
    await waitForMessages(messages, 1)
    expect(messages.map(({ id }) => id)).toEqual(["m"])
    dropMockRealtimeStream()
    await reading
  })

  it("сценарії: forbidden — 403, без сесії — 401", async () => {
    const signal = new AbortController().signal
    setScenario("forbidden", REALTIME_SCENARIO_RESOURCE)
    await expect(
      client.stream(REALTIME_PATH, { signal }),
    ).rejects.toMatchObject({ status: 403 })
    setScenario("success", REALTIME_SCENARIO_RESOURCE)
    signInMock(null)
    await expect(
      client.stream(REALTIME_PATH, { signal }),
    ).rejects.toMatchObject({ status: 401 })
  })
})

describe("блокування", () => {
  it("взяв, бачу себе, відпустив", async () => {
    const taken = await provider.takeEditLock("contacts", "1")
    expect(taken.holder).toEqual({ id: USER.id, name: USER.name })
    expect(taken.expiresAt).toEqual(expect.any(String))
    await provider.releaseEditLock("contacts", "1")
    await expect(provider.getEditLock("contacts", "1")).resolves.toEqual({
      holder: null,
      expiresAt: null,
    })
  })

  it("запис уже тримає інша людина: 200 і вона в holder", async () => {
    setMockEditLock("a", "contacts", "1", OTHER)
    await expect(provider.takeEditLock("contacts", "1")).resolves.toMatchObject(
      { holder: OTHER },
    )
    expect(mockEditLockHolder("a", "contacts", "1")).toEqual(OTHER)
  })

  it("чуже блокування DELETE не знімає", async () => {
    setMockEditLock("a", "contacts", "1", OTHER)
    await provider.releaseEditLock("contacts", "1")
    expect(mockEditLockHolder("a", "contacts", "1")).toEqual(OTHER)
  })

  it("блокування іншої компанії не видно", async () => {
    setMockEditLock("b", "contacts", "1", OTHER)
    await expect(provider.getEditLock("contacts", "1")).resolves.toMatchObject({
      holder: null,
    })
  })

  it("зміна блокування йде подією в канал", async () => {
    const { messages, reading } = await listen()
    await provider.takeEditLock("contacts", "7")
    await waitForMessages(messages, 1)
    expect(messages[0]).toMatchObject({
      type: "contacts.locked",
      resource: "contacts",
      id: "7",
    })
    dropMockRealtimeStream()
    await reading
  })
})
