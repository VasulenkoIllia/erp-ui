import { expect, test, type Page } from "@playwright/test"

import {
  chooseScenario,
  confirmWithPassword,
  expectNoA11yViolations,
  openWith,
  USERS,
} from "./helpers"

/**
 * Крок A2c3b (ADR-0041): «Вилучити з компанії» на картці людини й у шторці доступу. Людина лишається
 * в інших своїх компаніях, поточна компанія переходить на іншу; остання компанія лишає запис без
 * компаній.
 */
const USER_ID = "u-ivan"
const CARD = `/#/m/A2/users/${USER_ID}?tab=access`
const SHEET_LIST = "/#/settings/users"
const REMOVE = "Вилучити з компанії"
const TITLE = "Іван Петренко: вилучити з компанії ТОВ «Зоряна логістика»?"
const OTHER_COMPANY = { id: "kovalenko", name: "ФОП Коваленко О. В." }

const toast = (page: Page, text: RegExp | string) =>
  page.locator("[data-sonner-toast]").filter({ hasText: text }).last()
const removeButton = (page: Page) => page.getByRole("button", { name: REMOVE })
const confirmDialog = (page: Page) =>
  page.getByRole("alertdialog", { name: TITLE })
const noHorizontalScroll = (page: Page) =>
  page.evaluate(
    () =>
      document.documentElement.scrollWidth <=
      document.documentElement.clientWidth,
  )

/** Іван працює ще в другій компанії: там він власник, у першій — менеджер. */
const seedSecondCompany = (page: Page) =>
  page.addInitScript(
    ([id, company]) => {
      if (window !== window.top) return
      localStorage.setItem(
        "erp-ui:mock-joined-companies:v1",
        JSON.stringify({ [id]: [company] }),
      )
      localStorage.setItem(
        "erp-ui:mock-user-roles",
        JSON.stringify({ [id]: { zoriana: ["sales"], kovalenko: ["owner"] } }),
      )
    },
    [USER_ID, OTHER_COMPANY] as const,
  )

/** Іван сильніший за Олену в її ж компанії: вилучити його вона не може. */
const seedStrongerPerson = (page: Page) =>
  page.addInitScript(
    ([id]) => {
      if (window !== window.top) return
      localStorage.setItem(
        "erp-ui:mock-user-roles",
        JSON.stringify({ [id]: { zoriana: ["owner"] } }),
      )
    },
    [USER_ID] as const,
  )

/** Підтвердити вилучення в діалозі й ввести пароль. */
async function confirmRemoval(page: Page) {
  const dialog = confirmDialog(page)
  await expect(dialog).toBeVisible()
  await dialog.getByRole("button", { name: REMOVE }).click()
  await confirmWithPassword(page)
}

