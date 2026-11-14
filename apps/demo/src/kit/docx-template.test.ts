import PizZip from "pizzip"
import { describe, expect, it } from "vitest"

import {
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

function templateOf(bytes: Uint8Array): DocxTemplate {
  const result = readDocxTemplate(bytes)
  if (!result.ok) throw new Error(`template not read: ${result.reason}`)
  return result.template
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
  it("мітки шаблону — зі вкладеними блоками: цикл рядків і умова", () => {
    const { tags } = templateOf(contractTemplate())
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
    const file = templateOf(contractTemplate()).fill(DATA)
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
    const template = templateOf(contractTemplate())
    await paragraphsOf(template.fill(DATA))
    const second = await paragraphsOf(
      template.fill({ ...DATA, number: "ЗМ-2026-0043" }),
    )
    expect(second).toContain("ДОГОВІР ПОСТАВКИ № ЗМ-2026-0043")
  })

  it("невідома мітка лишається текстом {мітка}; шлях не дістає вбудованих полів об'єкта", async () => {
    const template = templateOf(unknownTagTemplate())
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

  it("помилки запису міток — з кодом і міткою, шаблон не береться", () => {
    const result = readDocxTemplate(brokenTemplate())
    expect(result).toMatchObject({ ok: false, reason: "syntax" })
    const issues = !result.ok && result.reason === "syntax" ? result.issues : []
    expect(issues.map((issue) => issue.code)).toContain("unclosed_tag")
    expect(issues).toContainEqual({ code: "unclosed_loop", tag: "lines" })
  })

  it("не .docx: не zip, zip без документа Word", () => {
    expect(readDocxTemplate(new TextEncoder().encode("not a zip"))).toEqual({
      ok: false,
      reason: "not-docx",
    })
    const zip = new PizZip()
    zip.file("ppt/presentation.xml", "<p/>")
    expect(readDocxTemplate(zip.generate({ type: "uint8array" }))).toEqual({
      ok: false,
      reason: "not-docx",
    })
  })

  it("розпакований більший за межу — завеликий, ще до розбору", () => {
    const zip = new PizZip(contractTemplate())
    zip.file("word/media/huge.bin", "0".repeat(DOCX_MAX_UNPACKED_BYTES + 1))
    const bytes = zip.generate({ type: "uint8array", compression: "DEFLATE" })
    expect(readDocxTemplate(bytes)).toEqual({ ok: false, reason: "too-large" })
  })
})
