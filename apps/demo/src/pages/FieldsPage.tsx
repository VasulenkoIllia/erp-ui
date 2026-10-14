import { useId, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

import {
  DateInput,
  TimeInput,
  useDateIssueText,
} from "@/registry/erp/date-input"
import { DateRangeInput } from "@/registry/erp/date-range-input"
import { MoneyInput, NumberInput } from "@/registry/erp/number-input"
import {
  addDays,
  calendarDateToDate,
  isTime,
  periodRange,
  toCalendarDate,
  todayIn,
  type CalendarDate,
  type DateRange,
} from "@/registry/lib/dates"
import { useFormat, type Money } from "@/registry/lib/format"
import { useErpUiT } from "@/registry/lib/i18n"
import { Calendar } from "@/registry/ui/calendar"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/registry/ui/field"

import { PageHeader } from "./PageHeader"
import { Section } from "./Section"

const usePageT = () => useTranslation("demo", { keyPrefix: "fieldsPage" }).t

/** Поле демо: підпис, керування, помилка або підказка зі збереженим значенням. */
function DemoField({
  label,
  error,
  hint,
  children,
}: {
  label: string
  error?: string | null
  hint?: ReactNode
  children: (props: {
    id: string
    "aria-invalid"?: true
    "aria-describedby": string
  }) => ReactNode
}) {
  const id = useId()
  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {children({
        id,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": `${id}-msg`,
      })}
      {error ? (
        <FieldError id={`${id}-msg`}>{error}</FieldError>
      ) : (
        <FieldDescription id={`${id}-msg`}>{hint}</FieldDescription>
      )}
    </Field>
  )
}

/** Поле дати з перевіркою при виході з поля (SPEC §8.3). */
function DateExample({
  label,
  initial = "",
  min,
  max,
  touchedFromStart = false,
  readOnly,
  disabled,
}: {
  label: string
  initial?: string
  min?: CalendarDate
  max?: CalendarDate
  touchedFromStart?: boolean
  readOnly?: boolean
  disabled?: boolean
}) {
  const t = usePageT()
  const issueText = useDateIssueText()
  const [value, setValue] = useState(initial)
  const [touched, setTouched] = useState(touchedFromStart)
  const error = touched ? issueText(value, { min, max }) : null
  return (
    <DemoField
      label={label}
      error={error}
      hint={t("stored", { value: value || "—" })}
    >
      {(aria) => (
        <DateInput
          {...aria}
          value={value}
          min={min}
          max={max}
          readOnly={readOnly}
          disabled={disabled}
          onValueChange={setValue}
          onBlur={() => {
            setTouched(true)
          }}
        />
      )}
    </DemoField>
  )
}

function DatesSection() {
  const t = usePageT()
  const { timeZone } = useFormat()
  const today = todayIn(timeZone)
  return (
    <Section title={t("dates.title")} description={t("dates.description")}>
      <div className="grid gap-4 @2xl:grid-cols-2">
        <DateExample label={t("dates.empty")} />
        <DateExample label={t("dates.filled")} initial="2026-10-13" />
        <DateExample
          label={t("dates.invalid")}
          initial="31.02.2026"
          touchedFromStart
        />
        <DateExample
          label={t("dates.bounded")}
          initial={addDays(today, -3)}
          min={today}
          max={addDays(today, 90)}
          touchedFromStart
        />
        <DateExample
          label={t("dates.readOnly")}
          initial="2026-10-13"
          readOnly
        />
        <DateExample
          label={t("dates.disabled")}
          initial="2026-10-13"
          disabled
        />
      </div>
    </Section>
  )
}

function TimeSection() {
  const t = usePageT()
  const kitT = useErpUiT()
  const [value, setValue] = useState("14:30")
  const [touched, setTouched] = useState(false)
  const error =
    touched && value && !isTime(value) ? kitT("validation.time.invalid") : null
  return (
    <Section title={t("time.title")} description={t("time.description")}>
      <DemoField
        label={t("time.start")}
        error={error}
        hint={t("stored", { value: value || "—" })}
      >
        {(aria) => (
          <TimeInput
            {...aria}
            value={value}
            onValueChange={setValue}
            onBlur={() => {
              setTouched(true)
            }}
          />
        )}
      </DemoField>
    </Section>
  )
}

function RangeSection() {
  const t = usePageT()
  const { timeZone } = useFormat()
  const [empty, setEmpty] = useState<DateRange | null>(null)
  const [month, setMonth] = useState<DateRange | null>(() =>
    periodRange("thisMonth", todayIn(timeZone)),
  )
  const stored = (range: DateRange | null) =>
    t("stored", { value: range ? `${range.from} … ${range.to}` : "null" })
  return (
    <Section title={t("range.title")} description={t("range.description")}>
      <div className="grid gap-4 @2xl:grid-cols-3">
        <DemoField label={t("range.any")} hint={stored(empty)}>
          {(aria) => (
            <DateRangeInput {...aria} value={empty} onValueChange={setEmpty} />
          )}
        </DemoField>
        <DemoField label={t("range.month")} hint={stored(month)}>
          {(aria) => (
            <DateRangeInput {...aria} value={month} onValueChange={setMonth} />
          )}
        </DemoField>
        <DemoField label={t("range.readOnly")} hint={stored(month)}>
          {(aria) => (
            <DateRangeInput
              {...aria}
              value={month}
              onValueChange={setMonth}
              readOnly
            />
          )}
        </DemoField>
      </div>
    </Section>
  )
}

