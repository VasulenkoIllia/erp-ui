import { afterEach, describe, expect, it, vi } from "vitest"

import {
  hasValue,
  isEmptyCell,
  isSpreadsheetLoadFailure,
  readSpreadsheet,
  saveFile,
  sheetName,
  spreadsheetFileName,
  SpreadsheetError,
  SPREADSHEET_MAX_BYTES,
  writeSpreadsheet,
} from "@/registry/lib/spreadsheet"

const fileOf = (content: BlobPart, name: string) => new File([content], name)

const codeOf = async (file: File) => {
  try {
    await readSpreadsheet(file)
  } catch (error) {
    if (error instanceof SpreadsheetError) return error.code
    throw error
  }
  return null
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe("межі читання", () => {
  it("мільйони порожніх рядків не вішають вкладку й не роблять файл завеликим", async () => {
    const [sheet] = await readSpreadsheet(
      fileOf(`Код\n1\n${"\n".repeat(20_000_000)}`, "дані.csv"),
      { maxRows: 11 },
    )
    expect(sheet?.truncated).toBe(false)
    expect(sheet?.rows.filter(hasValue)).toHaveLength(2)
  })

  it("значення за порожніми рядками не губиться мовчки", async () => {
    const [sheet] = await readSpreadsheet(
      fileOf(`Код\n1\n${"\n".repeat(100)}2\n`, "дані.csv"),
      { maxRows: 11 },
    )
    expect(sheet?.truncated).toBe(true)
  })

  it("перенос у лапках запису не закінчує", async () => {
    const [sheet] = await readSpreadsheet(
      fileOf('Код;Опис\n1;"два\nрядки"\n2;x\n', "дані.csv"),
      { maxRows: 3 },
    )
    expect(sheet?.truncated).toBe(false)
    expect(sheet?.rows[1]).toEqual(["1", "два\nрядки"])
  })

  it("рівно на межі файл не обрізаний, на рядок більше — обрізаний", async () => {
    const text = "a\nb\nc\n"
    const [exact] = await readSpreadsheet(fileOf(text, "дані.csv"), {
      maxRows: 3,
    })
    const [over] = await readSpreadsheet(fileOf(text, "дані.csv"), {
      maxRows: 2,
    })
    expect(exact?.truncated).toBe(false)
    expect(over?.truncated).toBe(true)
    expect(over?.rows).toHaveLength(2)
  })

  it("файл, якого вже немає, дає причину, а не вічне читання", async () => {
    const file = fileOf("a;b\n", "дані.csv")
    file.arrayBuffer = () => Promise.reject(new Error("gone"))
    expect(await codeOf(file)).toBe("unreadable")
  })
})

describe("порожні клітинки", () => {
  it("пробіли — теж порожньо", () => {
    expect(isEmptyCell("   ")).toBe(true)
    expect(isEmptyCell(undefined)).toBe(true)
    expect(isEmptyCell(0)).toBe(false)
    expect(isEmptyCell(false)).toBe(false)
    expect(hasValue(["  ", null])).toBe(false)
  })
})

describe("saveFile", () => {
  it("тримає посилання, доки Safari почне завантаження", () => {
    vi.useFakeTimers()
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test")
    const revoke = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => undefined)
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined)
    saveFile(new Blob(["x"]), "дані.csv")
    expect(click).toHaveBeenCalledTimes(1)
    expect(revoke).not.toHaveBeenCalled()
    vi.runAllTimers()
    expect(revoke).toHaveBeenCalledWith("blob:test")
  })
})

describe("isSpreadsheetLoadFailure", () => {
  it("відрізняє незавантажений чанк від інших збоїв", () => {
    expect(isSpreadsheetLoadFailure(new SpreadsheetError("load_failed"))).toBe(
      true,
    )
    expect(isSpreadsheetLoadFailure(new SpreadsheetError("unreadable"))).toBe(
      false,
    )
    expect(isSpreadsheetLoadFailure(new Error("x"))).toBe(false)
  })
})

