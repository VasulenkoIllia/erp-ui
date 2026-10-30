import { zodResolver } from "@hookform/resolvers/zod"
import { useQueryClient } from "@tanstack/react-query"
import { useMemo, useState } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { useErpAuthProvider } from "@/components/erp/auth-layout"
import { CurrencySelect } from "@/components/erp/currency-select"
import {
  FormField,
  keepFieldFocus,
  UnsavedChangesGuard,
} from "@/components/erp/form"
import { FormSelect } from "@/components/erp/form-select"
import { TimezoneSelect } from "@/components/erp/timezone-select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { useApiErrorMessage } from "@/hooks/use-api-error-message"
import { useHasPermission } from "@/hooks/use-me"
import { isApiError } from "@/lib/api"
import {
  COMPANY_QUERY_KEYS,
  DEFAULT_BASE_CURRENCY,
  DEFAULT_FISCAL_YEAR_START_MONTH,
  type CompanyProfile,
  type CompanyUpdate,
} from "@/lib/company"
import { currencyName } from "@/lib/currencies"
import { isLanguage, LANGUAGES, useErpUiT, useLanguage } from "@/lib/i18n"
import { LANGUAGE_NAMES } from "@/lib/language-names"

import { CURRENCIES, EXCHANGE_RATES } from "../contract"
import { useCompanyT } from "../use-company-t"

/**
 * Вкладка «Локалізація» (A1, ADR-0043): базова валюта, мова документів, часовий пояс, місяць початку
 * фінансового року. Форма на react-hook-form (ADR-0015); зміна — `PATCH /company` лише змінених полів.
 * Без `company:update` — значення текстом: вибір із пошуком не має режиму «лише читання», а текст
 * лишається доступним скрінрідеру (SPEC §8.3).
 */
const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1)

interface LocaleValues {
  baseCurrency: string
  language: string
  timezone: string
  fiscalYearStartMonth: string
}

const valuesOf = (profile: CompanyProfile): LocaleValues => ({
  baseCurrency: profile.baseCurrency ?? DEFAULT_BASE_CURRENCY,
  language: profile.language ?? "uk",
  timezone: profile.timezone ?? "Europe/Kyiv",
  fiscalYearStartMonth: String(
    profile.fiscalYearStartMonth ?? DEFAULT_FISCAL_YEAR_START_MONTH,
  ),
})

/** Мова інтерфейсу — назвою; іншу мову документів з бекенду показуємо кодом. */
const languageName = (code: string) =>
  isLanguage(code) ? LANGUAGE_NAMES[code] : code

const LOCALE_FIELDS = [
  "baseCurrency",
  "language",
  "timezone",
  "fiscalYearStartMonth",
] as const

/** Назва місяця у називному відмінку мовою інтерфейсу. */
function monthName(month: number, locale: string): string {
  const name = new Intl.DateTimeFormat(locale, {
    month: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(2026, month - 1, 1)))
  return name.charAt(0).toLocaleUpperCase(locale) + name.slice(1)
}

export function CompanyLocaleForm({ profile }: { profile: CompanyProfile }) {
  const canEdit = useHasPermission("company", "update")
  // Інша компанія — нова форма: незбережені правки не переходять до неї.
  return canEdit ? (
    <LocaleFields key={profile.id} profile={profile} />
  ) : (
    <LocaleSummary profile={profile} />
  )
}

function useMonthItems() {
  const { locale } = useLanguage()
  return useMemo(
    () =>
      MONTHS.map((month) => ({
        value: String(month),
        label: monthName(month, locale),
      })),
    [locale],
  )
}