function CalendarSection() {
  const t = usePageT()
  const format = useFormat()
  const [day, setDay] = useState<CalendarDate>("2026-10-13")
  const [range, setRange] = useState<DateRange>({
    from: "2026-10-05",
    to: "2026-10-16",
  })
  return (
    <Section
      title={t("calendar.title")}
      description={t("calendar.description")}
    >
      <div className="flex flex-wrap gap-6">
        <div className="space-y-2">
          <Calendar
            mode="single"
            showWeekNumber
            aria-label={t("calendar.single")}
            className="rounded-lg border"
            defaultMonth={calendarDateToDate(day)}
            selected={calendarDateToDate(day)}
            onSelect={(date) => {
              if (date) setDay(toCalendarDate(date))
            }}
          />
          <p className="text-muted-foreground" aria-live="polite">
            {format.date(day, "long")}
          </p>
        </div>
        <div className="space-y-2">
          <Calendar
            mode="range"
            aria-label={t("calendar.range")}
            className="rounded-lg border"
            defaultMonth={calendarDateToDate(range.from)}
            selected={{
              from: calendarDateToDate(range.from),
              to: calendarDateToDate(range.to),
            }}
            onSelect={(next) => {
              if (next?.from)
                setRange({
                  from: toCalendarDate(next.from),
                  to: toCalendarDate(next.to ?? next.from),
                })
            }}
          />
          <p className="text-muted-foreground" aria-live="polite">
            {format.dateRange(range.from, range.to, "long")}
          </p>
        </div>
      </div>
    </Section>
  )
}

function NumbersSection() {
  const t = usePageT()
  const kitT = useErpUiT()
  const format = useFormat()
  const [uah, setUah] = useState<Money | null>({
    amount: 4_860_050,
    currency: "UAH",
  })
  const [usd, setUsd] = useState<Money | null>(null)
  const [quantity, setQuantity] = useState<number | null>(0)
  const [discount, setDiscount] = useState<number | null>(12.5)
  const money = (value: Money | null) =>
    t("stored", {
      value: value ? `${String(value.amount)} ${value.currency}` : "null",
    })
  const quantityError =
    quantity !== null && quantity < 1
      ? kitT("validation.number.min", { min: format.number(1) })
      : null
  return (
    <Section title={t("numbers.title")} description={t("numbers.description")}>
      <div className="grid gap-4 @2xl:grid-cols-2">
        <DemoField label={t("numbers.uah")} hint={money(uah)}>
          {(aria) => (
            <MoneyInput
              {...aria}
              currency="UAH"
              value={uah}
              onValueChange={setUah}
            />
          )}
        </DemoField>
        <DemoField label={t("numbers.usd")} hint={money(usd)}>
          {(aria) => (
            <MoneyInput
              {...aria}
              currency="USD"
              value={usd}
              onValueChange={setUsd}
            />
          )}
        </DemoField>
        <DemoField
          label={t("numbers.quantity")}
          error={quantityError}
          hint={t("stored", { value: String(quantity) })}
        >
          {(aria) => (
            <NumberInput
              {...aria}
              unit={t("numbers.pieces")}
              value={quantity}
              onValueChange={setQuantity}
            />
          )}
        </DemoField>
        <DemoField
          label={t("numbers.discount")}
          hint={t("stored", { value: String(discount) })}
        >
          {(aria) => (
            <NumberInput
              {...aria}
              unit="%"
              decimalScale={2}
              value={discount}
              onValueChange={setDiscount}
            />
          )}
        </DemoField>
        <DemoField label={t("numbers.readOnly")} hint={money(uah)}>
          {(aria) => (
            <MoneyInput
              {...aria}
              currency="UAH"
              value={uah}
              onValueChange={setUah}
              readOnly
            />
          )}
        </DemoField>
        <DemoField label={t("numbers.disabled")} hint={money(uah)}>
          {(aria) => (
            <MoneyInput
              {...aria}
              currency="UAH"
              value={uah}
              onValueChange={setUah}
              disabled
            />
          )}
        </DemoField>
      </div>
    </Section>
  )
}

export function FieldsPage() {
  const t = usePageT()
  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} lead={t("lead")} />
      <DatesSection />
      <RangeSection />
      <div className="grid grid-cols-1 items-start gap-6 @4xl:grid-cols-[1fr_2fr]">
        <TimeSection />
        <CalendarSection />
      </div>
      <NumbersSection />
    </div>
  )
}
