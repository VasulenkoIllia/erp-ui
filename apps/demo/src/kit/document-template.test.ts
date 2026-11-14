import { describe, expect, it } from "vitest"

import { documentTemplateVariables } from "@/registry/erp/document-template-variables"
import {
  templateData,
  templateDetailOf,
  templateIssues,
  usedTemplateKeys,
  type TemplateDocument,
  type TemplateTag,
  type TemplateVariables,
} from "@/registry/lib/document-template"
import {
  createI18n,
  ERP_UI_NAMESPACE,
  LOCALES,
  type ErpUiTranslate,
} from "@/registry/lib/i18n"

import { DEMO_DOCUMENT } from "@/pages/document-generator-model"
import { DEMO_COUNTERPARTIES } from "@/pages/party-details-model"

/** Документ із шаблону (UI44, ADR-0087): мітки шаблону проти змінних, дані заповнення, змінні документа. */

const value = (name: string): TemplateTag => ({
  name,
  kind: "value",
  inner: [],
})
const section = (name: string, inner: TemplateTag[]): TemplateTag => ({
  name,
  kind: "section",
  inner,
})

const VARIABLES: TemplateVariables = {
  groups: [
    {
      id: "document",
      label: "Документ",
      variables: [
        { key: "number", label: "Номер", value: "РХ-1" },
        { key: "currency", label: "Валюта", value: "UAH" },
      ],
    },
    {
      id: "customer",
      label: "Покупець",
      variables: [
        { key: "customer.name", label: "Назва", value: "ТОВ «Зоря»" },
        { key: "customer.vatIpn", label: "ІПН", value: "" },
      ],
    },
  ],
  loops: [
    {
      key: "lines",
      label: "Рядки",
      columns: [
        { key: "name", label: "Назва" },
        { key: "total", label: "Сума" },
      ],
      rows: [
        { name: "Ноутбук", total: "10,00 ₴" },
        { name: "Миша", total: "2,00 ₴" },
      ],
    },
  ],
}

const ukT = () =>
  createI18n({ language: "uk" }).getFixedT(
    "uk",
    ERP_UI_NAMESPACE,
  ) as unknown as ErpUiTranslate

describe("мітки шаблону", () => {
  it("невідома мітка — помилка біля неї, у циклі — з назвою циклу; відомі й мітки документа в циклі — ні", () => {
    const tags = [
      value("number"),
      value("customer.director"),
      section("lines", [value("name"), value("currency"), value("sku")]),
      section("customer.vatIpn", [value("customer.vatIpn"), value("name")]),
    ]
    expect(templateIssues(tags, VARIABLES)).toEqual([
      { code: "unknown", tag: "customer.director" },
      { code: "unknown", tag: "sku", loop: "lines" },
      // Умова на значенні не відкриває колонок циклу.
      { code: "unknown", tag: "name" },
    ])
  })

  it("мітка з @ і невідомий блок — помилки; повтор тієї самої — одна", () => {
    const tags = [
      { name: "raw", kind: "raw", inner: [] } satisfies TemplateTag,
      section("items", [value("name")]),
      value("customer.director"),
      value("customer.director"),
    ]
    expect(templateIssues(tags, VARIABLES)).toEqual([
      { code: "raw", tag: "raw" },
      { code: "unknown", tag: "items" },
      { code: "unknown", tag: "name" },
      { code: "unknown", tag: "customer.director" },
    ])
  })

  it("форма бере лише мітки шаблону: значення й цикли", () => {
    const used = usedTemplateKeys(
      [value("number"), section("lines", [value("name")]), value("foo")],
      VARIABLES,
    )
    expect([...used.values]).toEqual(["number"])
    expect([...used.loops]).toEqual(["lines"])
  })
})

describe("дані заповнення", () => {
  it("значення — вкладено за шляхом мітки, виправлене — замість документа, цикли — копії рядків", () => {
    const data = templateData(VARIABLES, { "customer.name": "ТОВ «Схід»" })
    expect(data).toEqual({
      number: "РХ-1",
      currency: "UAH",
      customer: { name: "ТОВ «Схід»", vatIpn: "" },
      lines: [
        { name: "Ноутбук", total: "10,00 ₴" },
        { name: "Миша", total: "2,00 ₴" },
      ],
    })
    expect(data.lines).not.toBe(VARIABLES.loops[0]?.rows)
  })

  it("рядки й підсумки — лише з запису картки; запис списку — null", () => {
    expect(
      templateDetailOf({ id: "inv-1", number: "РХ-1", total: 100 }),
    ).toBeNull()
    const detail = templateDetailOf({
      id: "inv-1",
      lines: DEMO_DOCUMENT.lines,
      totals: DEMO_DOCUMENT.totals,
    })
    expect(detail?.lines).toHaveLength(3)
    expect(detail?.totals?.total).toBe(DEMO_DOCUMENT.total)
  })
})