test.describe("вилучити з компанії: картка людини", () => {
  test("людина лише в цій компанії: скасувати, вилучити, повернутись до списку", async ({
    page,
  }) => {
    await openWith(page, {}, CARD)
    await removeButton(page).click()
    await expect(confirmDialog(page)).toContainText(
      "Обліковий запис і другий крок не зміняться",
    )
    await confirmDialog(page).getByRole("button", { name: "Скасувати" }).click()
    await expect(confirmDialog(page)).toBeHidden()
    await expect(removeButton(page)).toBeFocused()

    const missing: string[] = []
    page.on("response", (response) => {
      if (response.status() === 404) missing.push(response.url())
    })
    await removeButton(page).click()
    await confirmRemoval(page)
    await expect(
      toast(page, "Іван Петренко: вилучено з компанії"),
    ).toBeVisible()
    await expect(page).toHaveURL(/#\/m\/A2\/users$/)
    await expect(page.getByRole("heading", { level: 1 })).toBeFocused()
    await expect(page.getByText("ivan@zoriana.example")).toBeHidden()
    await expect(page.getByText("olena@zoriana.example").first()).toBeVisible()
    // Картка й доступ вилученої людини не перечитуються: інакше на мить видно б «не знайдено».
    expect(missing).toEqual([])

    await page.goto(CARD)
    await expect(page.getByRole("button", { name: REMOVE })).toBeHidden()
    await expect.poll(() => missing.length).toBeGreaterThan(0)
  })

  test("людина працює ще десь: решта дій неактивні, вилучення доступне", async ({
    page,
  }) => {
    await seedSecondCompany(page)
    await openWith(page, {}, CARD)
    await expect(
      page.getByRole("button", { name: "Заблокувати" }),
    ).toHaveAttribute("aria-disabled", "true")
    await expect(
      page.getByText(/Змінювати доступ цієї людини може лише той/).first(),
    ).toBeVisible()
    await expect(removeButton(page)).toBeEnabled()
    await removeButton(page).click()
    await confirmRemoval(page)
    await expect(
      toast(page, "Іван Петренко: вилучено з компанії"),
    ).toBeVisible()

    // Сама людина: збережена компанія вже недоступна, застосунок переходить на другу.
    await page.goto("about:blank")
    await openWith(page, {}, "/#/", { user: USER_ID })
    await expect(page.getByText(OTHER_COMPANY.name).first()).toBeVisible()
    expect(
      await page.evaluate(() => localStorage.getItem("erp-ui:company")),
    ).toBe(OTHER_COMPANY.id)
  })

  test("сильніша людина: кнопка неактивна з причиною, до запиту", async ({
    page,
  }) => {
    await seedStrongerPerson(page)
    await openWith(page, {}, CARD)
    const remove = removeButton(page)
    await expect(remove).toHaveAttribute("aria-disabled", "true")
    await expect(remove).toHaveAccessibleDescription(
      "Вилучити цю людину може лише той, хто працює в цій компанії й має всі її права тут.",
    )
    await expect(
      page.locator("p").filter({ hasText: "Вилучити цю людину може лише той" }),
    ).toBeVisible()
    await remove.focus()
    await expect(page.locator('[data-slot="tooltip-content"]')).toHaveText(
      "Вилучити цю людину може лише той, хто працює в цій компанії й має всі її права тут.",
    )
    await expectNoA11yViolations(page)
  })

  test("свою картку вилучити не можна: кнопки немає", async ({ page }) => {
    await openWith(page, {}, `/#/m/A2/users/${USERS.accountant}?tab=access`)
    await expect(
      page.getByText("Свій доступ", { exact: false }).first(),
    ).toBeVisible()
    await expect(removeButton(page)).toBeHidden()
  })

  test("без права users:update вкладки «Доступ» немає", async ({ page }) => {
    await openWith(page, {}, `/#/m/A2/users/${USER_ID}`, { user: USERS.lead })
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Іван Петренко",
    )
    await expect(removeButton(page)).toBeHidden()
  })

  test("збій сервера: діалог лишається, можна спробувати ще", async ({
    page,
  }) => {
    await openWith(page, {}, CARD)
    await expect(removeButton(page)).toBeEnabled()
    await chooseScenario(page, "Помилка сервера")
    await removeButton(page).click()
    await confirmDialog(page).getByRole("button", { name: REMOVE }).click()
    await expect(toast(page, /сервер/i)).toBeVisible()
    await expect(confirmDialog(page)).toBeVisible()
    await confirmDialog(page).getByRole("button", { name: "Скасувати" }).click()
    await expect(confirmDialog(page)).toBeHidden()
    await expect(page).toHaveURL(/#\/m\/A2\/users\/u-ivan/)
  })

  test("конфлікт: діалог закривається, людина лишається на місці", async ({
    page,
  }) => {
    await openWith(page, {}, CARD)
    await expect(removeButton(page)).toBeEnabled()
    await chooseScenario(page, "Конфлікт збереження")
    await removeButton(page).click()
    await confirmDialog(page).getByRole("button", { name: REMOVE }).click()
    await expect(confirmDialog(page)).toBeHidden()
    await expect(page).toHaveURL(/#\/m\/A2\/users\/u-ivan/)
    await expect(removeButton(page)).toBeEnabled()
  })
})

test.describe("вилучити з компанії: шторка доступу", () => {
  test("шторка закривається, людина зникає зі списку", async ({ page }) => {
    await openWith(page, {}, SHEET_LIST)
    const open = page.getByRole("button", { name: "Доступ: Іван Петренко" })
    await open.click()
    const sheet = page.getByRole("dialog", { name: "Доступ: Іван Петренко" })
    await sheet.getByRole("button", { name: REMOVE }).click()
    await confirmRemoval(page)
    await expect(sheet).toBeHidden()
    await expect(open).toBeHidden()
    // Кнопки, з якої відкрили шторку, уже немає: фокус не губиться на сторінці.
    await expect(
      page.getByRole("list", { name: "Користувачі компанії" }),
    ).toBeFocused()
    await expect(
      toast(page, "Іван Петренко: вилучено з компанії"),
    ).toBeVisible()
  })

  test("лічильник ролі й запити на відновлення оновлюються без перезавантаження", async ({
    page,
  }) => {
    await page.addInitScript(
      ([id]) => {
        if (window !== window.top) return
        localStorage.setItem(
          "erp-ui:mock-recovery-requests",
          JSON.stringify([
            {
              id: "rec-ivan",
              userId: id,
              userName: "Іван Петренко",
              email: "ivan@zoriana.example",
              requestedAt: "2026-10-30T08:00:00.000Z",
              comment: "Загубив телефон",
            },
          ]),
        )
      },
      [USER_ID] as const,
    )
    const role = page.getByRole("button", { name: /^Менеджер з продажу/ })
    const peopleInRole = async () =>
      Number.parseInt(/\d+/.exec(await role.innerText())?.[0] ?? "", 10)
    const openWithoutReload = (hash: string) =>
      page.evaluate((target) => {
        location.hash = target
      }, hash)

    await openWith(page, {}, "/#/m/A2/roles")
    await expect(role).toBeVisible()
    const before = await peopleInRole()

    await openWithoutReload("/settings/users")
    const requests = page.getByRole("list", {
      name: "Запити на відновлення доступу",
    })
    await expect(requests).toContainText("Іван Петренко")
    await page.getByRole("button", { name: "Доступ: Іван Петренко" }).click()
    await page.getByRole("button", { name: REMOVE }).click()
    await confirmRemoval(page)
    await expect(requests).toBeHidden()

    await openWithoutReload("/m/A2/roles")
    await expect.poll(peopleInRole).toBe(before - 1)
  })

  test("у журналі компанії лишається подія", async ({ page }) => {
    await openWith(page, {}, SHEET_LIST)
    await page.getByRole("button", { name: "Доступ: Іван Петренко" }).click()
    await page.getByRole("button", { name: REMOVE }).click()
    await confirmRemoval(page)
    await expect(
      toast(page, "Іван Петренко: вилучено з компанії"),
    ).toBeVisible()
    await page.goto("/#/settings/audit")
    await expect(page.getByText("Вилучення з компанії").first()).toBeVisible()
  })
})

test.describe("записи вилученої людини", () => {
  test("у колонці «Відповідальний» лишається ім'я, а не «Запис не знайдено»", async ({
    page,
  }) => {
    await page.addInitScript(
      ([id]) => {
        if (window !== window.top) return
        localStorage.setItem(
          "erp-ui:mock-left-companies:v1",
          JSON.stringify({ [id]: ["zoriana"] }),
        )
      },
      [USER_ID] as const,
    )
    await openWith(page, {}, "/#/m/B1/organizations")
    await expect(page.getByText("Іван Петренко").first()).toBeVisible()
    await expect(page.getByText("Запис не знайдено")).toHaveCount(0)
  })
})

test.describe("остання компанія людини", () => {
  test("запис лишається: людина входить і бачить, що доступу немає", async ({
    page,
  }) => {
    await openWith(page, {}, CARD)
    await removeButton(page).click()
    await confirmRemoval(page)
    await expect(
      toast(page, "Іван Петренко: вилучено з компанії"),
    ).toBeVisible()

    await page.goto("about:blank")
    await openWith(page, {}, "/#/m/A2/users", { user: USER_ID })
    await expect(page.getByText("Немає доступу").first()).toBeVisible()
    expect(
      await page.evaluate(() => localStorage.getItem("erp-ui:company")),
    ).toBeNull()
    await expectNoA11yViolations(page)
  })
})

test.describe("вилучити з компанії: адаптив, теми, доступність", () => {
  for (const width of [360, 768, 1440])
    for (const theme of ["light", "dark"] as const)
      test(`${String(width)} px, ${theme}: кнопка й діалог без горизонтального скролу`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 800 })
        await openWith(page, { theme }, CARD)
        await expect(removeButton(page)).toBeVisible()
        expect(await noHorizontalScroll(page)).toBe(true)
        await expectNoA11yViolations(page)

        await removeButton(page).click()
        await expect(confirmDialog(page)).toBeVisible()
        expect(await noHorizontalScroll(page)).toBe(true)
        await expectNoA11yViolations(page)
      })
})