describe("readSpreadsheet: CSV", () => {
  it("лишає рядки рядками: нулі на початку не губляться", async () => {
    const [sheet] = await readSpreadsheet(
      fileOf("Код;Назва\n00123456;Зоря\n", "дані.csv"),
    )
    expect(sheet?.rows).toEqual([
      ["Код", "Назва"],
      ["00123456", "Зоря"],
    ])
  })

  it("читає UTF-8 з міткою", async () => {
    const [sheet] = await readSpreadsheet(
      fileOf("﻿Ім'я,Сума\nҐава,12\n", "дані.csv"),
    )
    expect(sheet?.rows[1]).toEqual(["Ґава", "12"])
  })

  it("читає windows-1251, у якому Excel зберігає кирилицю", async () => {
    // «Зоря» в windows-1251: це не дійсний UTF-8.
    const bytes = new Uint8Array([0xc7, 0xee, 0xf0, 0xff, 0x0a, 0x31, 0x0a])
    const [sheet] = await readSpreadsheet(fileOf(bytes, "дані.csv"))
    expect(sheet?.rows[0]).toEqual(["Зоря"])
  })

  it("читає UTF-16 за міткою", async () => {
    const text = "﻿Зоря\n1\n"
    const bytes = new Uint8Array(text.length * 2)
    new DataView(bytes.buffer).setUint16(0, 0xfffe)
    for (let i = 1; i < text.length; i += 1)
      new DataView(bytes.buffer).setUint16(i * 2, text.charCodeAt(i), true)
    const [sheet] = await readSpreadsheet(fileOf(bytes, "дані.csv"))
    expect(sheet?.rows[0]).toEqual(["Зоря"])
  })

  it("позначає, що рядків більше за межу", async () => {
    const [sheet] = await readSpreadsheet(fileOf("a\n1\n2\n3\n", "дані.csv"), {
      maxRows: 2,
    })
    expect(sheet?.rows).toHaveLength(2)
    expect(sheet?.truncated).toBe(true)
  })
})

describe("readSpreadsheet: помилки", () => {
  it("не читає завеликий файл", async () => {
    const file = fileOf("a", "дані.csv")
    Object.defineProperty(file, "size", { value: SPREADSHEET_MAX_BYTES + 1 })
    expect(await codeOf(file)).toBe("too_large")
  })

  it("не приймає інших розширень", async () => {
    expect(await codeOf(fileOf("a", "дані.xls"))).toBe("unsupported")
  })

  it("порожній файл і файл без даних — це empty", async () => {
    expect(await codeOf(fileOf("", "дані.csv"))).toBe("empty")
    expect(await codeOf(fileOf(";;\n;;\n", "дані.csv"))).toBe("empty")
  })

  it("биті байти під виглядом .xlsx — unreadable", async () => {
    expect(await codeOf(fileOf("не таблиця", "дані.xlsx"))).toBe("unreadable")
  })
})

describe("writeSpreadsheet", () => {
  it(".xlsx: круг запис і читання зберігає типи", async () => {
    const released = new Date(Date.UTC(2026, 9, 31))
    const blob = await writeSpreadsheet({
      format: "xlsx",
      sheetName: "Товари",
      rows: [
        ["Назва", "Ціна", "Дата", "Активний"],
        ["Кавоварка «Ґава»", 1234.56, released, true],
      ],
    })
    const [sheet] = await readSpreadsheet(
      fileOf(await blob.arrayBuffer(), "товари.xlsx"),
    )
    expect(sheet?.name).toBe("Товари")
    expect(sheet?.rows[1]).toEqual([
      "Кавоварка «Ґава»",
      1234.56,
      released,
      true,
    ])
  })

  it(".xlsx: рядок як формула лишається текстом", async () => {
    const blob = await writeSpreadsheet({
      format: "xlsx",
      rows: [["A"], ["=HYPERLINK(1)"]],
    })
    const [sheet] = await readSpreadsheet(
      fileOf(await blob.arrayBuffer(), "дані.xlsx"),
    )
    expect(sheet?.rows[1]).toEqual(["=HYPERLINK(1)"])
  })

  it(".xlsx: довгий текст обрізається до межі Excel", async () => {
    const blob = await writeSpreadsheet({
      format: "xlsx",
      rows: [["A"], ["я".repeat(40_000)]],
    })
    const [sheet] = await readSpreadsheet(
      fileOf(await blob.arrayBuffer(), "дані.xlsx"),
    )
    expect(String(sheet?.rows[1]?.[0])).toHaveLength(32_767)
  })

  it(".csv: BOM, роздільник і захист від формул", async () => {
    const blob = await writeSpreadsheet({
      format: "csv",
      delimiter: ";",
      rows: [
        ["Ім'я", "Сума"],
        ["=1+1", -5],
      ],
    })
    const bytes = new Uint8Array(await blob.arrayBuffer())
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    const text = new TextDecoder().decode(bytes)
    // Від'ємне число лишається числом: це не формула.
    expect(text).toBe("Ім'я;Сума\r\n'=1+1;-5")
  })
})

describe("допоміжне", () => {
  it("hasValue не бачить порожніх клітинок", () => {
    expect(hasValue([null, ""])).toBe(false)
    expect(hasValue([null, 0])).toBe(true)
  })

  it("назва аркуша проходить вимоги Excel", () => {
    expect(sheetName("Рахунки: 2026/10")).toBe("Рахунки  2026 10")
    expect(sheetName("я".repeat(40))).toHaveLength(31)
    expect(sheetName(":::")).toBe("Sheet1")
  })

  it("назва файла з датою", () => {
    expect(
      spreadsheetFileName("contacts", "csv", new Date("2026-10-31T10:00:00Z")),
    ).toBe("contacts-2026-10-31.csv")
  })
})
