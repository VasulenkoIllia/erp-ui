import PizZip from "pizzip"

/**
 * Шаблони Word демо для генератора документів (UI44, ADR-0087): збираються кодом, а не лежать файлами,
 * тож їх видно в диффі й ними користуються і демо (лінивим імпортом), і тести. У проекті шаблони — файли
 * .docx, зроблені у Word: проект віддає їх статичними файлами чи з API.
 *
 * Шаблон — мінімальний пакет Word: аркуш A4 з полями, стилі за замовчуванням, абзаци й таблиці з мітками
 * генератора (`{number}`, `{customer.clause}`, рядки — `{#lines}` у першій клітинці рядка таблиці й
 * `{/lines}` в останній).
 */
export const DOCX_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
const W =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
const R =
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'

const CONTENT_TYPES = `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`
const ROOT_RELS = `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`
const DOCUMENT_RELS = `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`
/** Arial 11 пт, інтервал після абзацу 6 пт. */
const STYLES = `${XML_HEAD}<w:styles ${W}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="22"/><w:lang w:val="uk-UA"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120"/></w:pPr></w:pPrDefault></w:docDefaults></w:styles>`
/** A4, поля 2 см, ліве 2,5 см. */
const SECTION = `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1418" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr>`

const escapeXml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

interface ParagraphOptions {
  readonly bold?: boolean
  readonly align?: "center" | "right"
  /** Розмір у пунктах. */
  readonly size?: number
}

function paragraph(text: string, options: ParagraphOptions = {}): string {
  const properties = options.align ? `<w:jc w:val="${options.align}"/>` : ""
  const run = [
    options.bold ? "<w:b/>" : "",
    options.size ? `<w:sz w:val="${options.size * 2}"/>` : "",
  ].join("")
  return `<w:p><w:pPr>${properties}</w:pPr><w:r><w:rPr>${run}</w:rPr><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`
}

const BORDER = (side: string) =>
  `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="808080"/>`
const BORDERS = `<w:tblBorders>${["top", "left", "bottom", "right", "insideH", "insideV"].map(BORDER).join("")}</w:tblBorders>`

/** Таблиця на ширину аркуша; клітинка — абзаци через перенос рядка в тексті. */
function table(
  rows: readonly (readonly string[])[],
  { borders = true, headerBold = true } = {},
): string {
  const cell = (text: string, bold: boolean) =>
    `<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/></w:tcPr>${text
      .split("\n")
      .map((line) => paragraph(line, { bold }))
      .join("")}</w:tc>`
  const body = rows
    .map(
      (row, index) =>
        `<w:tr>${row.map((text) => cell(text, headerBold && index === 0)).join("")}</w:tr>`,
    )
    .join("")
  return `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/>${borders ? BORDERS : ""}</w:tblPr>${body}</w:tbl>`
}

function docx(body: readonly string[]): Uint8Array {
  const zip = new PizZip()
  zip.file("[Content_Types].xml", CONTENT_TYPES)
  zip.file("_rels/.rels", ROOT_RELS)
  zip.file("word/_rels/document.xml.rels", DOCUMENT_RELS)
  zip.file("word/styles.xml", STYLES)
  zip.file(
    "word/document.xml",
    `${XML_HEAD}<w:document ${W} ${R}><w:body>${body.join("")}${SECTION}</w:body></w:document>`,
  )
  return zip.generate({ type: "uint8array", compression: "DEFLATE" })
}

const LINES_TABLE = [
  ["№", "Назва", "Кількість", "Од.", "Ціна", "Сума"],
  [
    "{#lines}{no}",
    "{name}",
    "{quantity}",
    "{unit}",
    "{price}",
    "{total}{/lines}",
  ],
]

const partyBlock = (role: "contractor" | "customer") =>
  [
    `{${role}.name}`,
    `ЄДРПОУ / РНОКПП {${role}.code}`,
    `{#${role}.vatIpn}ІПН {${role}.vatIpn}{/${role}.vatIpn}`,
    `IBAN {${role}.iban}, {${role}.bankName}`,
    `{${role}.address}`,
    `______________ {${role}.signature}`,
  ].join("\n")

/** Договір поставки: сторони в тексті, рядки таблицею, сума прописом, реквізити й підписи. */
export function contractTemplate(): Uint8Array {
  return docx([
    paragraph("ДОГОВІР ПОСТАВКИ № {number}", {
      bold: true,
      align: "center",
      size: 14,
    }),
    paragraph("м. Київ, {dateLong}", { align: "right" }),
    paragraph(
      "{contractor.clause}, з одного боку, і {customer.clause}, з другого боку, уклали цей договір про таке.",
    ),
    paragraph("1. Предмет договору", { bold: true }),
    paragraph(
      "1.1. Постачальник передає, а Покупець приймає й оплачує товари й послуги:",
    ),
    table(LINES_TABLE),
    paragraph(
      "1.2. Загальна сума договору: {total} ({totalInWords}), зокрема податок {tax}.",
    ),
    paragraph("2. Реквізити й підписи сторін", { bold: true }),
    table(
      [
        ["Постачальник", "Покупець"],
        [partyBlock("contractor"), partyBlock("customer")],
      ],
      { borders: false },
    ),
  ])
}

/** Лист про оплату: сума, строк і реквізити для переказу. */
export function paymentLetterTemplate(): Uint8Array {
  return docx([
    paragraph("{contractor.name}", { bold: true }),
    paragraph("Вих. № {number} від {date}"),
    paragraph("{customer.name}", { align: "right" }),
    paragraph("{customer.address}", { align: "right" }),
    paragraph("Шановні партнери!", { bold: true, align: "center" }),
    paragraph(
      "Просимо оплатити документ № {number} від {date} на суму {total} ({totalInWords}) до {fields.dueDate}.",
    ),
    paragraph(
      "Реквізити для оплати: {contractor.name}, ЄДРПОУ / РНОКПП {contractor.code}, IBAN {contractor.iban}, {contractor.bankName}.",
    ),
    paragraph(
      "{contractor.signerPosition}   ______________ {contractor.signature}",
    ),
  ])
}

/** Шаблон із невідомими мітками: у документі й у рядках. */
export function unknownTagTemplate(): Uint8Array {
  return docx([
    paragraph("ДОГОВІР № {number} від {date}", { bold: true, align: "center" }),
    paragraph("Директор покупця: {customer.director}"),
    table([
      ["Назва", "Артикул"],
      ["{#lines}{name}", "{sku}{/lines}"],
    ]),
    paragraph("Усього: {total}"),
  ])
}

/** Шаблон з помилками запису міток: мітку й блок не закрито. */
export function brokenTemplate(): Uint8Array {
  return docx([
    paragraph("ДОГОВІР № {number"),
    paragraph("{#lines}{name}"),
    paragraph("Усього: {total}"),
  ])
}

/** Байти шаблону файлом Word: так їх віддає `load` шаблону проекту. */
export const templateFile = (bytes: Uint8Array) =>
  new Blob([bytes.slice()], { type: DOCX_TYPE })
