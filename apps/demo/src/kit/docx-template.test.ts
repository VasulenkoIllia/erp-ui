import PizZip from "pizzip"
import { describe, expect, it } from "vitest"

import {
  DOCX_MAX_TAGS,
  DOCX_MAX_UNPACKED_BYTES,
  DOCX_MIME,
  readDocxTemplate,
  type DocxTemplate,
} from "@/registry/lib/docx-template"

import {
  brokenTemplate,
  contractTemplate,
  unknownTagTemplate,
} from "@/data/docx-templates"

/** Читання й заповнення шаблону .docx у браузері (UI44, ADR-0087): docxtemplater і pizzip без моків. */

async function templateOf(bytes: Uint8Array): Promise<DocxTemplate> {
  const result = await readDocxTemplate(bytes)
  if (!result.ok) throw new Error(`template not read: ${result.reason}`)
  return result.template
}

/** Шаблон договору з іншим тілом документа: один абзац із текстом. */
function bodyTemplate(text: string): Uint8Array {
  const zip = new PizZip(contractTemplate())
  const xml = zip.file("word/document.xml")?.asText() ?? ""
  zip.file(
    "word/document.xml",
    xml.replace(
      /<w:body>[\s\S]*<\/w:body>/,
      `<w:body><w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p></w:body>`,
    ),
  )
  return zip.generate({ type: "uint8array", compression: "DEFLATE" })
}

/** Підробити заявлений розпакований розмір частини в заголовках zip (локальному й центральному). */
function withDeclaredSize(bytes: Uint8Array, name: string, size: number) {
  const copy = bytes.slice()
  const view = new DataView(copy.buffer)
  const decoder = new TextDecoder()
  for (let at = 0; at + 46 < copy.length; at += 1) {
    if (view.getUint32(at, true) !== 0x02014b50) continue
    const nameLength = view.getUint16(at + 28, true)
    if (decoder.decode(copy.subarray(at + 46, at + 46 + nameLength)) !== name)
      continue
    view.setUint32(at + 24, size, true)
    view.setUint32(view.getUint32(at + 42, true) + 22, size, true)
  }
  return copy
}

/** Текст абзаців документа: так його читає Word і перегляд. */
async function paragraphsOf(file: Blob): Promise<string[]> {
  const zip = new PizZip(new Uint8Array(await file.arrayBuffer()))
  const xml = zip.file("word/document.xml")?.asText() ?? ""
  return [...xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)].map((match) =>
    [...match[0].matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)]
      .map((text) => text[1])
      .join("")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">"),
  )
}

const DATA = {
  number: "ЗМ-2026-0042",
  dateLong: "14 листопада 2026",
  total: "79 860,00 ₴",
  totalInWords: "Сімдесят дев'ять тисяч вісімсот шістдесят гривень 00 копійок",
  tax: "13 210,00 ₴",
  contractor: {
    clause: "ТОВ «Зоря» <і> & Ко (надалі «Постачальник»)",
    name: "ТОВ «Зоря»",
    code: "32855961",
    vatIpn: "",
    iban: "UA213223130000026007233566001",
    bankName: "АТ «Банк»",
    address: "Київ",
    signature: "Олена КОВАЛЬ",
  },
  customer: {
    clause: "ТОВ «Північний вітер» (надалі «Покупець»)",
    name: "ТОВ «Північний вітер»",
    code: "41234569",
    vatIpn: "412345626519",
    iban: "UA223052990000026001234567890",
    bankName: "АТ «Тестовий банк»",
    address: "Харків",
    signature: "Андрій МЕЛЬНИК",
  },
  lines: [
    {
      no: "1",
      name: "Ноутбук",
      quantity: "2",
      unit: "шт.",
      price: "32 500,00 ₴",
      total: "78 000,00 ₴",
    },
    {
      no: "2",
      name: "Доставка",
      quantity: "1",
      unit: "посл.",
      price: "600,00 ₴",
      total: "600,00 ₴",
    },
  ],
}

