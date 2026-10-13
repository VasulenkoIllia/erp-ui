"use client"

import * as React from "react"
import { NumberFormatBase } from "react-number-format"

import { useErpUiT, useLanguage } from "@/registry/lib/i18n"
import {
  callingCodeOf,
  DEFAULT_PHONE_REGION,
  formatPhoneAsYouType,
  normalizePhone,
  phoneRegions,
  regionOfPhone,
} from "@/registry/lib/phone"
import { cn } from "@/registry/lib/utils"
import { Input } from "@/registry/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/registry/ui/select"

/** Країни, яких немає в списку вибору за замовчуванням (рішення власника 13.10.2026). */
export const PHONE_EXCLUDED_REGIONS = ["RU", "BY"] as const

/**
 * Телефон будь-якої країни (LC12): вибір країни + поле з маскою під час введення.
 *
 * - `value` / `onValueChange` — номер у E.164 ("+380671234567"); порожньо — "".
 * - Номер без «+» вважається номером `defaultRegion`: «067 123 45 67» → +380671234567.
 * - Країна в списку підлаштовується під введений код; вибір країни замінює код у номері.
 * - Перевірку робить форма: `validatePhone(value)` з `lib/phone`.
 */
type PhoneInputProps = Omit<
  React.ComponentProps<"input">,
  "value" | "defaultValue" | "type" | "onChange"
> & {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  /** Країна для номерів без «+». */
  defaultRegion?: string
  /** Країни, прибрані зі списку. */
  excludeRegions?: readonly string[]
}

function PhoneInput({
  value,
  defaultValue = "",
  onValueChange,
  defaultRegion = DEFAULT_PHONE_REGION,
  excludeRegions = PHONE_EXCLUDED_REGIONS,
  className,
  disabled,
  readOnly,
  ...props
}: PhoneInputProps) {
  const t = useErpUiT()
  const { locale } = useLanguage()
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [inner, setInner] = React.useState(defaultValue)
  const current = value ?? inner
  const [chosen, setChosen] = React.useState<string | null>(null)

  const regions = React.useMemo(
    () => phoneRegions(locale, { exclude: excludeRegions }),
    [locale, excludeRegions],
  )

  // Країна з номера; явно обрана країна має перевагу, поки код збігається (+1 — США чи Канада).
  const detected = current ? regionOfPhone(current) : defaultRegion
  const region =
    chosen &&
    detected &&
    callingCodeOf(chosen) === callingCodeOf(detected) &&
    current.startsWith(`+${String(callingCodeOf(chosen))}`)
      ? chosen
      : detected
  const listed = regions.find((r) => r.region === region)

  const change = (next: string) => {
    if (value === undefined) setInner(next)
    onValueChange?.(next)
  }

  const chooseRegion = (next: string | null) => {
    if (!next) return
    setChosen(next)
    const digits = current.replace(/\D/g, "")
    const oldCode = region ? String(callingCodeOf(region)) : ""
    const national =
      oldCode && digits.startsWith(oldCode) ? digits.slice(oldCode.length) : ""
    change(`+${String(callingCodeOf(next))}${national}`)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  return (
    <div data-slot="phone-input" className={cn("flex gap-2", className)}>
      <Select
        value={listed ? listed.region : null}
        onValueChange={chooseRegion}
        disabled={disabled}
        readOnly={readOnly}
      >
        <SelectTrigger aria-label={t("phone.country")} className="shrink-0">
          <SelectValue>
            {listed
              ? `${listed.region} +${String(listed.callingCode)}`
              : t("phone.country")}
          </SelectValue>
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false} className="max-h-80 w-72">
          {regions.map((r) => (
            <SelectItem key={r.region} value={r.region} label={r.name}>
              <span className="min-w-0 flex-1 truncate">{r.name}</span>
              <span className="shrink-0 text-muted-foreground tabular-nums">
                +{r.callingCode}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <NumberFormatBase
        customInput={Input}
        getInputRef={inputRef}
        value={current}
        valueIsNumericString
        format={formatPhoneAsYouType}
        removeFormatting={(v: string) => normalizePhone(v, defaultRegion)}
        isValidInputCharacter={(c: string) => /[\d+]/.test(c)}
        onValueChange={(values) => {
          if (values.value !== current) change(values.value)
        }}
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        disabled={disabled}
        readOnly={readOnly}
        {...props}
      />
    </div>
  )
}

export { PhoneInput, type PhoneInputProps }
