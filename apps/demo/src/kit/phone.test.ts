import { describe, expect, it } from "vitest"

import {
  formatPhone,
  formatPhoneAsYouType,
  normalizePhone,
  phoneRegions,
  regionOfPhone,
  validatePhone,
} from "@/registry/lib/phone"

describe("телефон", () => {
  it("нормалізує звичні способи запису українського номера", () => {
    for (const input of [
      "067 123 45 67",
      "0671234567",
      "380671234567",
      "+38 (067) 123-45-67",
      "671234567",
    ]) {
      expect(normalizePhone(input), input).toBe("+380671234567")
    }
    expect(normalizePhone("0048 512 345 678")).toBe("+48512345678")
    expect(normalizePhone("")).toBe("")
  })

  it("українські номери — групами 2-3-2-2, інші — міжнародним форматом", () => {
    expect(formatPhone("+380671234567")).toBe("+380 67 123 45 67")
    expect(formatPhone("+380441234567")).toBe("+380 44 123 45 67")
    expect(formatPhone("+48512345678")).toBe("+48 512 345 678")
    expect(formatPhone("+442079460958")).toBe("+44 20 7946 0958")
  })

  it("маска під час введення", () => {
    expect(formatPhoneAsYouType("+3806712")).toBe("+380 67 12")
    expect(formatPhoneAsYouType("+48512")).toBe("+48 512")
    expect(formatPhoneAsYouType("+")).toBe("+")
  })

  it("перевірка за даними Google", () => {
    expect(validatePhone("+380671234567")).toBeNull()
    expect(validatePhone("+14155552671")).toBeNull()
    expect(validatePhone("+3806712")).toBe("incomplete")
    expect(validatePhone("+380001234567")).toBe("invalid")
    expect(validatePhone("")).toBeNull()
  })

  it("країна за кодом, навіть для незавершеного номера", () => {
    expect(regionOfPhone("+380671234567")).toBe("UA")
    expect(regionOfPhone("+48")).toBe("PL")
    expect(regionOfPhone("+38")).toBeNull()
  })

  it("список країн: Україна й Польща першими, решта за абеткою мови", () => {
    const uk = phoneRegions("uk-UA", { exclude: ["RU", "BY"] })
    expect(uk.slice(0, 2).map((r) => r.region)).toEqual(["UA", "PL"])
    expect(uk[0]).toEqual({ region: "UA", callingCode: 380, name: "Україна" })
    expect(uk.some((r) => r.region === "RU" || r.region === "BY")).toBe(false)
    const en = phoneRegions("en-GB")
    expect(en[2]?.name).toBe("Afghanistan")
  })
})
