import { useId, useState } from "react"
import { useTranslation } from "react-i18next"

import { PhoneInput } from "@/registry/erp/phone-input"
import { UaIdInput, uaIdIssueKey } from "@/registry/erp/ua-id-input"
import {
  DATE_STYLES,
  isoWeek,
  pluralCategory,
  useFormat,
  type DateStyle,
} from "@/registry/lib/format"
import { useErpUiT } from "@/registry/lib/i18n"
import { validatePhone } from "@/registry/lib/phone"
import {
  ibanBankCode,
  normalizeUaId,
  validateUaId,
  type UaIdKind,
} from "@/registry/lib/ua-ids"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/registry/ui/field"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/registry/ui/table"

import { DEMO_NOW, DEMO_TIME_ZONE, LC12_SAMPLES } from "@/fixtures"

import { PageHeader } from "./PageHeader"
import { Section } from "./Section"

const usePageT = () => useTranslation("demo", { keyPrefix: "formatsPage" }).t

/** Числа для перевірки множини (SPEC §11) + дріб і число з розрядами. */
const PLURAL_SAMPLES = [1, 2, 5, 11, 21, 22, 25, 101, 1.5, 1234]

/** Момент для прикладів дат: неділя, 11 жовтня 2026, 14:30 за Києвом. */
const SAMPLE_INSTANT = "2026-10-11T11:30:00Z"
const SAMPLE_CALENDAR_DATE = "2026-01-01"

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const RELATIVE_OFFSETS = [
  -30_000,
  -5 * MINUTE,
  -3 * HOUR,
  -1 * DAY,
  -2 * DAY,
  -4 * DAY,
  -12 * DAY,
  -400 * DAY,
  2 * HOUR,
  1 * DAY,
]

/** Пари «підпис — значення» у дві колонки на ширших контейнерах. */
function ValueList({ rows }: { rows: { label: string; value: string }[] }) {
  return (
    <dl className="grid gap-x-6 gap-y-2 @lg:grid-cols-[auto_1fr]">
      {rows.map((row) => (
        <div key={row.label} className="contents">
          <dt className="text-muted-foreground">{row.label}</dt>
          <dd className="font-medium tabular-nums">{row.value}</dd>
        </div>
      ))}
    </dl>
  )
}

