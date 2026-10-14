import { describe, expect, it } from "vitest"

import { amountInWords, numberInWords } from "@/registry/lib/amount-in-words"

const uah = (amount: number | bigint) => ({ amount, currency: "UAH" })

describe("числа словами", () => {
  it("uk: рід, десятки, сотні, розряди", () => {
    expect(numberInWords(0, "uk")).toBe("нуль")
    expect(numberInWords(1, "uk")).toBe("один")
    expect(numberInWords(1, "uk", "feminine")).toBe("одна")
    expect(numberInWords(2, "uk", "feminine")).toBe("дві")
    expect(numberInWords(11, "uk")).toBe("одинадцять")
    expect(numberInWords(45, "uk")).toBe("сорок п'ять")
    expect(numberInWords(212, "uk")).toBe("двісті дванадцять")
    expect(numberInWords(1000, "uk")).toBe("одна тисяча")
    expect(numberInWords(2001, "uk")).toBe("дві тисячі один")
    expect(numberInWords(5_000_000, "uk")).toBe("п'ять мільйонів")
    expect(numberInWords(21_000, "uk")).toBe("двадцять одна тисяча")
    expect(numberInWords(1_002_000_011n, "uk")).toBe(
      "один мільярд два мільйони одинадцять",
    )
    expect(numberInWords(-3, "uk")).toBe("мінус три")
  })

  it("форми множини розрядів на 1, 2, 5, 11, 21, 22, 25, 101 (SPEC §11)", () => {
    const thousands = [1, 2, 5, 11, 21, 22, 25, 101].map((n) =>
      numberInWords(n * 1000, "uk"),
    )
    expect(thousands).toEqual([
      "одна тисяча",
      "дві тисячі",
      "п'ять тисяч",
      "одинадцять тисяч",
      "двадцять одна тисяча",
      "двадцять дві тисячі",
      "двадцять п'ять тисяч",
      "сто одна тисяча",
    ])
  })

  it("en-GB: дефіс, «and», короткі шкали", () => {
    expect(numberInWords(0, "en")).toBe("zero")
    expect(numberInWords(48, "en")).toBe("forty-eight")
    expect(numberInWords(105, "en")).toBe("one hundred and five")
    expect(numberInWords(1005, "en")).toBe("one thousand and five")
    expect(numberInWords(1_100, "en")).toBe("one thousand one hundred")
    expect(numberInWords(2_000_050, "en")).toBe("two million and fifty")
    expect(numberInWords(48_600, "en")).toBe("forty-eight thousand six hundred")
    expect(numberInWords(3_000_000_000n, "en")).toBe("three billion")
  })

  it("дробові й завеликі числа — помилка", () => {
    expect(() => numberInWords(1.5, "uk")).toThrow(RangeError)
    expect(() => numberInWords(10n ** 15n, "uk")).toThrow(RangeError)
  })
})

describe("сума прописом", () => {
  it("гривня: копійки цифрами, велика літера", () => {
    expect(amountInWords(uah(4_860_000), "uk")).toBe(
      "Сорок вісім тисяч шістсот гривень 00 копійок",
    )
    expect(amountInWords(uah(101), "uk")).toBe("Одна гривня 01 копійка")
    expect(amountInWords(uah(222), "uk")).toBe("Дві гривні 22 копійки")
    expect(amountInWords(uah(2_105), "uk")).toBe(
      "Двадцять одна гривня 05 копійок",
    )
  })

  it("копійки словами й без великої літери", () => {
    expect(
      amountInWords(uah(150), "uk", { minor: "words", capitalize: false }),
    ).toBe("одна гривня п'ятдесят копійок")
    expect(amountInWords(uah(1), "uk", { minor: "words" })).toBe(
      "Нуль гривень одна копійка",
    )
  })

  it("долар США й євро", () => {
    expect(amountInWords({ amount: 120_000, currency: "USD" }, "uk")).toBe(
      "Одна тисяча двісті доларів США 00 центів",
    )
    expect(amountInWords({ amount: 202, currency: "usd" }, "uk")).toBe(
      "Два долари США 02 центи",
    )
    expect(amountInWords({ amount: 100, currency: "EUR" }, "uk")).toBe(
      "Один євро 00 євроцентів",
    )
  })

  it("англійською", () => {
    expect(amountInWords(uah(4_860_000), "en")).toBe(
      "Forty-eight thousand six hundred hryvnias 00 kopiykas",
    )
    expect(amountInWords(uah(101), "en")).toBe("One hryvnia 01 kopiyka")
    expect(amountInWords({ amount: 10_550, currency: "EUR" }, "en")).toBe(
      "One hundred and five euros 50 cents",
    )
  })

  it("великі суми bigint без втрати копійок; від'ємні", () => {
    // Більше за Number.MAX_SAFE_INTEGER копійок.
    expect(amountInWords(uah(9_007_199_254_740_993n), "uk")).toBe(
      "Дев'яносто трильйонів сімдесят один мільярд дев'ятсот дев'яносто два мільйони п'ятсот сорок сім тисяч чотириста дев'ять гривень 93 копійки",
    )
    expect(amountInWords(uah(-500), "uk")).toBe(
      "Мінус п'ять гривень 00 копійок",
    )
  })

  it("інша валюта — зі словами з параметра, без них — помилка", () => {
    const PLN = {
      major: ["злотий", "злоті", "злотих"],
      minor: ["грош", "гроші", "грошів"],
    }
    expect(
      amountInWords({ amount: 500, currency: "PLN" }, "uk", {
        currencies: { PLN },
      }),
    ).toBe("П'ять злотих 00 грошів")
    expect(() => amountInWords({ amount: 500, currency: "PLN" }, "uk")).toThrow(
      RangeError,
    )
    // Неповні форми для uk — помилка, а не «П'ять  00 ».
    expect(() =>
      amountInWords({ amount: 500, currency: "PLN" }, "uk", {
        currencies: { PLN: { major: ["zl"], minor: ["gr"] } },
      }),
    ).toThrow(RangeError)
  })
})