describe("шаблон .docx", () => {
  it("мітки шаблону — зі вкладеними блоками: цикл рядків і умова", async () => {
    const { tags } = await templateOf(contractTemplate())
    expect(tags.map((tag) => tag.name)).toEqual(
      expect.arrayContaining([
        "number",
        "contractor.clause",
        "customer.clause",
        "lines",
        "total",
      ]),
    )
    const lines = tags.find((tag) => tag.name === "lines")
    expect(lines?.kind).toBe("section")
    expect(lines?.inner.map((tag) => tag.name)).toEqual([
      "no",
      "name",
      "quantity",
      "unit",
      "price",
      "total",
    ])
    expect(tags.find((tag) => tag.name === "customer.vatIpn")).toMatchObject({
      kind: "section",
      inner: [{ name: "customer.vatIpn", kind: "value" }],
    })
  })

  it("заповнення: значення текстом з екрануванням XML, рядок таблиці на рядок документа, умова з порожнім — без тексту", async () => {
    const file = (await templateOf(contractTemplate())).fill(DATA)
    expect(file.type).toBe(DOCX_MIME)
    const text = await paragraphsOf(file)
    expect(text).toContain("ДОГОВІР ПОСТАВКИ № ЗМ-2026-0042")
    expect(text.join("\n")).toContain(
      "ТОВ «Зоря» <і> & Ко (надалі «Постачальник»), з одного боку, і ТОВ «Північний вітер» (надалі «Покупець»)",
    )
    expect(text).toEqual(
      expect.arrayContaining(["Ноутбук", "Доставка", "78 000,00 ₴"]),
    )
    expect(text).toContain("ІПН 412345626519")
    expect(text).not.toContain("ІПН ")
    expect(text.join("\n")).not.toMatch(/[{}]/)
  })

  it("той самий шаблон заповнюється знову з тих самих байтів: попереднє заповнення не залишається", async () => {
    const template = await templateOf(contractTemplate())
    await paragraphsOf(template.fill(DATA))
    const second = await paragraphsOf(
      template.fill({ ...DATA, number: "ЗМ-2026-0043" }),
    )
    expect(second).toContain("ДОГОВІР ПОСТАВКИ № ЗМ-2026-0043")
  })

  it("невідома мітка лишається текстом {мітка}; шлях не дістає вбудованих полів об'єкта", async () => {
    const template = await templateOf(unknownTagTemplate())
    const text = await paragraphsOf(
      template.fill({
        number: "1",
        date: "1",
        total: "1",
        lines: [{ name: "А" }],
      }),
    )
    expect(text).toContain("Директор покупця: {customer.director}")
    expect(text).toEqual(expect.arrayContaining(["А", "{sku}"]))
  })

  it("пробіли навколо назви мітки не заважають: значення й цикл заповнюються", async () => {
    const template = await templateOf(
      bodyTemplate("№ { number }; {# lines }[{ name }]{/ lines }"),
    )
    expect(template.tags.map((tag) => tag.name)).toEqual(["number", "lines"])
    expect(await paragraphsOf(template.fill(DATA))).toEqual([
      "№ ЗМ-2026-0042; [Ноутбук][Доставка]",
    ])
  })

  it("{^lines} — блок «коли порожньо», окремий вид мітки", async () => {
    const { tags } = await templateOf(
      bodyTemplate("{^lines}Рядків немає{/lines}"),
    )
    expect(tags).toEqual([{ name: "lines", kind: "inverted", inner: [] }])
  })

  it("помилки запису міток — з кодом і міткою, шаблон не береться", async () => {
    const result = await readDocxTemplate(brokenTemplate())
    expect(result).toMatchObject({ ok: false, reason: "syntax" })
    const issues = !result.ok && result.reason === "syntax" ? result.issues : []
    expect(issues.map((issue) => issue.code)).toContain("unclosed_tag")
    expect(issues).toContainEqual({ code: "unclosed_loop", tag: "lines" })
  })

  it("блоки, що не збігаються чи перетинаються, — помилка з міткою першого блока, повтор — одна", async () => {
    const mismatch = await readDocxTemplate(bodyTemplate("{#lines}{/items}"))
    expect(mismatch).toMatchObject({
      reason: "syntax",
      issues: [
        { code: "closing_tag_does_not_match_opening_tag", tag: "lines" },
      ],
    })
    const twice = await readDocxTemplate(bodyTemplate("{#lines}{#lines}"))
    const codes = !twice.ok && twice.reason === "syntax" ? twice.issues : []
    expect(codes).toEqual([{ code: "unclosed_loop", tag: "lines" }])
  })

  it("не .docx: не zip, zip без документа Word", async () => {
    expect(
      await readDocxTemplate(new TextEncoder().encode("not a zip")),
    ).toEqual({
      ok: false,
      reason: "not-docx",
    })
    const zip = new PizZip()
    zip.file("ppt/presentation.xml", "<p/>")
    expect(
      await readDocxTemplate(zip.generate({ type: "uint8array" })),
    ).toEqual({
      ok: false,
      reason: "not-docx",
    })
  })

  it("розпакований більший за межу — завеликий, ще до розбору, навіть із підробленим заголовком zip", async () => {
    const zip = new PizZip(contractTemplate())
    zip.file("word/media/huge.bin", "0".repeat(DOCX_MAX_UNPACKED_BYTES + 1))
    const bytes = zip.generate({ type: "uint8array", compression: "DEFLATE" })
    expect(await readDocxTemplate(bytes)).toEqual({
      ok: false,
      reason: "too-large",
    })
    expect(
      await readDocxTemplate(
        withDeclaredSize(bytes, "word/media/huge.bin", 100),
      ),
    ).toEqual({ ok: false, reason: "too-large" })
  })

  it("заявлений розмір частини менший за справжній — «не прочитався», а не збій читання", async () => {
    const bytes = withDeclaredSize(contractTemplate(), "word/document.xml", 100)
    expect(await readDocxTemplate(bytes)).toEqual({
      ok: false,
      reason: "unreadable",
    })
  })

  it("забагато міток — заскладний, ще до розбору", async () => {
    expect(
      await readDocxTemplate(
        bodyTemplate("{number}".repeat(DOCX_MAX_TAGS + 1)),
      ),
    ).toEqual({ ok: false, reason: "too-complex" })
  })
})
