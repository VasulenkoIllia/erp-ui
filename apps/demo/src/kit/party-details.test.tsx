import { zodResolver } from "@hookform/resolvers/zod"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useForm } from "react-hook-form"
import { describe, expect, it, vi } from "vitest"
import { z } from "zod"

import {
  PartyDetailsFields,
  PartyRoleField,
  type PartyDetailsSource,
} from "@/registry/erp/party-details"
import { usePartyDetailsSchema } from "@/registry/erp/party-details-schema"
import {
  emptyPartyDetails,
  type PartyDetails,
  type PartyRole,
} from "@/registry/lib/document-parties"

import { DEMO_COUNTERPARTIES } from "@/pages/party-details-model"

/**
 * Крок UI45 (ADR-0068): поля сторони в формі — заповнення лише порожніх полів з підсумком для
 * скрінрідера, ФОП без посади й «в особі», підпис під ПІБ, лише читання, джерело без даних, перевірки.
 */

const LEGAL = DEMO_COUNTERPARTIES[0].party

function Harness({
  party = emptyPartyDetails(),
  source,
  readOnly,
  onSubmit = () => undefined,
}: {
  party?: PartyDetails
  source?: PartyDetailsSource
  readOnly?: boolean
  onSubmit?: (values: { party: PartyDetails }) => void
}) {
  const schema = usePartyDetailsSchema()
  const form = useForm<{ party: PartyDetails }>({
    mode: "onTouched",
    resolver: zodResolver(z.object({ party: schema })),
    defaultValues: { party },
  })
  return (
    <form
      noValidate
      onSubmit={(event) => void form.handleSubmit(onSubmit)(event)}
    >
      <PartyDetailsFields
        form={form}
        name="party"
        legend="Замовник"
        source={source}
        readOnly={readOnly}
      />
      <button type="submit">Зберегти</button>
    </form>
  )
}

const group = () => screen.getByRole("group", { name: "Замовник" })
/** Постійний live-регіон кіта (`lib/announce`). */
const announcer = () => document.getElementById("erp-ui-announcer")
const SOURCE = {
  label: "Заповнити з картки",
  unavailableReason: "Спершу виберіть контрагента",
}

