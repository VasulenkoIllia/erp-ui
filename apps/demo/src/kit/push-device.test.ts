import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ApiError } from "@/registry/lib/api"
import {
  devicePushState,
  disableDevicePush,
  enableDevicePush,
  forgetDevicePush,
  PUSH_SW_SCOPE,
  PUSH_SW_URL,
  sendDevicePushTest,
  syncDevicePush,
} from "@/registry/lib/push-device"
import type { PushApi } from "@/registry/lib/web-push"

/** Web push у браузері (ADR-0046): браузера з push у jsdom немає, тому підміняємо його API. */
const OWNER_KEY = "erp-ui:push-owner"
const ORIGIN = "http://localhost"
const ENDPOINT = "https://push.example/device-1"
const KEY = "AQID"
const KEY_BYTES = [1, 2, 3]
const OTHER_KEY = "BAUG"

function subscriptionOf(key: number[], endpoint = ENDPOINT) {
  return {
    endpoint,
    options: { applicationServerKey: new Uint8Array(key).buffer },
    toJSON: () => ({
      endpoint,
      expirationTime: null,
      keys: { p256dh: "p256dh-key", auth: "auth-key" },
    }),
    unsubscribe: vi.fn(() => {
      browser.subscription = null
      return Promise.resolve(true)
    }),
  }
}

const browser: {
  subscription: ReturnType<typeof subscriptionOf> | null
  scope: string
  permission: NotificationPermission
  answer: NotificationPermission
  shown: { close: () => void }[]
} = {
  subscription: null,
  scope: PUSH_SW_SCOPE,
  permission: "default",
  answer: "granted",
  shown: [],
}

const pushManager = {
  getSubscription: vi.fn(() => Promise.resolve(browser.subscription)),
  subscribe: vi.fn(
    ({ applicationServerKey }: { applicationServerKey: Uint8Array }) => {
      browser.subscription = subscriptionOf([...applicationServerKey])
      return Promise.resolve(browser.subscription)
    },
  ),
}
const registration = () => ({
  scope: `${ORIGIN}${browser.scope}`,
  active: {},
  pushManager,
  getNotifications: () => Promise.resolve(browser.shown),
})
const serviceWorker = {
  register: vi.fn(() => Promise.resolve(registration())),
  getRegistration: vi.fn(() => Promise.resolve(registration())),
}

function api(overrides: Partial<PushApi> = {}): PushApi {
  return {
    publicKey: vi.fn(() => Promise.resolve(KEY)),
    save: vi.fn(() => Promise.resolve()),
    remove: vi.fn(() => Promise.resolve()),
    sendTest: vi.fn(() => Promise.resolve()),
    ...overrides,
  }
}

beforeEach(() => {
  browser.subscription = null
  browser.scope = PUSH_SW_SCOPE
  browser.permission = "default"
  browser.answer = "granted"
  browser.shown = []
  localStorage.clear()
  vi.clearAllMocks()
  vi.stubGlobal("PushManager", class {})
  vi.stubGlobal("Notification", {
    get permission() {
      return browser.permission
    },
    requestPermission: vi.fn(() => {
      browser.permission = browser.answer
      return Promise.resolve(browser.answer)
    }),
  })
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: serviceWorker,
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  Reflect.deleteProperty(window, "PushManager")
  Reflect.deleteProperty(navigator, "serviceWorker")
})

describe("стан пристрою", () => {
  it("браузер без push", async () => {
    Reflect.deleteProperty(navigator, "serviceWorker")
    await expect(devicePushState()).resolves.toBe("unsupported")
  })

  it("заборона браузера важливіша за підписку", async () => {
    browser.permission = "denied"
    browser.subscription = subscriptionOf(KEY_BYTES)
    await expect(devicePushState()).resolves.toBe("denied")
  })

  it("широка реєстрація MSW чи PWA не вважається підпискою", async () => {
    browser.scope = "/"
    browser.subscription = subscriptionOf(KEY_BYTES)
    await expect(devicePushState()).resolves.toBe("off")
  })

  it("своя реєстрація з підпискою", async () => {
    browser.subscription = subscriptionOf(KEY_BYTES)
    await expect(devicePushState()).resolves.toBe("on")
  })
})

