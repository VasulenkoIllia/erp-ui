import { render, renderHook, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import {
  partyClause,
  partyRequisiteLines,
  PrintPartyDetails,
} from "@/registry/erp/print-requisites"
import { emptyPartyDetails } from "@/registry/lib/document-parties"
import { useErpUiT } from "@/registry/lib/i18n"

import { DEMO_COUNTERPARTIES } from "@/pages/party-details-model"

/**
 * Крок UI45 (ADR-0068): сторона на аркуші — реквізити без рядків без значення, юрособа й ФОП, текст
 * «в особі … що діє на підставі …», підпис «Олена КОВАЛЬ» під лінією.
 */

const [LEGAL, FOP] = DEMO_COUNTERPARTIES.map((c) => c.party)
const kitT = () => renderHook(() => useErpUiT()).result.current

describe("сторона на аркуші", () => {
  it("реквізити юрособи рядками: код, ІПН, IBAN групами й банк, адреса, контакти", () => {
    expect(partyRequisiteLines(LEGAL, kitT())).toEqual([
      "ЄДРПОУ 41234569, ІПН 412345626519",
      "IBAN UA22 3052 9900 0002 6001 2345 6789 0, АТ «Тестовий банк»",
      "61000, м. Харків, вул. Вітряна, 7",
      "Тел. +380577654321, office@vitr.example",
    ])
  })

  it("порожній реквізит не друкується рядком без значення; ФОП — РНОКПП", () => {
    const t = kitT()
    expect(partyRequisiteLines(FOP, t)).toEqual([
      "РНОКПП 3124567896",
      "IBAN UA44 3220 0100 0002 6007 6543 2100 1, АТ «Демо Банк»",
      "65000, м. Одеса, вул. Морська, 3",
      "bondar@fop.example",
    ])
    expect(
      partyRequisiteLines({ ...emptyPartyDetails(), code: " " }, t),
    ).toEqual([])
  })

  it("у тексті документа: «в особі» лише юрособи, порожнє пропускається", () => {
    const t = kitT()
    expect(partyClause(LEGAL, "Замовник", t)).toBe(
      "ТОВ «Північний вітер», в особі генерального директора Мельника Андрія Петровича, що діє на підставі Статуту (надалі «Замовник»)",
    )
    expect(
      partyClause({ ...FOP, representedBy: "директора" }, "Виконавець", t),
    ).toBe(
      "ФОП Бондар Ірина Олегівна, що діє на підставі Виписки з ЄДР (надалі «Виконавець»)",
    )
    expect(partyClause(emptyPartyDetails(), "Замовник", t)).toBe(
      "(надалі «Замовник»)",
    )
  })

  it("реквізити й підписи сторін: посада лише юрособи, підпис з ПІБ", () => {
    const { container } = render(
      <PrintPartyDetails
        parties={[
          { label: "Замовник", party: LEGAL },
          {
            label: "Виконавець",
            party: { ...FOP, signerPosition: "Директор" },
          },
        ]}
      />,
    )
    expect(
      screen.getByRole("heading", { name: "Реквізити й підписи сторін" }),
    ).toBeInTheDocument()
    const [customer, contractor] = Array.from(
      container.querySelectorAll<HTMLElement>(
        '[data-slot="print-party-details"] > div > div',
      ),
    )
    expect(within(customer).getByText("Генеральний директор")).toBeVisible()
    expect(within(customer).getByText("Андрій МЕЛЬНИК")).toBeVisible()
    expect(within(contractor).queryByText("Директор")).toBeNull()
    expect(within(contractor).getByText("Ірина БОНДАР")).toBeVisible()
    expect(within(contractor).queryByText(/ІПН/)).toBeNull()
  })
})