describe("змінні документа", () => {
  const t = ukT()
  const languages = {
    sheet: { language: "uk" as const, locale: LOCALES.uk, t, isLoading: false },
    ui: { t, language: "uk" },
  }
  const document: TemplateDocument = {
    ...DEMO_DOCUMENT,
    parties: {
      ...DEMO_DOCUMENT.parties,
      contractor: {
        details: {
          ...DEMO_COUNTERPARTIES[0].party,
          name: "ТОВ «Зоряна логістика»",
          signerName: "Коваль Олена Вікторівна",
          representedBy: "директора Коваль Олени Вікторівни",
          basis: "Статуту",
        },
      },
    },
    fields: [
      ...(DEMO_DOCUMENT.fields ?? []),
      { key: "number", label: "Перекриття", value: "ні" },
      { key: "customer.extra", label: "З крапкою", value: "ні" },
      {
        key: "contract",
        label: { uk: "Договір", en: "Contract" },
        value: null,
      },
    ],
  }
  const variables = documentTemplateVariables(document, languages)
  const values = Object.fromEntries(
    variables.groups.flatMap((group) =>
      group.variables.map((item) => [item.key, item.value]),
    ),
  )

  it("документ: номер, дати, суми й прописом мовою документа", () => {
    expect(values.number).toBe("ЗМ-2026-0042")
    expect(values.date).toBe("14.11.2026")
    expect(values.dateLong).toBe("14 листопада 2026")
    expect(values.currency).toBe("UAH")
    expect(values.total).toMatch(/₴$/)
    expect(values.totalInWords).toMatch(/^[А-ЯІЇЄҐ].* гривень? \d{2} копій/u)
  })

  it("чернетка без номера — «без номера»", () => {
    const draft = documentTemplateVariables(
      { ...document, number: null },
      languages,
    )
    expect(draft.groups[0]?.variables[0]?.value).toBe("без номера")
  })

  it("сторони: поля реквізитів, сторона в тексті договору з роллю й підпис", () => {
    expect(values["customer.name"]).toBe("ТОВ «Північний вітер»")
    expect(values["customer.clause"]).toBe(
      "ТОВ «Північний вітер», в особі генерального директора Мельника Андрія Петровича, що діє на підставі Статуту (надалі «Покупець»)",
    )
    // Без підпису ролі — «Виконавець» за ключем ролі.
    expect(values["contractor.clause"]).toMatch(/\(надалі «Виконавець»\)$/)
    expect(values["contractor.signature"]).toBe("Олена КОВАЛЬ")
    expect(variables.groups.map((group) => group.label)).toEqual([
      "Документ",
      "Покупець",
      "Виконавець",
      "Інші поля",
    ])
  })

  it("документ без сторони ролі — ті самі мітки з порожніми значеннями, а не невідомі", () => {
    const withoutOurs = documentTemplateVariables(DEMO_DOCUMENT, languages)
    const contractor = withoutOurs.groups.find(
      (group) => group.id === "contractor",
    )
    expect(contractor?.label).toBe("Виконавець")
    expect(contractor?.variables.every((item) => item.value === "")).toBe(true)
    expect(
      templateIssues(
        [value("contractor.name"), value("contractor.clause")],
        withoutOurs,
      ),
    ).toEqual([])
  })

  it("інші поля: дата мовою документа, порожнє — порожньо; ключ кіта й ключ із крапкою не беруться", () => {
    const fields = variables.groups.find((group) => group.id === "fields")
    expect(fields?.variables).toEqual([
      expect.objectContaining({
        key: "dueDate",
        label: "Виконати до",
        value: "28.11.2026",
      }),
      expect.objectContaining({ key: "contract", label: "Договір", value: "" }),
    ])
  })

  it("рядки: лише товари й послуги з номером, кількістю, одиницею, ціною й сумами", () => {
    const [lines] = variables.loops
    expect(lines?.key).toBe("lines")
    expect(lines?.rows).toHaveLength(3)
    expect(lines?.rows[1]).toMatchObject({
      no: "2",
      name: "Налаштування робочих місць",
      quantity: "6",
      unit: "год",
      tax: "ПДВ 20%",
    })
    expect(lines?.rows[1]?.discount).toMatch(/₴$/)
    expect(lines?.rows[2]?.discount).toBe("")
  })
})
