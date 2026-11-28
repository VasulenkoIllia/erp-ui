import { zodResolver } from "@hookform/resolvers/zod"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useMemo } from "react"
import { useForm } from "react-hook-form"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"

import {
  RecurrenceEditor,
  useRecurrenceMessages,
} from "@/registry/erp/recurrence-editor"
import { RecurrenceSummary } from "@/registry/erp/recurrence-summary"
import { whenI18nReady } from "@/registry/lib/i18n"
import type { Recurrence, RecurrenceRule } from "@/registry/lib/recurrence"
import {
  isRecurrenceUntilBeforeStart,
  recurrenceDraft,
  recurrenceDraftSchema,
  recurrenceFromDraft,
  type RecurrenceDraft,
} from "@/registry/lib/recurrence-draft"
import { setUserTimeZone } from "@/registry/lib/user-timezone"
import { createDemoI18n } from "@/i18n"

/** Редактор повтору (UI41, ADR-0104): поля, правило реченням, помилки біля полів. */
const KYIV = "Europe/Kyiv"

interface Values {
  recurrence: RecurrenceDraft
}

function Editor({
  start,
  recurrence = null,
  timeZone = KYIV,
  readOnly,
  onSubmit,
}: {
  start: string
  recurrence?: Recurrence | null
  timeZone?: string
  readOnly?: boolean
  onSubmit?: (value: Recurrence | null) => void
}) {
  const messages = useRecurrenceMessages()
  const schema = useMemo(
    () =>
      z
        .object({ recurrence: recurrenceDraftSchema(messages) })
        .superRefine((values, context) => {
          if (isRecurrenceUntilBeforeStart(values.recurrence, start))
            context.addIssue({
              code: "custom",
              path: ["recurrence", "until"],
              message: messages.untilBeforeStart(start),
            })
        }),
    [messages, start],
  )
  const form = useForm<Values>({
    mode: "onTouched",
    resolver: zodResolver(schema),
    defaultValues: { recurrence: recurrenceDraft(recurrence, start) },
  })
  return (
    <form
      noValidate
      onSubmit={(event) =>
        void form.handleSubmit((values) => {
          onSubmit?.(
            recurrenceFromDraft(values.recurrence, { start, timeZone }),
          )
        })(event)
      }
    >
      <RecurrenceEditor
        control={form.control}
        name="recurrence"
        start={start}
        timeZone={timeZone}
        label="Повтор"
        readOnly={readOnly}
      />
      <button type="submit">Зберегти</button>
    </form>
  )
}

const summary = () =>
  document.querySelector<HTMLElement>('[data-slot="recurrence-summary"]')

async function choose(name: string, option: string) {
  const user = userEvent.setup()
  await user.click(screen.getByRole("combobox", { name }))
  await user.click(await screen.findByRole("option", { name: option }))
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date("2026-11-30T10:00:00Z"))
  setUserTimeZone(KYIV)
})

afterEach(() => {
  vi.useRealTimers()
  setUserTimeZone(null)
})