function LocaleSummary({ profile }: { profile: CompanyProfile }) {
  const t = useCompanyT()
  const { locale } = useLanguage()
  const months = useMonthItems()
  const values = valuesOf(profile)
  const rows = [
    {
      label: t("locale.baseCurrency"),
      value: `${values.baseCurrency} · ${currencyName(values.baseCurrency, locale)}`,
    },
    {
      label: t("locale.language"),
      value: languageName(values.language),
    },
    { label: t("locale.timezone"), value: values.timezone },
    {
      label: t("locale.fiscalStart"),
      value: months.find((item) => item.value === values.fiscalYearStartMonth)
        ?.label,
    },
  ]
  return (
    <div className="space-y-4">
      <Alert>
        <AlertDescription>{t("locale.readOnly")}</AlertDescription>
      </Alert>
      <dl className="grid gap-x-4 gap-y-2 @lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        {rows.map((row) => (
          <div key={row.label} className="contents">
            <dt className="text-sm text-muted-foreground">{row.label}</dt>
            <dd className="min-w-0 text-sm break-words">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function LocaleFields({ profile }: { profile: CompanyProfile }) {
  const t = useCompanyT()
  const kitT = useErpUiT()
  const provider = useErpAuthProvider()
  const queryClient = useQueryClient()
  const errorMessage = useApiErrorMessage()
  const months = useMonthItems()
  const [failure, setFailure] = useState<string | null>(null)
  const schema = useMemo(
    () =>
      z.object({
        baseCurrency: z.string().min(1, kitT("validation.required")),
        language: z.string().min(1, kitT("validation.required")),
        timezone: z.string().min(1, kitT("validation.required")),
        fiscalYearStartMonth: z.string().min(1, kitT("validation.required")),
      }),
    [kitT],
  )
  const form = useForm<LocaleValues>({
    mode: "onTouched",
    resolver: zodResolver(schema),
    values: valuesOf(profile),
    resetOptions: { keepDirtyValues: true },
  })
  const languages = [
    ...new Set<string>([...LANGUAGES, valuesOf(profile).language]),
  ].map((language) => ({ value: language, label: languageName(language) }))
  const { dirtyFields, isDirty, isSubmitting } = form.formState

  /** Відмова сервера: відомі поля — помилка біля поля, решта — повідомлення над формою. */
  const showFailure = (error: unknown) => {
    const fields = (isApiError(error) && error.fieldErrors) || {}
    const known = LOCALE_FIELDS.filter((field) => fields[field])
    known.forEach((field, index) => {
      form.setError(
        field,
        { type: "server", message: t("locale.invalid") },
        { shouldFocus: index === 0 },
      )
    })
    if (!known.length || known.length < Object.keys(fields).length)
      setFailure(errorMessage(error))
    // Хтось щойно змінив компанію: свіжі значення під незбереженими правками людини.
    if (isApiError(error) && error.code === "conflict")
      void queryClient.invalidateQueries({
        queryKey: COMPANY_QUERY_KEYS.profile,
      })
  }

  const save = form.handleSubmit(async (values) => {
    setFailure(null)
    const patch: CompanyUpdate = {}
    if (dirtyFields.baseCurrency) patch.baseCurrency = values.baseCurrency
    if (dirtyFields.language) patch.language = values.language
    if (dirtyFields.timezone) patch.timezone = values.timezone
    if (dirtyFields.fiscalYearStartMonth)
      patch.fiscalYearStartMonth = Number(values.fiscalYearStartMonth)
    if (!Object.keys(patch).length) {
      toast.info(kitT("forms.noChanges"))
      return
    }
    try {
      await provider.company.update(patch)
      await queryClient.invalidateQueries({
        queryKey: COMPANY_QUERY_KEYS.profile,
      })
      // Бекенд міг перерахувати курси до нової базової валюти.
      if (patch.baseCurrency) {
        void queryClient.invalidateQueries({ queryKey: [CURRENCIES] })
        void queryClient.invalidateQueries({ queryKey: [EXCHANGE_RATES] })
      }
      form.reset(values)
      toast.success(t("locale.saved"))
    } catch (error) {
      showFailure(error)
    }
  })

  return (
    <form
      noValidate
      className="@container space-y-4"
      data-slot="company-locale-form"
      onSubmit={(event) => void save(event)}
    >
      <UnsavedChangesGuard when={isDirty} />
      {failure ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{failure}</AlertDescription>
        </Alert>
      ) : null}
      <div className="grid gap-4 @lg:grid-cols-2">
        <FormField
          control={form.control}
          name="baseCurrency"
          label={t("locale.baseCurrency")}
          description={t("locale.baseCurrencyHint")}
          render={({ field, control }) => (
            <CurrencySelect
              id={control.id}
              className="w-full"
              ref={field.ref}
              value={field.value}
              onValueChange={field.onChange}
              onBlur={field.onBlur}
              aria-invalid={control["aria-invalid"]}
              aria-describedby={control["aria-describedby"]}
            />
          )}
        />
        <FormField
          control={form.control}
          name="language"
          label={t("locale.language")}
          description={t("locale.languageHint")}
          render={({ field, control }) => (
            <FormSelect
              {...control}
              ref={field.ref}
              items={languages}
              value={field.value}
              onValueChange={field.onChange}
              onBlur={field.onBlur}
            />
          )}
        />
        <FormField
          control={form.control}
          name="timezone"
          label={t("locale.timezone")}
          description={t("locale.timezoneHint")}
          render={({ field, control }) => (
            <TimezoneSelect
              id={control.id}
              className="w-full"
              value={field.value}
              onValueChange={field.onChange}
              aria-invalid={control["aria-invalid"]}
              aria-describedby={control["aria-describedby"]}
            />
          )}
        />
        <FormField
          control={form.control}
          name="fiscalYearStartMonth"
          label={t("locale.fiscalStart")}
          description={t("locale.fiscalStartHint")}
          render={({ field, control }) => (
            <FormSelect
              {...control}
              ref={field.ref}
              items={months}
              value={field.value}
              onValueChange={field.onChange}
              onBlur={field.onBlur}
            />
          )}
        />
      </div>
      <Button
        type="submit"
        disabled={isSubmitting}
        focusableWhenDisabled
        onMouseDown={keepFieldFocus}
      >
        {isSubmitting ? <Spinner aria-hidden /> : null}
        {t("locale.save")}
      </Button>
    </form>
  )
}
