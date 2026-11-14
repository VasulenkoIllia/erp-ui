import { readFileSync } from "node:fs"

import { expect, test, type Page } from "@playwright/test"
import PizZip from "pizzip"

import { brokenTemplate } from "../src/data/docx-templates"
import {
  expectNoA11yViolations,
  expectNoHorizontalScroll,
  openWith,
} from "./helpers"

/**
 * Крок UI44 (ADR-0087): документ із шаблону .docx — мітки зі значеннями документа, перегляд самого файла й
 * завантаження того самого файла, помилка біля невідомої мітки й біля мітки, записаної з помилкою, свій
 * файл, дія на картці рахунку через розширення, телефон.
 */
const PAGE = "/#/document-generator"
const INVOICE = "/#/m/K2/invoices/inv-zoriana-12"

const generator = (page: Page) =>
  page.locator('[data-slot="document-generator"]').first()
const previewOf = (page: Page) =>
  page.locator('[data-slot="docx-preview"]').first().contentFrame()

/** Текст абзаців перегляду: так docx-preview малює кожен абзац Word. */
async function previewParagraphs(page: Page): Promise<string[]> {
  const texts = await previewOf(page)
    .locator("section.docx p")
    .allTextContents()
  return texts.map((text) => text.trim()).filter(Boolean)
}

/** Текст абзаців файла .docx у порядку документа. */
function fileParagraphs(path: string): string[] {
  const zip = new PizZip(readFileSync(path))
  const xml = zip.file("word/document.xml")?.asText() ?? ""
  return [...xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)]
    .map((match) =>
      [...match[0].matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)]
        .map((text) => text[1])
        .join("")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, "&")
        .trim(),
    )
    .filter(Boolean)
}

async function chooseTemplate(page: Page, name: string) {
  await generator(page).getByRole("combobox", { name: "Шаблон" }).click()
  await page.getByRole("option", { name }).click()
}

test.describe("UI44: документ із шаблону", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("мітки зі значеннями документа, перегляд оновлюється, завантажений файл — той самий, що в перегляді", async ({
    page,
  }) => {
    await openWith(page, {}, PAGE)
    const panel = generator(page)
    await expect(panel.getByText(/^Шаблон прочитано: \d+ міт/)).toBeVisible()
    const buyer = panel.getByRole("group", { name: "Покупець" })
    await expect(buyer.getByLabel("Повна назва")).toHaveValue(
      "ТОВ «Північний вітер»",
    )
    await expect(
      previewOf(page).getByText("ДОГОВІР ПОСТАВКИ № ЗМ-2026-0042"),
    ).toBeVisible()
    // axe у кадр перегляду не заходить (чужий документ без скриптів): назву кадру перевіряємо тут.
    await expect(
      page.locator('[data-slot="docx-preview"]').first(),
    ).toHaveAttribute("title", "Перегляд документа «Договір поставки»")

    await panel.getByLabel("Номер").fill("Д-7")
    await expect(
      previewOf(page).getByText("ДОГОВІР ПОСТАВКИ № Д-7"),
    ).toBeVisible()
    await expectNoA11yViolations(page)

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      panel.getByRole("button", { name: "Завантажити .docx" }).click(),
    ])
    expect(download.suggestedFilename()).toBe(
      "ЗМ-2026-0042 Договір поставки.docx",
    )
    const saved = fileParagraphs(await download.path())
    expect(saved).toContain("ДОГОВІР ПОСТАВКИ № Д-7")
    expect(await previewParagraphs(page)).toEqual(saved)
  })

  test("невідома мітка й мітка з помилкою — біля мітки, завантаження неактивне з причиною", async ({
    page,
  }) => {
    await openWith(page, {}, PAGE)
    const panel = generator(page)
    await chooseTemplate(page, "Шаблон із невідомими мітками")
    const issues = panel.getByRole("group", { name: "Помилки в шаблоні" })
    await expect(
      issues.getByRole("listitem").filter({ hasText: "{customer.director}" }),
    ).toContainText("Такої мітки немає")
    await expect(
      issues.getByRole("listitem").filter({ hasText: "{sku}" }),
    ).toContainText("У рядках документа такої мітки немає")
    // Невідома мітка в перегляді стоїть там, де її записано.
    await expect(
      previewOf(page).getByText("Директор покупця: {customer.director}"),
    ).toBeVisible()
    const download = panel.getByRole("button", { name: "Завантажити .docx" })
    await expect(download).toHaveAttribute("aria-disabled", "true")
    await expect(download).toHaveAccessibleDescription(
      "Спершу виправте помилки в шаблоні",
    )
    await expectNoA11yViolations(page)

    await chooseTemplate(page, "Шаблон з помилками запису")
    await expect(issues).toContainText("Мітку не закрито")
    await expect(issues).toContainText("Блок не закрито")
  })

  test("свій файл .docx і шаблон, що не завантажився", async ({ page }) => {
    await openWith(page, {}, PAGE)
    const panel = generator(page)
    await chooseTemplate(page, "Шаблон, що не завантажується")
    await expect(
      panel.getByText(
        "Шаблон не завантажився. Перевірте з'єднання й спробуйте ще раз.",
      ),
    ).toBeVisible()
    await expect(
      panel.getByRole("button", { name: "Спробувати ще" }),
    ).toBeVisible()

    await chooseTemplate(page, "Свій файл .docx")
    await panel.getByTestId("file-drop-input").setInputFiles({
      name: "Мій шаблон.docx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      buffer: Buffer.from(brokenTemplate()),
    })
    await expect(
      panel.getByRole("group", { name: "Помилки в шаблоні" }),
    ).toContainText("Мітку не закрито")
  })

  test("дія на картці рахунку: генератор у діалозі з даними рахунку", async ({
    page,
  }) => {
    await openWith(page, {}, INVOICE)
    await page.getByRole("button", { name: "Документ із шаблону" }).click()
    const dialog = page.getByRole("dialog", { name: "Документ із шаблону" })
    await expect(dialog.getByText(/^Шаблон прочитано/)).toBeVisible()
    await expect(
      dialog
        .getByRole("group", { name: "Постачальник" })
        .getByLabel("Повна назва"),
    ).toHaveValue("ТОВ «Зоряна логістика»")
    await expect(
      previewOf(page).getByText(/^ДОГОВІР ПОСТАВКИ № РХ-2026-\d{4}$/),
    ).toBeVisible()
    await expectNoA11yViolations(page)
  })
})

test.describe("UI44: телефон", () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test("аркуш стискається під ширину, сторінка не прокручується вбік", async ({
    page,
  }) => {
    await openWith(page, {}, PAGE)
    await expect(
      previewOf(page).getByText("ДОГОВІР ПОСТАВКИ № ЗМ-2026-0042"),
    ).toBeVisible()
    await expectNoHorizontalScroll(page)
    await expectNoA11yViolations(page)
  })
})