describe("RecurrenceEditor", () => {
  it("правило з сервера читається в поля й назад без змін", async () => {
    const onSubmit = vi.fn()
    const recurrence = {
      start: "2026-12-05",
      rule: "FREQ=MONTHLY;BYMONTHDAY=5;COUNT=10",
      timeZone: KYIV,
    }
    render(
      <Editor start="2026-12-05" recurrence={recurrence} onSubmit={onSubmit} />,
    )
    expect(
      screen.getByRole("combobox", { name: "Повторювати" }),
    ).toHaveTextContent("Щомісяця")
    expect(screen.getByRole("combobox", { name: "Число" })).toHaveTextContent(
      "5",
    )
    expect(screen.getByRole("textbox", { name: "Скільки разів" })).toHaveValue(
      "10",
    )
    expect(summary()).toHaveTextContent("Щомісяця 5-го, 10 разів")
    expect(
      within(screen.getByRole("list", { name: "Найближчі повторення" }))
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(["5 груд. 2026", "5 січ. 2027", "5 лют. 2027"])

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Зберегти" }))
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(recurrence)
    })
  })

  it("щомісяця від 31-го: число з першого дня й пропуск названо", async () => {
    render(<Editor start="2027-01-31" />)
    expect(summary()).toBeNull()
    await choose("Повторювати", "Щомісяця")
    expect(screen.getByRole("combobox", { name: "Число" })).toHaveTextContent(
      "31",
    )
    expect(summary()).toHaveTextContent("Щомісяця 31-го")
    expect(summary()).toHaveTextContent(
      "У місяцях без 31-го числа повтору немає.",
    )
    await choose("Число", "Останній день")
    expect(summary()).toHaveTextContent("Щомісяця в останній день місяця")
    expect(summary()).not.toHaveTextContent("повтору немає")
  })

  it("скрінрідер чує правило після паузи, а не на першому показі", async () => {
    const announcer = () => document.getElementById("erp-ui-announcer")
    render(
      <Editor
        start="2027-01-31"
        recurrence={{ start: "2027-01-31", rule: "FREQ=DAILY", timeZone: KYIV }}
      />,
    )
    await new Promise((resolve) => setTimeout(resolve, 900))
    expect(announcer()?.textContent ?? "").toBe("")
    await choose("Повторювати", "Щомісяця")
    await waitFor(
      () => {
        expect(announcer()).toHaveTextContent(
          "Щомісяця 31-го У місяцях без 31-го числа повтору немає.",
        )
      },
      { timeout: 2000 },
    )
  })

  it("щороку 29 лютого — лише у високосні роки", async () => {
    render(<Editor start="2028-02-29" />)
    await choose("Повторювати", "Щороку")
    expect(screen.getByRole("combobox", { name: "Місяць" })).toHaveTextContent(
      "лютий",
    )
    expect(summary()).toHaveTextContent("Щороку 29 лютого")
    expect(summary()).toHaveTextContent("Лише у високосні роки")
  })

  it("щотижня: день першого дня вибрано, без жодного дня — помилка біля групи", async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    // 09.12.2026 — середа.
    render(<Editor start="2026-12-09" onSubmit={onSubmit} />)
    await choose("Повторювати", "Щотижня")
    const days = screen.getByRole("group", { name: "Дні тижня" })
    // Назва починається з видимого скорочення: голосове керування знаходить кнопку за ним.
    const wednesday = within(days).getByRole("button", { name: "Ср, середа" })
    expect(wednesday).toHaveAttribute("aria-pressed", "true")
    await user.click(within(days).getByRole("button", { name: "Пт, п'ятниця" }))
    expect(summary()).toHaveTextContent("Щотижня в середу і п'ятницю")

    await user.click(wednesday)
    await user.click(within(days).getByRole("button", { name: "Пт, п'ятниця" }))
    expect(await screen.findByText("Виберіть хоча б один день")).toBeVisible()
    expect(days).toHaveAccessibleDescription("Виберіть хоча б один день")
    expect(summary()).toHaveTextContent("Заповніть поля, щоб побачити правило.")
    await user.click(screen.getByRole("button", { name: "Зберегти" }))
    expect(onSubmit).not.toHaveBeenCalled()
    const monday = within(days).getByRole("button", { name: "Пн, понеділок" })
    await waitFor(() => {
      expect(monday).toHaveFocus()
    })
    expect(monday).toHaveAccessibleDescription("Виберіть хоча б один день")
  })

  it("число щороку підганяється під місяць: 31-ше в лютому й «останній день» зі щомісячного", async () => {
    render(<Editor start="2027-01-31" />)
    await choose("Повторювати", "Щомісяця")
    await choose("Число", "Останній день")
    await choose("Повторювати", "Щороку")
    expect(screen.getByRole("combobox", { name: "Число" })).toHaveTextContent(
      "31",
    )
    expect(summary()).toHaveTextContent("Щороку 31 січня")
    await choose("Місяць", "лютий")
    await waitFor(() => {
      expect(screen.getByRole("combobox", { name: "Число" })).toHaveTextContent(
        "29",
      )
    })
    expect(summary()).toHaveTextContent("Щороку 29 лютого")
    expect(summary()).toHaveTextContent("Лише у високосні роки")
    expect(screen.queryByText("У цьому місяці немає такого числа")).toBeNull()
  })

  it("неповне правило — блок лишається з підказкою, а не зникає", async () => {
    render(<Editor start="2026-12-09" />)
    await choose("Повторювати", "Щодня")
    expect(summary()).toHaveTextContent("Щодня")
    await choose("Закінчення", "До дати")
    expect(summary()).toHaveTextContent("Заповніть поля, щоб побачити правило.")
  })

  it("неповний перший день — підказка, а не «немає жодного повтору»", () => {
    render(
      <Editor
        start="2026-12-"
        recurrence={{ start: "2026-12-09", rule: "FREQ=DAILY", timeZone: KYIV }}
      />,
    )
    expect(summary()).toHaveTextContent(
      "Вкажіть перший день, щоб побачити найближчі повторення.",
    )
    expect(summary()).not.toHaveTextContent("немає жодного повтору")
  })

  it("день кінця раніше за перший день — помилка біля поля", async () => {
    const user = userEvent.setup()
    render(<Editor start="2026-12-09" />)
    await choose("Повторювати", "Щодня")
    await choose("Закінчення", "До дати")
    await user.type(
      screen.getByRole("textbox", { name: "Останній день повтору" }),
      "01122026",
    )
    await user.click(screen.getByRole("button", { name: "Зберегти" }))
    expect(
      await screen.findByText("Не раніше за перший день, 09.12.2026"),
    ).toBeVisible()
  })

  it("правило поза підмножиною лишається, поки не вибрали інше", async () => {
    const onSubmit = vi.fn()
    const recurrence = {
      start: "2026-12-08",
      rule: "FREQ=MONTHLY;BYDAY=2TU",
      timeZone: KYIV,
    }
    render(
      <Editor start="2026-12-08" recurrence={recurrence} onSubmit={onSubmit} />,
    )
    expect(
      screen.getByRole("combobox", { name: "Повторювати" }),
    ).toHaveTextContent("Інше правило")
    expect(
      screen.getByText(/якого тут не змінити: FREQ=MONTHLY;BYDAY=2TU/),
    ).toBeVisible()
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Зберегти" }))
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(recurrence)
    })
  })

  it("лише читання щотижня — реченням, без кнопок днів", () => {
    render(
      <Editor
        start="2026-12-07"
        readOnly
        recurrence={{
          start: "2026-12-07",
          rule: "FREQ=WEEKLY;BYDAY=MO,TH",
          timeZone: KYIV,
        }}
      />,
    )
    expect(screen.queryByRole("button", { name: /понеділок/ })).toBeNull()
    expect(summary()).toHaveTextContent("Щотижня в понеділок і четвер")
  })

  it("лише читання — реченням без полів", () => {
    render(
      <Editor
        start="2026-12-05"
        readOnly
        recurrence={{
          start: "2026-12-05",
          rule: "FREQ=DAILY;INTERVAL=3",
          timeZone: KYIV,
        }}
      />,
    )
    expect(screen.queryByRole("combobox")).toBeNull()
    expect(summary()).toHaveTextContent("Кожні 3 дні")
    expect(
      screen.queryByRole("list", { name: "Найближчі повторення" }),
    ).toBeNull()
  })

  it("перший день поза правилом названо разом із першим повторенням", () => {
    // 05.12.2026 — субота.
    render(
      <Editor
        start="2026-12-05"
        recurrence={{
          start: "2026-12-05",
          rule: "FREQ=WEEKLY;BYDAY=MO",
          timeZone: KYIV,
        }}
      />,
    )
    expect(summary()).toHaveTextContent(
      "5 груд. 2026 не підходить під правило, перше повторення буде 7 груд. 2026.",
    )
  })
})

