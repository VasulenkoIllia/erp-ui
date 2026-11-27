import { expect, test, type Locator, type Page } from "@playwright/test"

import {
  expectNoA11yViolations,
  expectNoHorizontalScroll,
  openWith,
} from "./helpers"

/**
 * Фото (частина UI11, ADR-0101): те, чого модульні тести не бачать — справжні файли, декодування,
 * canvas і JPEG, вставка з буфера, обрізання мишею й двома кутами, запасні джерела фото, сітка на
 * вузькому екрані, axe.
 */
const PAGE = "/#/photos"

interface PngOptions {
  width: number
  height: number
  /** Без тла: прозоре має лягти на біле. */
  transparent?: boolean
  color?: string
}

/** PNG, намальований у браузері: справжній файл для поля вибору й буфера обміну. */
async function pngOf(page: Page, options: PngOptions): Promise<Buffer> {
  const base64 = await page.evaluate(
    ({ width, height, transparent, color }) => {
      const canvas = document.createElement("canvas")
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext("2d")
      if (!context) throw new Error("no canvas")
      if (!transparent) {
        context.fillStyle = color ?? "deepskyblue"
        context.fillRect(0, 0, width, height)
      }
      context.fillStyle = "crimson"
      context.fillRect(width / 4, height / 4, width / 2, height / 2)
      return canvas
        .toDataURL("image/png")
        .slice("data:image/png;base64,".length)
    },
    options,
  )
  return Buffer.from(base64, "base64")
}

/** Перше поле сторінки; друге — недоступне. */
const field = (page: Page) => page.locator('[data-slot="photo-input"]').first()
const thumbs = (page: Page) =>
  page
    .getByRole("list", { name: "Вибрані фото" })
    .getByRole("button", { name: /^Фото \d з \d/ })
const cropArea = (page: Page) =>
  field(page).getByRole("application", { name: /^Обрізання фото/ })

async function choose(page: Page, files: { name: string; buffer: Buffer }[]) {
  await field(page)
    .getByTestId("photo-input-file")
    .setInputFiles(files.map((file) => ({ ...file, mimeType: "image/png" })))
}

/** Вставка з буфера, як Ctrl+V: подія paste з файлом на цілі. */
async function paste(
  target: Locator,
  name: string,
  buffer: Buffer,
  text?: string,
) {
  await target.evaluate(
    (element, { name, bytes, text }) => {
      const data = new DataTransfer()
      if (text) data.setData("text/plain", text)
      data.items.add(
        new File([new Uint8Array(bytes)], name, { type: "image/png" }),
      )
      element.dispatchEvent(
        new ClipboardEvent("paste", {
          clipboardData: data,
          bubbles: true,
          cancelable: true,
        }),
      )
    },
    { name, bytes: [...buffer], text },
  )
}

