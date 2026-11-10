import { describe, expect, it } from "vitest"

import { inheritedFieldValues } from "@/registry/lib/extension-fields"
import {
  NBU_QR_LIMITS,
  NBU_QR_URL_PREFIX,
  nbuPaymentQr,
  type PaymentQrInput,
} from "@/registry/lib/payment-qr"
import {
  invoicePaymentQr,
  paymentPurpose,
} from "@/registry/modules/K2-invoices/components/invoice-payment"
import type { InvoiceCard } from "@/registry/modules/K2-invoices/contract"
import { createInvoiceFixtures } from "@/registry/modules/K2-invoices/fixtures"

/**
 * QR-код оплати НБУ (lib/payment-qr, ADR-0070): формат 003 рядок за рядком, сума без зайвих нулів, UTF-8
 * у base64url, причини, чому коду немає; призначення платежу й QR рахунку модуля K2; значення полів
 * розширення з документа-підстави (inheritedFieldValues).
 */
const VALID: PaymentQrInput = {
  name: "ТОВ «Кавовий двір»",
  iban: "UA11 3052 9900 0002 6007 3158 2294 1",
  code: "41726300",
  amount: 150_005,
  currency: "UAH",
  purpose: "Оплата за рахунком № РХ-2026-0001 від 02.11.2026, без ПДВ",
}

/** Рядки платіжної інструкції з посилання: base64url → UTF-8 → рядки через LF. */
function linesOf(url: string): string[] {
  expect(url.startsWith(NBU_QR_URL_PREFIX)).toBe(true)
  const data = url.slice(NBU_QR_URL_PREFIX.length)
  expect(data).toMatch(/^[A-Za-z0-9_-]+$/)
  const binary = atob(data.replace(/-/g, "+").replace(/_/g, "/"))
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new TextDecoder().decode(bytes).split("\n")
}

const urlOf = (input: PaymentQrInput) => {
  const qr = nbuPaymentQr(input)
  if (!qr.ok) throw new Error(`expected QR, got ${qr.issue}`)
  return qr.url
}

describe("lib/payment-qr: формат НБУ 003", () => {
  it("17 рядків: службові, отримувач, IBAN без пробілів, сума, код, призначення", () => {
    expect(linesOf(urlOf(VALID))).toEqual([
      "BCD",
      "003",
      "1",
      "UCT",
      "",
      "ТОВ «Кавовий двір»",
      "UA113052990000026007315822941",
      "UAH1500.05",
      "41726300",
      "",
      "",
      VALID.purpose,
      "",
      "",
      "",
      "",
      "",
    ])
  })

  it("сума — гривні й копійки без зайвих нулів; без суми — порожнє поле", () => {
    const amountOf = (amount: number | null) =>
      linesOf(urlOf({ ...VALID, amount }))[7]
    expect(amountOf(150_000)).toBe("UAH1500")
    expect(amountOf(150_050)).toBe("UAH1500.5")
    expect(amountOf(1)).toBe("UAH0.01")
    expect(amountOf(null)).toBe("")
  })

  it("РНОКПП ФОП (10 цифр) — правильний код", () => {
    expect(nbuPaymentQr({ ...VALID, code: "3014578920" }).ok).toBe(true)
  })

  it("причини замість зламаного коду: валюта, IBAN, код, назва, призначення, сума", () => {
    const issueOf = (change: Partial<PaymentQrInput>) => {
      const qr = nbuPaymentQr({ ...VALID, ...change })
      return qr.ok ? null : qr.issue
    }
    expect(issueOf({ currency: "EUR" })).toBe("currency")
    expect(issueOf({ iban: "" })).toBe("iban")
    expect(issueOf({ iban: "UA113052990000026007315822942" })).toBe("iban")
    expect(issueOf({ code: "" })).toBe("code")
    expect(issueOf({ code: "41726301" })).toBe("code")
    expect(issueOf({ code: "4172630" })).toBe("code")
    expect(issueOf({ name: "  " })).toBe("name")
    expect(issueOf({ name: "Я".repeat(NBU_QR_LIMITS.name + 1) })).toBe("name")
    expect(issueOf({ name: "Я".repeat(NBU_QR_LIMITS.name) })).toBeNull()
    expect(issueOf({ purpose: "П".repeat(NBU_QR_LIMITS.purpose + 1) })).toBe(
      "purpose",
    )
    expect(issueOf({ amount: 0 })).toBe("amount")
    expect(issueOf({ amount: -100 })).toBe("amount")
    expect(issueOf({ amount: 100_000_000_000 })).toBe("amount")
    expect(issueOf({ amount: 1.5 })).toBe("amount")
  })
})