function PluralsSection() {
  const t = usePageT()
  const format = useFormat()
  return (
    <Section title={t("plurals.title")} description={t("plurals.description")}>
      <Table label={t("plurals.title")}>
        <TableHeader>
          <TableRow>
            <TableHead className="text-right">{t("plurals.number")}</TableHead>
            <TableHead>{t("plurals.category")}</TableHead>
            <TableHead>{t("plurals.text")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {PLURAL_SAMPLES.map((count) => (
            <TableRow key={count}>
              <TableCell className="text-right tabular-nums">
                {format.number(count)}
              </TableCell>
              <TableCell>
                <code>{pluralCategory(count, format.locale)}</code>
              </TableCell>
              <TableCell>{t("plurals.invoices", { count })}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Section>
  )
}

function NumbersSection() {
  const t = usePageT()
  const format = useFormat()
  return (
    <Section title={t("numbers.title")} description={t("numbers.description")}>
      <ValueList
        rows={[
          { label: t("numbers.number"), value: format.number(1234.5) },
          { label: t("numbers.percent"), value: format.percent(0.2) },
          {
            label: t("numbers.uah"),
            value: format.money({ amount: 4_860_000, currency: "UAH" }),
          },
          {
            label: t("numbers.negative"),
            value: format.money({ amount: -1_235_050, currency: "UAH" }),
          },
          {
            label: t("numbers.usd"),
            value: format.money({ amount: 120_000, currency: "USD" }),
          },
          {
            label: t("numbers.eur"),
            value: format.money({ amount: 99_990, currency: "EUR" }),
          },
          {
            label: t("numbers.big"),
            value: format.money({
              amount: 9_007_199_254_740_993n,
              currency: "UAH",
            }),
          },
        ]}
      />
    </Section>
  )
}

function DatesSection() {
  const t = usePageT()
  const format = useFormat()
  const week = isoWeek(SAMPLE_INSTANT, { timeZone: DEMO_TIME_ZONE })
  return (
    <Section title={t("dates.title")} description={t("dates.description")}>
      <ValueList
        rows={[
          ...(Object.keys(DATE_STYLES) as DateStyle[]).map((style) => ({
            label: t(`dates.styles.${style}`),
            value: format.date(SAMPLE_INSTANT, style, {
              timeZone: DEMO_TIME_ZONE,
            }),
          })),
          {
            label: t("dates.isoWeek"),
            value: t("dates.isoWeekValue", week),
          },
        ]}
      />
      <p className="text-muted-foreground">
        {t("dates.calendarDate", { value: SAMPLE_CALENDAR_DATE })}:{" "}
        <span className="font-medium text-foreground">
          {format.date(SAMPLE_CALENDAR_DATE, "long")}
        </span>
      </p>
    </Section>
  )
}

function RelativeSection() {
  const t = usePageT()
  const format = useFormat()
  const options = { now: DEMO_NOW, timeZone: DEMO_TIME_ZONE }
  return (
    <Section
      title={t("relative.title")}
      description={t("relative.description")}
    >
      <p className="text-muted-foreground">
        {t("relative.at", {
          now: format.date(DEMO_NOW, "dateTime", options),
        })}
      </p>
      <ValueList
        rows={RELATIVE_OFFSETS.map((offset) => {
          const moment = new Date(DEMO_NOW.getTime() + offset)
          return {
            label: format.date(moment, "dateTime", options),
            value: format.relative(moment, options),
          }
        })}
      />
    </Section>
  )
}

/** Поле LC12: перевірка після виходу з поля, далі — під час виправлення (SPEC §8.3). */
function IdField({ kind, initial }: { kind: UaIdKind; initial: string }) {
  const t = usePageT()
  const kitT = useErpUiT()
  const id = useId()
  const [value, setValue] = useState(normalizeUaId(kind, initial))
  // Приклад із помилкою показуємо одразу, ніби користувач уже вийшов із поля.
  const [touched, setTouched] = useState(validateUaId(kind, initial) !== null)
  const issue = touched ? validateUaId(kind, value) : null
  const bank = kind === "iban" ? ibanBankCode(value) : null
  return (
    <Field data-invalid={issue ? true : undefined}>
      <FieldLabel htmlFor={id}>{t(`ids.${kind}`)}</FieldLabel>
      <UaIdInput
        id={id}
        kind={kind}
        value={value}
        onValueChange={setValue}
        onBlur={() => {
          setTouched(true)
        }}
        aria-invalid={issue ? true : undefined}
        aria-describedby={`${id}-msg`}
      />
      {issue ? (
        <FieldError id={`${id}-msg`}>
          {kitT(uaIdIssueKey(kind, issue))}
        </FieldError>
      ) : (
        <FieldDescription id={`${id}-msg`}>
          {t("ids.stored", { value: value || "—" })}
          {bank ? ` · ${t("ids.bank", { code: bank })}` : ""}
        </FieldDescription>
      )}
    </Field>
  )
}

function PhoneField() {
  const t = usePageT()
  const kitT = useErpUiT()
  const id = useId()
  const [value, setValue] = useState(LC12_SAMPLES.phone)
  const [touched, setTouched] = useState(false)
  const issue = touched ? validatePhone(value) : null
  return (
    <Field data-invalid={issue ? true : undefined}>
      <FieldLabel htmlFor={id}>{t("ids.phone")}</FieldLabel>
      <PhoneInput
        id={id}
        value={value}
        onValueChange={setValue}
        onBlur={() => {
          setTouched(true)
        }}
        aria-invalid={issue ? true : undefined}
        aria-describedby={`${id}-msg`}
      />
      {issue ? (
        <FieldError id={`${id}-msg`}>
          {kitT(`validation.phone.${issue}`)}
        </FieldError>
      ) : (
        <FieldDescription id={`${id}-msg`}>
          {t("ids.stored", { value: value || "—" })}
        </FieldDescription>
      )}
    </Field>
  )
}

function IdsSection() {
  const t = usePageT()
  return (
    <Section title={t("ids.title")} description={t("ids.description")}>
      <div className="grid gap-4 @2xl:grid-cols-2">
        <IdField kind="edrpou" initial={LC12_SAMPLES.edrpou} />
        <IdField kind="rnokpp" initial={LC12_SAMPLES.rnokpp} />
        <IdField kind="vatIpn" initial={LC12_SAMPLES.vatIpn} />
        <IdField kind="iban" initial={LC12_SAMPLES.iban} />
        <PhoneField />
      </div>
    </Section>
  )
}

export function FormatsPage() {
  const t = usePageT()
  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} lead={t("lead")} />
      <div className="grid items-start gap-6 @4xl:grid-cols-2">
        <div className="@4xl:col-span-2">
          <IdsSection />
        </div>
        <PluralsSection />
        <NumbersSection />
        <DatesSection />
        <RelativeSection />
      </div>
    </div>
  )
}