test.describe("поле фото", () => {
  test("кілька файлів, обрізання мишею, двома кутами й з клавіатури", async ({
    page,
  }) => {
    // Фото 800 × 600 на 1440 займає 432 px: усе має бути у вікні, бо миша клікає за координатами.
    await page.setViewportSize({ width: 1440, height: 1100 })
    await openWith(page, {}, PAGE)
    await choose(page, [
      {
        name: "front.png",
        buffer: await pngOf(page, { width: 1600, height: 1200 }),
      },
      {
        name: "side.png",
        buffer: await pngOf(page, {
          width: 800,
          height: 600,
          color: "seagreen",
        }),
      },
    ])
    await expect(thumbs(page)).toHaveCount(2)
    await expect(field(page).getByTestId("photo-output")).toHaveText(
      "На виході 800 × 600 px",
    )
    const area = cropArea(page)
    await area.scrollIntoViewIfNeeded()
    const box = await area.boundingBox()
    if (!box) throw new Error("no crop area")
    await page.mouse.move(box.x + box.width * 0.1, box.y + box.height * 0.1)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5, {
      steps: 5,
    })
    await page.mouse.up()
    await expect(
      page.getByRole("button", { name: "Фото 2 з 2: side.png обрізано" }),
    ).toBeVisible()
    await expect(field(page).getByTestId("photo-output")).toHaveText(
      /^На виході (39\d|40\d) × (23\d|24\d) px$/,
    )
    // Без перетягування: два кути по черзі.
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5)
    await expect(field(page).getByTestId("photo-crop-status")).toHaveText(
      "Перший кут вибрано, торкніться другого",
    )
    await page.mouse.click(box.x + box.width * 0.9, box.y + box.height * 0.9)
    await expect(field(page).getByTestId("photo-output")).toHaveText(
      /^На виході (31\d|32\d) × (23\d|24\d) px$/,
    )
    await field(page).getByRole("button", { name: "Усе фото" }).click()
    await expect(field(page).getByTestId("photo-output")).toHaveText(
      "На виході 800 × 600 px",
    )
    // Клавіатура: перша стрілка — рамка на 80 %, Shift зі стрілкою — розмір, Delete — усе фото.
    await area.focus()
    await page.keyboard.press("ArrowDown")
    await expect(field(page).getByTestId("photo-output")).toHaveText(
      "На виході 640 × 480 px",
    )
    await page.keyboard.press("Shift+ArrowLeft")
    await expect(field(page).getByTestId("photo-output")).toHaveText(
      "На виході 624 × 480 px",
    )
    await page.keyboard.press("Delete")
    await expect(field(page).getByTestId("photo-output")).toHaveText(
      "На виході 800 × 600 px",
    )
  })

  test("вставка скриншота будь-де, але не тексту в полі; повтор і SVG відхиляються", async ({
    page,
  }) => {
    await openWith(page, {}, PAGE)
    const shot = await pngOf(page, { width: 1200, height: 900 })
    await paste(page.locator("body"), "image.png", shot)
    await expect(thumbs(page)).toHaveCount(1)
    await expect(page.locator("#erp-ui-announcer")).toHaveText(
      "Додано фото «image.png»",
    )
    // Той самий скриншот ще раз — відхилено, хоч назва та сама й час інший.
    await paste(page.locator("body"), "image.png", shot)
    await expect(field(page).getByRole("alert")).toHaveText(
      "«image.png» уже додано.",
    )
    // Текст із таблиці, що несе й картинку, іде в поле вводу.
    const query = page.getByRole("textbox", { name: "Що шукаємо" })
    await paste(
      query,
      "table.png",
      await pngOf(page, { width: 300, height: 200 }),
      "SKU-1",
    )
    await expect(thumbs(page)).toHaveCount(1)
    await field(page)
      .getByTestId("photo-input-file")
      .setInputFiles({
        name: "logo.svg",
        mimeType: "image/svg+xml",
        buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
      })
    await expect(field(page).getByRole("alert")).toHaveText(
      "«logo.svg» не фото JPEG, PNG чи WebP.",
    )
  })

  test("«Шукати» дочікується фото й отримує JPEG до 1024 px, прозоре на білому", async ({
    page,
  }) => {
    await openWith(page, {}, PAGE)
    await choose(page, [
      {
        name: "clear.png",
        buffer: await pngOf(page, {
          width: 600,
          height: 900,
          transparent: true,
        }),
      },
    ])
    await expect(thumbs(page)).toHaveCount(1)
    const big = await pngOf(page, { width: 4000, height: 3000 })
    await paste(page.locator("body"), "big.png", big)
    await page.getByRole("button", { name: "Шукати" }).click()
    const sent = page.getByTestId("photo-sent")
    await expect(sent).toHaveCount(2)
    await expect(sent.nth(0)).toHaveText(/^Фото 1: 600 × 900 px, /)
    await expect(sent.nth(1)).toHaveText(/^Фото 2: 1024 × 768 px, /)
    const corner = await page
      .getByRole("img", { name: "Фото 1, як його отримав би сервер" })
      .evaluate(async (image: HTMLImageElement) => {
        await image.decode()
        const blob = await fetch(image.src).then((response) => response.blob())
        const canvas = document.createElement("canvas")
        canvas.width = image.naturalWidth
        canvas.height = image.naturalHeight
        const context = canvas.getContext("2d")
        context?.drawImage(image, 0, 0)
        return {
          type: blob.type,
          pixel: [...(context?.getImageData(2, 2, 1, 1).data ?? [])],
        }
      })
    expect(corner.type).toBe("image/jpeg")
    expect(corner.pixel.slice(0, 3).every((value) => value > 250)).toBe(true)
  })

  test("подвійний клік прибирає одне фото; фокус після «Прибрати» — на сусідньому", async ({
    page,
  }) => {
    await openWith(page, {}, PAGE)
    await choose(page, [
      {
        name: "a.png",
        buffer: await pngOf(page, {
          width: 400,
          height: 300,
          color: "orange",
        }),
      },
      {
        name: "b.png",
        buffer: await pngOf(page, {
          width: 400,
          height: 300,
          color: "seagreen",
        }),
      },
      {
        name: "c.png",
        buffer: await pngOf(page, {
          width: 400,
          height: 300,
          color: "slateblue",
        }),
      },
    ])
    await expect(thumbs(page)).toHaveCount(3)
    // Другий клік подвійного падає на «Прибрати» фото, що стало на це місце, і його не чіпає.
    await page
      .getByRole("button", { name: "Прибрати фото 1: a.png" })
      .dblclick()
    await expect(thumbs(page)).toHaveCount(2)
    await page.getByRole("button", { name: "Прибрати фото 2: c.png" }).click()
    await expect(
      page.getByRole("button", { name: "Фото 1 з 1: b.png" }),
    ).toBeFocused()
    await page
      .getByRole("button", { name: "Прибрати фото", exact: true })
      .click()
    await expect(thumbs(page)).toHaveCount(0)
    await expect(
      field(page).getByRole("button", { name: "Вибрати фото" }),
    ).toBeFocused()
  })
})

