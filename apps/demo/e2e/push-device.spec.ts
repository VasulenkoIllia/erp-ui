import { expect, test, type Page } from "@playwright/test"

import { chooseScenario, expectNoA11yViolations, openWith } from "./helpers"

/**
 * Web push модуля N5 (ADR-0046). Фоновий файл і дозвіл справжні; служби браузера в тесті немає, тому
 * `PushManager` підмінений, а push доставляє протокол браузера. Підписка живе в `sessionStorage`: як і
 * справжня, переживає перезавантаження.
 */
// Спрощена збірка браузера без вікна завжди забороняє сповіщення, потрібна повна.
test.use({ channel: process.env.PW_CHROMIUM_PATH ? undefined : "chromium" })

const SETTINGS = "/#/m/N5/notification-settings"
const SCOPE = "/erp-ui-push/"
const ENDPOINT = "https://push.example/device-1"

const section = (page: Page) => page.locator('[data-slot="push-device"]')
const button = (page: Page, name: string) =>
  section(page).getByRole("button", { name })
const toast = (page: Page, text: string) =>
  page.locator("[data-sonner-toast]").filter({ hasText: text }).last()

async function fakePushService(page: Page) {
  await page.addInitScript((endpoint) => {
    const KEY = "e2e-push-subscription"
    const subscription = () => ({
      endpoint,
      options: { applicationServerKey: null },
      toJSON: () => ({
        endpoint,
        expirationTime: null,
        keys: { p256dh: "p256dh-key", auth: "auth-key" },
      }),
      unsubscribe: () => {
        sessionStorage.removeItem(KEY)
        return Promise.resolve(true)
      },
    })
    Object.assign(PushManager.prototype, {
      subscribe: () => {
        sessionStorage.setItem(KEY, "1")
        return Promise.resolve(subscription())
      },
      getSubscription: () =>
        Promise.resolve(sessionStorage.getItem(KEY) ? subscription() : null),
    })
  }, ENDPOINT)
}

/** Сповіщення, які справді показав браузер через реєстрацію фонового файла. */
const shownTitles = (page: Page) =>
  page.evaluate(async (scope) => {
    const registration = await navigator.serviceWorker.getRegistration(scope)
    const shown = await registration?.getNotifications()
    return shown?.map(({ title, body }) => ({ title, body })) ?? []
  }, SCOPE)

const isSubscribed = (page: Page) =>
  page.evaluate(() => sessionStorage.getItem("e2e-push-subscription") !== null)

/** Справжня подія `push` у фоновому файлі: те, що надсилає служба браузера. */
async function deliverPush(page: Page, payload: object) {
  const session = await page.context().newCDPSession(page)
  const registrationId = new Promise<string>((resolve) => {
    session.on(
      "ServiceWorker.workerRegistrationUpdated",
      ({ registrations }) => {
        const found = registrations.find(({ scopeURL }) =>
          scopeURL.endsWith(SCOPE),
        )
        if (found) resolve(found.registrationId)
      },
    )
  })
  await session.send("ServiceWorker.enable")
  await session.send("ServiceWorker.deliverPushMessage", {
    origin: new URL(page.url()).origin,
    registrationId: await registrationId,
    data: JSON.stringify(payload),
  })
}

test.describe("push на цьому пристрої", () => {
  test("дозвіл лише з натискання: увімкнути, перевірити, вимкнути", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["notifications"])
    await fakePushService(page)
    await openWith(page, {}, SETTINGS)
    const saved = page.waitForRequest(
      (request) =>
        request.url().endsWith("/me/push/subscriptions") &&
        request.method() === "POST",
    )
    await button(page, "Увімкнути на цьому пристрої").click()
    expect((await saved).postDataJSON()).toEqual({
      endpoint: ENDPOINT,
      expirationTime: null,
      keys: { p256dh: "p256dh-key", auth: "auth-key" },
    })
    await expect(section(page)).toContainText("Увімкнено")
    // Кнопка міняє підпис, а не зникає: клавіатурник не повертається на початок сторінки.
    await expect(button(page, "Вимкнути на цьому пристрої")).toBeFocused()
    await expectNoA11yViolations(page)

    await button(page, "Надіслати перевірку").click()
    await expect(toast(page, "Перевірку надіслано")).toBeVisible()
    await expect
      .poll(() => shownTitles(page))
      .toEqual([
        {
          title: "Перевірка сповіщень",
          body: "Push на цьому пристрої працює.",
        },
      ])

    await button(page, "Вимкнути на цьому пристрої").click()
    await expect(button(page, "Увімкнути на цьому пристрої")).toBeFocused()
    expect(await isSubscribed(page)).toBe(false)
    await expect.poll(() => shownTitles(page)).toEqual([])
  })

  test("запуск застосунку знову надсилає підписку на сервер", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["notifications"])
    await fakePushService(page)
    await openWith(page, {}, SETTINGS)
    await button(page, "Увімкнути на цьому пристрої").click()
    await expect(section(page)).toContainText("Увімкнено")
    const saved = page.waitForRequest((request) =>
      request.url().endsWith("/me/push/subscriptions"),
    )
    await page.reload()
    await saved
    await expect(section(page)).toContainText("Увімкнено")
  })

  test("справжній push: одне сповіщення, лічильник оновлюється одразу", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["notifications"])
    await fakePushService(page)
    await openWith(page, {}, SETTINGS)
    await button(page, "Увімкнути на цьому пристрої").click()
    await expect(section(page)).toContainText("Увімкнено")

    const counted = page.waitForRequest(/\/notifications\/unread-count$/)
    const payload = { id: "n1", title: "Рахунок оплачено", body: "7 250,00 ₴" }
    await deliverPush(page, payload)
    await counted
    await deliverPush(page, payload)
    await expect
      .poll(() => shownTitles(page))
      .toEqual([{ title: "Рахунок оплачено", body: "7 250,00 ₴" }])
  })

  test("вихід скасовує підписку на цьому пристрої", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["notifications"])
    await fakePushService(page)
    await openWith(page, {}, SETTINGS)
    await button(page, "Увімкнути на цьому пристрої").click()
    await expect(section(page)).toContainText("Увімкнено")
    await page.getByRole("button", { name: /Меню користувача/ }).click()
    await page.getByRole("menuitem", { name: "Вийти" }).click()
    await expect(page).toHaveURL(/#\/login/)
    await expect.poll(() => isSubscribed(page)).toBe(false)
  })

  test("сервер не прийняв підписку: помилка поруч, push вимкнено", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["notifications"])
    await fakePushService(page)
    await openWith(page, {}, SETTINGS)
    await chooseScenario(page, "Конфлікт збереження")
    await button(page, "Увімкнути на цьому пристрої").click()
    await expect(section(page).getByRole("alert")).toBeVisible()
    await expect(button(page, "Увімкнути на цьому пристрої")).toBeEnabled()
    expect(await isSubscribed(page)).toBe(false)
  })

  test("браузер заборонив: пояснення, кнопки немає", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(Notification, "permission", { value: "denied" })
    })
    await openWith(page, {}, SETTINGS)
    await expect(section(page)).toContainText("Браузер заблокував сповіщення")
    await expect(section(page).getByRole("button")).toHaveCount(0)
  })

  test("браузер без push, як Safari на iPhone: пояснення про головний екран", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Reflect.deleteProperty(window, "PushManager")
    })
    await openWith(page, {}, SETTINGS)
    await expect(section(page)).toContainText(
      "На iPhone і iPad вони працюють лише в застосунку",
    )
    await expect(section(page).getByRole("button")).toHaveCount(0)
    await expectNoA11yViolations(page)
  })
})