describe("модуль K2: QR і призначення рахунку", () => {
  const { invoices } = createInvoiceFixtures({ today: "2026-11-08" })
  const byStatus = (status: string) => {
    const found = invoices.find((invoice) => invoice.status === status)
    if (!found) throw new Error(`no ${status} invoice in fixtures`)
    return found
  }

  it("призначення: номер, дата й ПДВ у гривнях українською; без податку — «без ПДВ»", () => {
    const issued = byStatus("issued")
    const purpose = paymentPurpose(issued, issued.totals)
    expect(purpose).toMatch(
      /^Оплата за рахунком № РХ-2026-\d{4} від \d{2}\.\d{2}\.2026, у т\.ч\. ПДВ \d/u,
    )
    expect(
      paymentPurpose(issued, { ...issued.totals, tax: 0 }).endsWith("без ПДВ"),
    ).toBe(true)
  })

  it("QR — лише у виставленого з номером: сума до сплати й реквізити постачальника", () => {
    const issued = byStatus("issued")
    const qr = invoicePaymentQr(issued, issued.totals)
    if (!qr?.ok) throw new Error("expected QR of issued invoice")
    const lines = linesOf(qr.url)
    expect(lines[5]).toBe(issued.supplier.name)
    expect(lines[6]).toBe(issued.supplier.iban)
    expect(lines[8]).toBe(issued.supplier.code)
    expect(lines[11]).toBe(paymentPurpose(issued, issued.totals))
    for (const status of ["draft", "cancelled", "reversed", "reversal"])
      expect(invoicePaymentQr(byStatus(status), byStatus(status).totals)).toBe(
        null,
      )
  })

  it("постачальник без IBAN — причина `iban`, а не код", () => {
    const issued: InvoiceCard = byStatus("issued")
    const qr = invoicePaymentQr(
      { ...issued, supplier: { ...issued.supplier, iban: "" } },
      issued.totals,
    )
    expect(qr).toEqual({ ok: false, issue: "iban" })
  })
})

describe("lib/extension-fields: поля з документа-підстави", () => {
  const fields = [
    {
      id: "channel",
      type: "options" as const,
      label: { uk: "Канал", en: "Channel" },
      options: [{ value: "website", label: { uk: "Сайт", en: "Website" } }],
    },
    {
      id: "contract",
      type: "text" as const,
      label: { uk: "Договір", en: "Contract" },
    },
    {
      id: "priority",
      type: "number" as const,
      label: { uk: "Пріоритет", en: "Priority" },
    },
  ]

  it("бере значення поля з тим самим ключем, лише якщо воно підходить схемі поля нового документа", () => {
    expect(
      inheritedFieldValues(
        {
          channel: "website",
          contract: "№ 12/2026",
          priority: "high",
          manager: "u-olena",
        },
        fields,
      ),
    ).toEqual({ channel: "website", contract: "№ 12/2026" })
    // Варіанта немає в списку нового документа, порожні значення — не переносяться.
    expect(
      inheritedFieldValues({ channel: "phone", contract: null }, fields),
    ).toEqual({})
    expect(inheritedFieldValues({ channel: "website" })).toEqual({})
  })
})