describe("RecurrenceSummary", () => {
  const meeting: RecurrenceRule = {
    frequency: "weekly",
    interval: 2,
    weekdays: ["MO", "WE", "FR"],
    until: "2027-03-31",
  }

  it("з часом в іншому поясі: пояс названо, дати — у поясі користувача", () => {
    render(
      <RecurrenceSummary
        rule={meeting}
        context={{ start: "2026-12-07T09:00", timeZone: "America/New_York" }}
      />,
    )
    expect(summary()).toHaveTextContent(
      "Кожні 2 тижні в понеділок, середу і п'ятницю о 09:00 за поясом America/New_York, до 31.03.2027 включно",
    )
    expect(screen.getAllByRole("listitem")[0]).toHaveTextContent(
      "7 груд. 2026, 16:00",
    )
  })

  it("той самий пояс під іншою назвою не названо", () => {
    setUserTimeZone("Europe/Kiev")
    render(
      <RecurrenceSummary
        rule={{ frequency: "daily", interval: 1 }}
        context={{ start: "2026-12-07T09:00", timeZone: KYIV }}
        preview={0}
      />,
    )
    expect(summary()).toHaveTextContent("Щодня о 09:00")
    expect(summary()).not.toHaveTextContent("за поясом")
  })

  it("найближчі — від зараз: сьогоднішні 09:00, що вже минули, не показано", () => {
    // Зараз 30.11.2026 12:00 у Києві.
    render(
      <RecurrenceSummary
        rule={{ frequency: "daily", interval: 1 }}
        context={{ start: "2026-11-29T09:00", timeZone: KYIV }}
      />,
    )
    expect(
      screen.getAllByRole("listitem").map((item) => item.textContent),
    ).toEqual([
      "1 груд. 2026, 09:00",
      "2 груд. 2026, 09:00",
      "3 груд. 2026, 09:00",
    ])
  })

  it("усі повторення в минулому — так і сказано", () => {
    render(
      <RecurrenceSummary
        rule={{ frequency: "daily", interval: 1, count: 3 }}
        context={{ start: "2026-11-01", timeZone: KYIV }}
      />,
    )
    expect(summary()).toHaveTextContent("Усі повторення вже минули.")
    expect(screen.queryByRole("list")).toBeNull()
  })

  it("англійською", async () => {
    await whenI18nReady(createDemoI18n("en"))
    render(
      <>
        <RecurrenceSummary
          rule={{ frequency: "monthly", interval: 1, monthDay: 31, count: 1 }}
          context={{ start: "2027-01-31", timeZone: KYIV }}
          preview={0}
        />
        <RecurrenceSummary
          rule={{ frequency: "yearly", interval: 2, month: 2, monthDay: 29 }}
          context={{ start: "2028-02-29", timeZone: KYIV }}
          preview={0}
        />
        <RecurrenceSummary
          rule={{
            frequency: "weekly",
            interval: 1,
            weekdays: ["MO", "TU", "WE", "TH", "FR"],
          }}
          context={{ start: "2026-12-07T09:00", timeZone: KYIV }}
          preview={0}
        />
      </>,
    )
    const [monthly, yearly, workdays] = document.querySelectorAll(
      '[data-slot="recurrence-summary"]',
    )
    expect(monthly).toHaveTextContent(
      "Monthly on day 31, 1 time" + "Months without a 31st are skipped.",
    )
    expect(yearly).toHaveTextContent(
      "Every 2 years on 29 February" +
        "Leap years only: 29 February comes once every four years.",
    )
    expect(workdays).toHaveTextContent("Weekly on weekdays at 09:00")
  })
})