describe("увімкнення", () => {
  it("дозвіл, файл у своїй області, підписка з ключем сервера, збереження", async () => {
    const push = api()
    await expect(enableDevicePush(push, "u1")).resolves.toBe("on")
    expect(serviceWorker.register).toHaveBeenCalledWith(PUSH_SW_URL, {
      scope: PUSH_SW_SCOPE,
    })
    const options = pushManager.subscribe.mock.calls[0]?.[0]
    expect(options).toMatchObject({ userVisibleOnly: true })
    expect([...(options?.applicationServerKey ?? [])]).toEqual(KEY_BYTES)
    expect(push.save).toHaveBeenCalledWith({
      endpoint: ENDPOINT,
      expirationTime: null,
      keys: { p256dh: "p256dh-key", auth: "auth-key" },
    })
    expect(localStorage.getItem(OWNER_KEY)).toBe("u1")
  })

  it("адреси в хеші: фоновий файл знає, як відкрити посилання", async () => {
    location.hash = "#/m/N5/inbox"
    await enableDevicePush(api(), "u1")
    location.hash = ""
    expect(serviceWorker.register).toHaveBeenCalledWith(
      `${PUSH_SW_URL}?linkBase=${encodeURIComponent("/#")}`,
      { scope: PUSH_SW_SCOPE },
    )
  })

  it("чекає, поки файл стане активним: інакше браузер не дає підписатися", async () => {
    const listeners: (() => void)[] = []
    const worker = {
      state: "installing",
      addEventListener: (_: string, listener: () => void) => {
        listeners.push(listener)
      },
      removeEventListener: vi.fn(),
    }
    serviceWorker.register.mockResolvedValueOnce({
      ...registration(),
      active: null,
      installing: worker,
    } as never)
    const enabled = enableDevicePush(api(), "u1")
    await vi.waitFor(() => {
      expect(listeners).toHaveLength(1)
    })
    expect(pushManager.subscribe).not.toHaveBeenCalled()
    worker.state = "activated"
    listeners[0]?.()
    await expect(enabled).resolves.toBe("on")
    expect(worker.removeEventListener).toHaveBeenCalledOnce()
  })

  it("заборона: підписки немає й сервер нічого не отримує", async () => {
    browser.answer = "denied"
    const push = api()
    await expect(enableDevicePush(push, "u1")).resolves.toBe("denied")
    expect(serviceWorker.register).not.toHaveBeenCalled()
    expect(push.save).not.toHaveBeenCalled()
  })

  it("людина закрила запит дозволу: лишається вимкнено", async () => {
    browser.answer = "default"
    await expect(enableDevicePush(api(), "u1")).resolves.toBe("off")
  })

  it("сервер не прийняв підписку: браузер її скасовує, власника немає", async () => {
    const failure = new ApiError(500, { code: "server", message: "Boom" })
    const push = api({ save: vi.fn(() => Promise.reject(failure)) })
    await expect(enableDevicePush(push, "u1")).rejects.toBe(failure)
    expect(browser.subscription).toBeNull()
    expect(localStorage.getItem(OWNER_KEY)).toBeNull()
  })

  it("власник записаний до запиту: друга вкладка не скасує підписку як чужу", async () => {
    let ownerDuringSave: string | null = null
    const push = api({
      save: vi.fn(() => {
        ownerDuringSave = localStorage.getItem(OWNER_KEY)
        return Promise.resolve()
      }),
    })
    await enableDevicePush(push, "u1")
    expect(ownerDuringSave).toBe("u1")
  })

  it("сховище недоступне: без власника підписки не лишаємо", async () => {
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("Quota exceeded")
      })
    const push = api()
    await expect(enableDevicePush(push, "u1")).rejects.toThrow(
      "Push owner not saved",
    )
    setItem.mockRestore()
    expect(browser.subscription).toBeNull()
    expect(push.save).not.toHaveBeenCalled()
  })

  it("підписка з іншим ключем замінюється", async () => {
    const stale = subscriptionOf([9, 9])
    browser.subscription = stale
    await enableDevicePush(api(), "u1")
    expect(stale.unsubscribe).toHaveBeenCalledOnce()
    expect(pushManager.subscribe).toHaveBeenCalledOnce()
  })

  it("служба браузера мовчить: помилка за межею часу, а не вічний спінер", async () => {
    vi.useFakeTimers()
    pushManager.subscribe.mockReturnValueOnce(
      new Promise(() => undefined) as never,
    )
    const outcome = expect(enableDevicePush(api(), "u1")).rejects.toThrow(
      "Push service timeout",
    )
    await vi.advanceTimersByTimeAsync(15_000)
    await outcome
    vi.useRealTimers()
  })
})

