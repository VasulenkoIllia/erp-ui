import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  PUSH_OPEN_MESSAGE,
  PUSH_RECEIVED_MESSAGE,
} from "@/registry/lib/push-device"
import source from "@/registry/public/erp-ui-push-sw.js?raw"

import demoCopy from "../../public/erp-ui-push-sw.js?raw"

/** Фоновий файл web push (ADR-0046): виконуємо його код із підміненим середовищем браузера. */
/** Шлях змінною: у файла немає типів, а TypeScript перевіряє лише сталі шляхи імпорту. */
const WORKER_MODULE = "@/registry/public/erp-ui-push-sw.js"
const HOST = "erp.example"

type Listener = (event: never) => void

function windowClient(focused = false) {
  return {
    focused,
    focus: vi.fn(() => Promise.resolve()),
    postMessage: vi.fn(),
  }
}

async function loadWorker(
  windows: ReturnType<typeof windowClient>[],
  query = "",
) {
  const listeners = new Map<string, Listener>()
  const showNotification = vi.fn(() => Promise.resolve())
  const openWindow = vi.fn(() => Promise.resolve(null))
  const self = {
    location: new URL(`https://${HOST}/erp-ui-push-sw.js${query}`),
    addEventListener: (type: string, listener: Listener) => {
      listeners.set(type, listener)
    },
    registration: { showNotification },
    clients: {
      matchAll: vi.fn(() => Promise.resolve(windows)),
      openWindow,
    },
    skipWaiting: vi.fn(() => Promise.resolve()),
  }
  // Файл без експортів виконується під час імпорту й реєструє обробники на `self`.
  vi.stubGlobal("self", self)
  vi.resetModules()
  await import(/* @vite-ignore */ WORKER_MODULE)
  const dispatch = async (type: string, event: object) => {
    let work: Promise<unknown> = Promise.resolve()
    listeners.get(type)?.({
      ...event,
      waitUntil: (promise: Promise<unknown>) => {
        work = promise
      },
    } as never)
    await work
  }
  return { dispatch, showNotification, openWindow, self }
}