test.describe("порядок фото", () => {
  test("перетягування мініатюри й «Раніше» / «Пізніше»; перше — головне", async ({
    page,
  }) => {
    await openWith(page, {}, PAGE)
    const files = []
    for (const [name, color] of [
      ["a.png", "orange"],
      ["b.png", "seagreen"],
      ["c.png", "slateblue"],
    ] as const)
      files.push({
        name,
        buffer: await pngOf(page, { width: 400, height: 300, color }),
      })
    await choose(page, files)
    await expect(thumbs(page)).toHaveCount(3)
    const order = () =>
      thumbs(page).evaluateAll((items) =>
        items.map((item) => /\w\.png/.exec(item.textContent)?.[0]),
      )
    await expect(thumbs(page).first()).toContainText("головне")

    // «c» — на місце перед «a»: ліва половина першої мініатюри.
    const items = page
      .getByRole("list", { name: "Вибрані фото" })
      .locator(":scope > li")
    await items.nth(2).dragTo(items.nth(0), {
      targetPosition: { x: 8, y: 20 },
    })
    await expect.poll(order).toEqual(["c.png", "a.png", "b.png"])
    await expect(thumbs(page).first()).toContainText("c.png")
    await expect(thumbs(page).first()).toContainText("головне")

    // Показане фото — останнє додане «c»: «Пізніше» двічі веде його в кінець.
    const later = page.getByRole("button", { name: "Пізніше: фото «c.png»" })
    await later.click()
    await later.click()
    await expect.poll(order).toEqual(["a.png", "b.png", "c.png"])
    await expect(later).toBeFocused()
    await expect(later).toHaveAttribute("aria-disabled", "true")
    await expect(page.locator("#erp-ui-announcer")).toContainText(
      "Фото «c.png» тепер 3 з 3",
    )
  })
})