describe("поля сторони документа", () => {
  it("«Заповнити з …» заповнює лише порожні поля й каже скільки, щоразу", async () => {
    const user = userEvent.setup()
    render(<Harness source={{ ...SOURCE, values: LEGAL }} />)
    await user.type(screen.getByLabelText("Повна назва"), "ТОВ «Мій варіант»")
    await user.click(screen.getByRole("button", { name: "Заповнити з картки" }))
    expect(screen.getByLabelText("Повна назва")).toHaveValue(
      "ТОВ «Мій варіант»",
    )
    expect(screen.getByLabelText("Код ЄДРПОУ")).toHaveValue(LEGAL.code)
    expect(screen.getByLabelText("Діє на підставі")).toHaveValue("Статуту")
    const filled = "Заповнено 11 порожніх полів. Те, що ви ввели, не змінено."
    expect(within(group()).getByText(filled)).toBeVisible()
    await waitFor(() => {
      expect(announcer()).toHaveTextContent(filled)
    })
    await user.click(screen.getByRole("button", { name: "Заповнити з картки" }))
    const nothing =
      "Порожніх полів, які можна заповнити, немає: нічого не змінено."
    expect(within(group()).getByText(nothing)).toBeVisible()
    await waitFor(() => {
      expect(announcer()).toHaveTextContent(nothing)
    })
    // Змінили поле — підсумок про заповнення вже неправда.
    await user.type(screen.getByLabelText("Адреса"), ", офіс 3")
    expect(within(group()).queryByText(nothing)).toBeNull()
  })

  it("у знімок ФОП не йдуть посада й «в особі», навіть введені до зміни виду", async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(
      <Harness
        party={{ ...LEGAL, kind: "fop", code: "3124567896" }}
        onSubmit={onSubmit}
      />,
    )
    await user.click(screen.getByRole("button", { name: "Зберегти" }))
    expect(onSubmit).toHaveBeenCalledWith(
      {
        party: {
          ...LEGAL,
          kind: "fop",
          code: "3124567896",
          signerPosition: "",
          representedBy: "",
        },
      },
      expect.anything(),
    )
  })

  it("ФОП: РНОКПП, без посади й «в особі»", () => {
    render(<Harness party={DEMO_COUNTERPARTIES[1].party} />)
    expect(screen.getByLabelText("РНОКПП (ІПН) ФОП")).toHaveValue("3124567896")
    expect(screen.queryByLabelText("Посада підписанта")).toBeNull()
    expect(screen.queryByLabelText("В особі (родовий відмінок)")).toBeNull()
    expect(
      screen.getByLabelText("Підписант (ПІБ)"),
    ).toHaveAccessibleDescription("Підпис на документах: Ірина БОНДАР")
  })

  it("під ПІБ — як підпишуть документ; порожнє — порядок слів", async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const name = screen.getByLabelText("Підписант (ПІБ)")
    expect(name).toHaveAccessibleDescription("Прізвище, ім'я, по батькові")
    await user.type(name, "Коваль Олена Вікторівна")
    expect(name).toHaveAccessibleDescription(
      "Підпис на документах: Олена КОВАЛЬ",
    )
  })

  it("лише читання: поля в фокусі без змін, кнопки заповнення немає", () => {
    render(
      <Harness party={LEGAL} readOnly source={{ ...SOURCE, values: LEGAL }} />,
    )
    expect(screen.getByLabelText("Повна назва")).toHaveAttribute("readonly")
    expect(screen.getByLabelText("Код ЄДРПОУ")).toHaveAttribute("readonly")
    expect(
      within(group()).queryByRole("button", { name: "Заповнити з картки" }),
    ).toBeNull()
  })

  it("джерело без даних — кнопка неактивна з причиною", () => {
    render(
      <Harness
        source={{
          label: "Заповнити з профілю компанії",
          unavailableReason: "Профіль компанії ще завантажується",
        }}
      />,
    )
    const fill = screen.getByRole("button", {
      name: "Заповнити з профілю компанії",
    })
    expect(fill).toHaveAttribute("aria-disabled", "true")
    expect(fill).toHaveAccessibleDescription(
      "Профіль компанії ще завантажується",
    )
  })

  it("помилки біля полів: без назви, хибний ЄДРПОУ, пошта; інший вид перевіряє код знову", async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<Harness onSubmit={onSubmit} />)
    await user.type(screen.getByLabelText("Код ЄДРПОУ"), "41234560")
    await user.type(screen.getByLabelText("Email"), "office@")
    await user.click(screen.getByRole("button", { name: "Зберегти" }))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByLabelText("Повна назва")).toHaveAccessibleDescription(
      /Заповніть це поле/,
    )
    expect(screen.getByLabelText("Код ЄДРПОУ")).toHaveAccessibleDescription(
      "Помилка в ЄДРПОУ: не збігається контрольна цифра",
    )
    expect(screen.getByLabelText("Email")).toHaveAccessibleDescription(
      "Перевірте значення",
    )
    await user.click(screen.getByRole("combobox", { name: "Вид" }))
    await user.click(await screen.findByRole("option", { name: "ФОП" }))
    expect(
      await screen.findByText("РНОКПП має містити 10 цифр"),
    ).toBeInTheDocument()
  })
})

function RoleHarness() {
  const form = useForm<{ ourRole: PartyRole }>({
    defaultValues: { ourRole: "contractor" },
  })
  return <PartyRoleField form={form} name="ourRole" />
}

describe("роль нашої компанії", () => {
  it("«Наша компанія в документі»: Замовник чи Виконавець", async () => {
    const user = userEvent.setup()
    render(<RoleHarness />)
    const role = screen.getByRole("combobox", {
      name: "Наша компанія в документі",
    })
    expect(role).toHaveTextContent("Виконавець")
    await user.click(role)
    await user.click(await screen.findByRole("option", { name: "Замовник" }))
    expect(role).toHaveTextContent("Замовник")
  })
})