const pushEvent = (payload: unknown) => ({
  data: { json: () => payload },
})
const clickEvent = (data: unknown) => ({
  notification: { data, close: vi.fn() },
})

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("фоновий файл web push", () => {
  it("копія в демо збігається з файлом реєстру", () => {
    expect(demoCopy).toBe(source)
  })

  it("назви повідомлень збігаються з браузерною частиною", () => {
    expect(source).toContain(`"${PUSH_RECEIVED_MESSAGE}"`)
    expect(source).toContain(`"${PUSH_OPEN_MESSAGE}"`)
  })

  it("push показує сповіщення, той самий id не дублюється, вкладки оновлюють лічильник", async () => {
    const open = windowClient()
    const worker = await loadWorker([open])
    await worker.dispatch(
      "push",
      pushEvent({ id: "n1", title: "Рахунок", body: "Текст", link: "/inv/1" }),
    )
    expect(worker.showNotification).toHaveBeenCalledWith("Рахунок", {
      body: "Текст",
      icon: undefined,
      tag: "n1",
      data: { id: "n1", link: "/inv/1" },
    })
    expect(open.postMessage).toHaveBeenCalledWith({
      type: PUSH_RECEIVED_MESSAGE,
    })
  })

  it("показує й тоді, коли застосунок у фокусі: Safari скасовує підписку за порожній push", async () => {
    const worker = await loadWorker([windowClient(true)])
    await worker.dispatch("push", pushEvent({ id: "n1", title: "Рахунок" }))
    expect(worker.showNotification).toHaveBeenCalledOnce()
  })

  it("зламаний push: однаково щось показує, бо браузер цього вимагає", async () => {
    const worker = await loadWorker([])
    await worker.dispatch("push", {
      data: {
        json: () => {
          throw new SyntaxError("bad json")
        },
      },
    })
    expect(worker.showNotification).toHaveBeenCalledWith(
      HOST,
      expect.objectContaining({ data: { id: undefined, link: null } }),
    )
  })

  it("значення не того типу не показуються словом «null»", async () => {
    const worker = await loadWorker([])
    await worker.dispatch("push", pushEvent({ title: null, body: null }))
    expect(worker.showNotification).toHaveBeenCalledWith(
      HOST,
      expect.objectContaining({ body: undefined, tag: undefined }),
    )
  })

  it("значок лише зі свого сайту", async () => {
    const worker = await loadWorker([])
    await worker.dispatch(
      "push",
      pushEvent({ title: "A", icon: "https://evil.example/a.png" }),
    )
    await worker.dispatch("push", pushEvent({ title: "B", icon: "/icon.png" }))
    const icons = worker.showNotification.mock.calls.map(
      (call: unknown[]) => (call[1] as { icon?: string }).icon,
    )
    expect(icons).toEqual([undefined, "/icon.png"])
  })

  it("показ не вдався: вкладки однаково оновлюють лічильник", async () => {
    const open = windowClient()
    const worker = await loadWorker([open])
    worker.showNotification.mockRejectedValueOnce(new Error("Quota"))
    await expect(
      worker.dispatch("push", pushEvent({ id: "n1", title: "A" })),
    ).rejects.toThrow("Quota")
    expect(open.postMessage).toHaveBeenCalledOnce()
  })

  it.each([
    "https://evil.example/x",
    "//evil.example/x",
    "/\\evil.example",
    "/\t/evil.example",
    "/\n/evil.example",
    "/\r/evil.example",
    "/.//evil.example",
  ])("чуже посилання %j не проходить", async (link) => {
    const worker = await loadWorker([])
    await worker.dispatch("push", pushEvent({ id: "n1", title: "A", link }))
    expect(worker.showNotification).toHaveBeenCalledWith(
      "A",
      expect.objectContaining({ data: { id: "n1", link: null } }),
    )
  })

  it("клік: вкладка у фокусі переходить сама, нового вікна немає", async () => {
    const background = windowClient()
    const active = windowClient(true)
    const worker = await loadWorker([background, active])
    const event = clickEvent({ id: "n1", link: "/inv/1" })
    await worker.dispatch("notificationclick", event)
    expect(event.notification.close).toHaveBeenCalledOnce()
    expect(active.focus).toHaveBeenCalledOnce()
    expect(active.postMessage).toHaveBeenCalledWith({
      type: PUSH_OPEN_MESSAGE,
      id: "n1",
      link: "/inv/1",
    })
    expect(background.postMessage).not.toHaveBeenCalled()
    expect(worker.openWindow).not.toHaveBeenCalled()
  })

  it("браузер не дав фокус: вкладка однаково переходить", async () => {
    const active = windowClient(true)
    active.focus.mockRejectedValueOnce(new Error("Not allowed"))
    const worker = await loadWorker([active])
    await worker.dispatch("notificationclick", clickEvent({ link: "/inv/1" }))
    expect(active.postMessage).toHaveBeenCalledOnce()
  })

  it("клік без відкритих вкладок: нове вікно на посиланні", async () => {
    const worker = await loadWorker([])
    await worker.dispatch("notificationclick", clickEvent({ link: "/inv/1" }))
    expect(worker.openWindow).toHaveBeenCalledWith("/inv/1")
  })

  it("клік без посилання: головна застосунку", async () => {
    const worker = await loadWorker([])
    await worker.dispatch("notificationclick", clickEvent({ link: null }))
    expect(worker.openWindow).toHaveBeenCalledWith("/")
  })

  it("адреси в хеші: посилання з початком із реєстрації", async () => {
    const worker = await loadWorker([], `?linkBase=${encodeURIComponent("/#")}`)
    await worker.dispatch("notificationclick", clickEvent({ link: "/inv/1" }))
    expect(worker.openWindow).toHaveBeenCalledWith("/#/inv/1")
  })

  it("параметр реєстрації не веде назовні", async () => {
    const worker = await loadWorker(
      [],
      `?linkBase=${encodeURIComponent("https://evil.example")}`,
    )
    await worker.dispatch("notificationclick", clickEvent({ link: "/inv/1" }))
    expect(worker.openWindow).toHaveBeenCalledWith("/inv/1")
  })

  it("браузер оновив підписку: підписатися з тими самими параметрами", async () => {
    const subscribe = vi.fn(() => Promise.resolve())
    const worker = await loadWorker([])
    Object.assign(worker.self.registration, { pushManager: { subscribe } })
    const options = { userVisibleOnly: true }
    await worker.dispatch("pushsubscriptionchange", {
      oldSubscription: { options },
    })
    expect(subscribe).toHaveBeenCalledWith(options)
  })
})