describe("звірка під час запуску", () => {
  it("без підписки нічого не робить і не шле запитів", async () => {
    const push = api()
    await syncDevicePush(push, "u1")
    expect(push.publicKey).not.toHaveBeenCalled()
    expect(push.save).not.toHaveBeenCalled()
  })

  it("своя підписка: сервер отримує її знову", async () => {
    browser.permission = "granted"
    browser.subscription = subscriptionOf(KEY_BYTES)
    localStorage.setItem(OWNER_KEY, "u1")
    const push = api()
    await syncDevicePush(push, "u1")
    expect(push.save).toHaveBeenCalledOnce()
    expect(pushManager.subscribe).not.toHaveBeenCalled()
  })

  it("ключ сервера змінився: нова підписка", async () => {
    browser.permission = "granted"
    browser.subscription = subscriptionOf(KEY_BYTES)
    localStorage.setItem(OWNER_KEY, "u1")
    const push = api({ publicKey: vi.fn(() => Promise.resolve(OTHER_KEY)) })
    await syncDevicePush(push, "u1")
    expect(pushManager.subscribe).toHaveBeenCalledOnce()
    expect(push.save).toHaveBeenCalledOnce()
  })

  it("чужа підписка скасовується, а не переходить новій людині", async () => {
    browser.subscription = subscriptionOf(KEY_BYTES)
    localStorage.setItem(OWNER_KEY, "u1")
    const push = api()
    await syncDevicePush(push, "u2")
    expect(browser.subscription).toBeNull()
    expect(push.save).not.toHaveBeenCalled()
    expect(localStorage.getItem(OWNER_KEY)).toBeNull()
  })

  it("браузер зняв підписку сам: відновлює, бо людина її не вимикала", async () => {
    browser.permission = "granted"
    localStorage.setItem(OWNER_KEY, "u1")
    const push = api()
    await syncDevicePush(push, "u1")
    expect(pushManager.subscribe).toHaveBeenCalledOnce()
    expect(push.save).toHaveBeenCalledOnce()
  })

  it("дозвіл забрали: не відновлює", async () => {
    browser.permission = "denied"
    localStorage.setItem(OWNER_KEY, "u1")
    const push = api()
    await syncDevicePush(push, "u1")
    expect(pushManager.subscribe).not.toHaveBeenCalled()
    expect(push.publicKey).not.toHaveBeenCalled()
  })

  it("власник інший і підписки немає: новій людині нічого не вмикає", async () => {
    browser.permission = "granted"
    localStorage.setItem(OWNER_KEY, "u1")
    const push = api()
    await syncDevicePush(push, "u2")
    expect(pushManager.subscribe).not.toHaveBeenCalled()
  })

  it("чужа підписка: показані сповіщення теж зникають", async () => {
    browser.subscription = subscriptionOf(KEY_BYTES)
    const shown = { close: vi.fn() }
    browser.shown = [shown]
    localStorage.setItem(OWNER_KEY, "u1")
    await syncDevicePush(api(), "u2")
    expect(shown.close).toHaveBeenCalledOnce()
  })
})

describe("вимкнення й вихід", () => {
  it("вимкнення: браузер скасовує, сервер отримує адресу", async () => {
    browser.subscription = subscriptionOf(KEY_BYTES)
    localStorage.setItem(OWNER_KEY, "u1")
    const push = api()
    await disableDevicePush(push)
    expect(browser.subscription).toBeNull()
    expect(push.remove).toHaveBeenCalledWith(ENDPOINT)
    expect(localStorage.getItem(OWNER_KEY)).toBeNull()
  })

  it("сервер недоступний: вимкнено однаково, бо браузер уже не приймає push", async () => {
    browser.subscription = subscriptionOf(KEY_BYTES)
    const push = api({
      remove: vi.fn(() => Promise.reject(new Error("offline"))),
    })
    await expect(disableDevicePush(push)).resolves.toBeUndefined()
    expect(browser.subscription).toBeNull()
  })

  it("браузер відмовив скасувати: не вдаємо, що вимкнено", async () => {
    const stuck = subscriptionOf(KEY_BYTES)
    stuck.unsubscribe.mockResolvedValueOnce(false)
    browser.subscription = stuck
    localStorage.setItem(OWNER_KEY, "u1")
    const push = api()
    await expect(disableDevicePush(push)).rejects.toThrow(
      "Push unsubscribe failed",
    )
    expect(push.remove).not.toHaveBeenCalled()
    expect(localStorage.getItem(OWNER_KEY)).toBe("u1")
  })

  it("вихід скасовує підписку й закриває показане: наступна людина його не бачить", async () => {
    browser.subscription = subscriptionOf(KEY_BYTES)
    const shown = { close: vi.fn() }
    browser.shown = [shown]
    localStorage.setItem(OWNER_KEY, "u1")
    await forgetDevicePush()
    expect(browser.subscription).toBeNull()
    expect(shown.close).toHaveBeenCalledOnce()
    expect(localStorage.getItem(OWNER_KEY)).toBeNull()
  })

  it("перевірка без підписки: помилка, а не тиша", async () => {
    await expect(sendDevicePushTest(api())).rejects.toThrow()
  })

  it("перевірка йде на адресу цього пристрою", async () => {
    browser.subscription = subscriptionOf(KEY_BYTES)
    const push = api()
    await sendDevicePushTest(push)
    expect(push.sendTest).toHaveBeenCalledWith(ENDPOINT)
  })
})
