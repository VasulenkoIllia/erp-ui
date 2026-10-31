import { describe, expect, it } from "vitest"

import {
  diffAuditValues,
  diffList,
  diffText,
  MAX_DIFF_TOKENS,
  type DiffPart,
} from "@/registry/lib/value-diff"

/** Різниця значень для «було → стало» (ADR-0045). */
const changed = (parts: readonly DiffPart[]) =>
  parts.filter((part) => part.changed).map((part) => part.text)
const plain = (parts: readonly DiffPart[]) =>
  parts.map((part) => part.text).join("")
const yesNo = (value: boolean) => (value ? "Так" : "Ні")

describe("diffText", () => {
  it("виділяє лише змінені слова", () => {
    const { before, after } = diffText(
      "Постачання стелажів для складу у Львові",
      "Постачання стелажів і візків для складу у Львові та Києві",
    )
    expect(changed(before)).toEqual([])
    expect(changed(after)).toEqual(["і візків ", " та Києві"])
  })

  it("у номері різниться лише кінець, а не весь рядок", () => {
    const { before, after } = diffText("2026-0007", "2026-0008")
    expect(changed(before)).toEqual(["0007"])
    expect(changed(after)).toEqual(["0008"])
  })

  it("дві зміни в різних кінцях тексту не зливаються", () => {
    const { before, after } = diffText(
      "Київ, вул. Хрещатик, 1, офіс 5",
      "Львів, вул. Хрещатик, 1, офіс 7",
    )
    expect(changed(before)).toEqual(["Київ", "5"])
    expect(changed(after)).toEqual(["Львів", "7"])
  })

  it("пробіл між двома змінами виділено разом із ними", () => {
    expect(changed(diffText("а б", "в г").after)).toEqual(["в г"])
  })

  it("розкладена літера лишається цілою: слово міняється разом із нею", () => {
    const decomposed = "край\u0306"
    expect(diffText(decomposed, "край").after).toEqual([
      { text: "край", changed: true },
    ])
  })

  it("однакові значення без виділення", () => {
    const { before, after } = diffText("Той самий текст", "Той самий текст")
    expect(changed(before)).toEqual([])
    expect(changed(after)).toEqual([])
  })

  it.each([
    [
      "Договір №12/2026 — «Зоря»\nрядок 2",
      "Договір №13/2026 — «Зоря»\nрядок 3",
    ],
    ["emoji 🙂 текст", "emoji 🙃 текст"],
    ["", "новий"],
    ["  пробіли  ", "пробіли"],
  ])("нічого не губить: %j", (from, to) => {
    const { before, after } = diffText(from, to)
    expect(plain(before)).toBe(from)
    expect(plain(after)).toBe(to)
  })

  it("надто довгий текст міняється цілком", () => {
    const words = (word: string) =>
      Array.from({ length: MAX_DIFF_TOKENS + 1 }, () => word).join(" ")
    const from = words("старе")
    const to = words("нове")
    expect(diffText(from, to)).toEqual({
      before: [{ text: from, changed: true }],
      after: [{ text: to, changed: true }],
    })
  })

  it("довгий текст із короткою зміною порівнюється за словами", () => {
    const common = Array.from({ length: MAX_DIFF_TOKENS }, () => "слово").join(
      " ",
    )
    const { after } = diffText(`${common} кінець`, `${common} фініш`)
    expect(changed(after)).toEqual(["фініш"])
  })
})

describe("diffList", () => {
  it("зайвий елемент — зміна, спільний — ні", () => {
    const { before, after } = diffList(["склад", "опт"], ["опт", "пріоритет"])
    expect(changed(before)).toEqual(["склад"])
    expect(changed(after)).toEqual(["пріоритет"])
    expect(plain(after)).toBe("опт, пріоритет")
  })

  it("зайвий дублікат видно як зміну, інакше подія виглядала б порожньою", () => {
    const { before, after } = diffList(["а", "а", "б"], ["а", "б"])
    expect(changed(before)).toEqual(["а"])
    expect(changed(after)).toEqual([])
    expect(plain(before)).toBe("а, а, б")
  })

  it("перестановка — не зміна; числа порівнюються з рядками як текст", () => {
    const { before, after } = diffList([1, 2], ["2", "1"])
    expect(changed(before)).toEqual([])
    expect(changed(after)).toEqual([])
  })
})

describe("diffAuditValues", () => {
  it("число, так чи ні міняються цілком, показ — від textOf", () => {
    expect(changed(diffAuditValues(120, 148, yesNo).after)).toEqual(["148"])
    expect(diffAuditValues(false, true, yesNo)).toEqual({
      before: [{ text: "Ні", changed: true }],
      after: [{ text: "Так", changed: true }],
    })
  })

  it("порожнє значення — прочерк без виділення", () => {
    expect(diffAuditValues(null, "нове", yesNo)).toEqual({
      before: [{ text: "—", changed: false }],
      after: [{ text: "нове", changed: true }],
    })
    expect(diffAuditValues("старе", undefined, yesNo)).toEqual({
      before: [{ text: "старе", changed: true }],
      after: [{ text: "—", changed: false }],
    })
    expect(diffAuditValues([], ["а"], yesNo).before).toEqual([
      { text: "—", changed: false },
    ])
  })

  it("список проти рядка — цілком, елементи через кому", () => {
    expect(diffAuditValues(["а", "б"], "в", yesNo)).toEqual({
      before: [{ text: "а, б", changed: true }],
      after: [{ text: "в", changed: true }],
    })
  })

  it("рядок проти числа — цілком, а не за словами", () => {
    expect(diffAuditValues("10", 10, yesNo)).toEqual({
      before: [{ text: "10", changed: true }],
      after: [{ text: "10", changed: true }],
    })
  })

  it("текст і список — за словами й елементами", () => {
    expect(changed(diffAuditValues("а б", "а в", yesNo).after)).toEqual(["в"])
    expect(changed(diffAuditValues(["а"], ["а", "б"], yesNo).after)).toEqual([
      "б",
    ])
  })
})