test.describe("перегляд фото й сітка", () => {
  test("запасне джерело, «Фото не завантажилось», «Без фото», велике в новій вкладці", async ({
    page,
  }) => {
    await openWith(page, {}, PAGE)
    const galleries = page.locator('[data-slot="photo-gallery"]')
    await expect(
      galleries.nth(0).getByRole("img", { name: "Чашка керамічна 310 мл" }),
    ).toHaveAttribute("src", "photos/mug.svg")
    await expect(
      galleries.nth(0).getByRole("link", {
        name: "Відкрити велике фото «Чашка керамічна 310 мл» у новій вкладці",
      }),
    ).toHaveAttribute("target", "_blank")
    await expect(galleries.nth(2)).toContainText("Фото не завантажилось")
    await expect(galleries.nth(3)).toContainText("Без фото")
    await galleries.nth(1).getByRole("button", { name: "Фото 2 з 2" }).click()
    await expect(
      galleries.nth(1).getByRole("img", { name: "Кепка п'ятипанельна" }),
    ).toHaveAttribute("src", "photos/bag.svg")
  })

  test("сотня карток; варіанти малюються при відкритті, порожні колонки сховано", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await openWith(page, {}, PAGE)
    const grid = page.getByRole("list", { name: "Результати пошуку" })
    await expect(grid.getByRole("article")).toHaveCount(6)
    await page.getByRole("combobox", { name: "Скільки карток" }).click()
    await page.getByRole("option", { name: "100" }).click()
    await expect(grid.getByRole("article")).toHaveCount(100)
    const card = grid
      .getByRole("article", { name: "Чашка керамічна 310 мл" })
      .first()
    const before = await card.boundingBox()
    await expect(card.getByRole("table")).toHaveCount(0)
    await card.getByText("4 варіанти").click()
    const table = card.getByRole("table", {
      name: "Варіанти: Чашка керамічна 310 мл",
    })
    await expect(table.getByRole("columnheader")).toHaveText([
      "Артикул",
      "Колір",
      "Залишок",
      "Ціна",
    ])
    const after = await card.boundingBox()
    expect((after?.width ?? 0) > (before?.width ?? 0) * 1.8).toBe(true)
    await page.getByRole("checkbox", { name: "Завантаження" }).click()
    await expect(
      page.getByRole("list", { name: "Результати пошуку" }),
    ).toHaveAttribute("aria-busy", "true")
    await page.getByRole("checkbox", { name: "Завантаження" }).click()
    await page.getByRole("checkbox", { name: "Нічого не знайдено" }).click()
    await expect(
      page.getByRole("heading", { name: "Нічого не знайдено" }),
    ).toBeVisible()
  })
})

for (const theme of ["light", "dark"] as const) {
  test(`телефон 360 ${theme}: фото й картки без прокрутки вбік, axe`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 })
    await openWith(page, { theme }, PAGE)
    await choose(page, [
      {
        name: "front.png",
        buffer: await pngOf(page, { width: 1600, height: 1200 }),
      },
      {
        name: "a-very-long-file-name-from-the-phone-camera.png",
        buffer: await pngOf(page, { width: 900, height: 1600 }),
      },
    ])
    await expect(thumbs(page)).toHaveCount(2)
    await cropArea(page).focus()
    await page.keyboard.press("ArrowUp")
    const card = page
      .getByRole("list", { name: "Результати пошуку" })
      .getByRole("article")
      .first()
    await card.getByText("4 варіанти").click()
    await expectNoHorizontalScroll(page)
    await expectNoA11yViolations(page)
  })

  test(`1440 ${theme}: axe`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await openWith(page, { theme }, PAGE)
    await choose(page, [
      {
        name: "front.png",
        buffer: await pngOf(page, { width: 1600, height: 1200 }),
      },
    ])
    await expect(thumbs(page)).toHaveCount(1)
    await expectNoA11yViolations(page)
  })
}
