import { describe, expect, it } from "vitest"

import {
  edrpouCheckDigit,
  formatIban,
  ibanBankCode,
  normalizeUaId,
  rnokppCheckDigit,
  validateUaId,
  vatIpnCheckDigit,
} from "@/registry/lib/ua-ids"

describe("ЄДРПОУ", () => {
  it("контрольна цифра: обидва набори ваг і повторний розрахунок", () => {
    expect(validateUaId("edrpou", "32855961")).toBeNull()
    // ПриватБанк: код до 30000000 — ваги 1…7.
    expect(validateUaId("edrpou", "14360570")).toBeNull()
    expect(validateUaId("edrpou", "32855968")).toBe("checksum")
    for (const first7 of ["0000003", "3000000", "5999999", "6000000"]) {
      const code = `${first7}${String(edrpouCheckDigit(first7))}`
      expect(validateUaId("edrpou", code), code).toBeNull()
    }
  })

  it("довжина й зайві символи", () => {
    expect(validateUaId("edrpou", "1234567")).toBe("length")
    expect(validateUaId("edrpou", "123456789")).toBe("length")
    expect(validateUaId("edrpou", "3285596A")).toBe("length")
    expect(validateUaId("edrpou", "")).toBeNull()
  })
})

describe("РНОКПП", () => {
  it("контрольна цифра", () => {
    expect(validateUaId("rnokpp", "1759013776")).toBeNull()
    expect(validateUaId("rnokpp", "1759013770")).toBe("checksum")
    expect(validateUaId("rnokpp", "25 30 41 40 71")).toBeNull()
    expect(rnokppCheckDigit("175901377")).toBe(6)
  })
})

describe("ІПН платника ПДВ", () => {
  it("контрольна цифра (номер ПриватБанку з privatbank.ua)", () => {
    expect(validateUaId("vatIpn", "143605704021")).toBeNull()
    expect(validateUaId("vatIpn", "143605704022")).toBe("checksum")
    expect(vatIpnCheckDigit("14360570402")).toBe(1)
    expect(validateUaId("vatIpn", "14360570402")).toBe("length")
  })
})

describe("IBAN UA", () => {
  const iban = "UA213223130000026007233566001"

  it("mod 97, країна й довжина", () => {
    expect(validateUaId("iban", iban)).toBeNull()
    expect(
      validateUaId("iban", "ua21 3223 1300 0002 6007 2335 6600 1"),
    ).toBeNull()
    expect(validateUaId("iban", "UA213223130000026007233566002")).toBe(
      "checksum",
    )
    expect(validateUaId("iban", "PL61109010140000071219812874")).toBe("country")
    expect(validateUaId("iban", "UA21322313000002600723356600")).toBe("length")
  })

  it("нормалізація, групування й МФО", () => {
    expect(
      normalizeUaId("iban", " ua21-3223 1300 0002 6007 2335 6600 1 "),
    ).toBe(iban)
    expect(normalizeUaId("iban", "213223130000026007233566001")).toBe(iban)
    expect(normalizeUaId("iban", "")).toBe("")
    expect(formatIban(iban)).toBe("UA21 3223 1300 0002 6007 2335 6600 1")
    expect(ibanBankCode(iban)).toBe("322313")
  })
})
