"use client"

import * as React from "react"

import { useErpUiT } from "@/registry/lib/i18n"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/registry/ui/combobox"

/**
 * Вибір часового поясу IANA з пошуком (SPEC §11): «(UTC+03:00) Europe/Kyiv». Список — з браузера
 * (`Intl.supportedValuesOf`), зсув — на сьогодні (з літнім часом). Застарілі назви (Europe/Kiev)
 * показуються сучасними.
 */

/** Застарілі назви ICU → сучасні. */
const RENAMED: Record<string, string> = {
  "Europe/Kiev": "Europe/Kyiv",
  "Europe/Uzhgorod": "Europe/Kyiv",
  "Europe/Zaporozhye": "Europe/Kyiv",
}

export interface TimezoneOption {
  value: string
  label: string
  /** Зсув у хвилинах — для сортування. */
  offset: number
}

function offsetOf(zone: string, at: Date): number {
  const name =
    new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      timeZoneName: "longOffset",
    })
      .formatToParts(at)
      .find((part) => part.type === "timeZoneName")?.value ?? "GMT"
  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(name)
  if (!m) return 0
  const minutes = Number(m[2]) * 60 + Number(m[3])
  return m[1] === "-" ? -minutes : minutes
}

function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? "−" : "+"
  const abs = Math.abs(minutes)
  const hh = String(Math.floor(abs / 60)).padStart(2, "0")
  const mm = String(abs % 60).padStart(2, "0")
  return `UTC${sign}${hh}:${mm}`
}

/** Усі пояси, відсортовані за зсувом, потім за назвою. */
export function timezoneOptions(at: Date = new Date()): TimezoneOption[] {
  const zones = new Set(
    (typeof Intl.supportedValuesOf === "function"
      ? Intl.supportedValuesOf("timeZone")
      : ["UTC", "Europe/Kyiv"]
    ).map((zone) => RENAMED[zone] ?? zone),
  )
  zones.add("UTC")
  return [...zones]
    .map((zone) => {
      const offset = offsetOf(zone, at)
      return {
        value: zone,
        label: `(${formatOffset(offset)}) ${zone.replace(/_/g, " ")}`,
        offset,
      }
    })
    .sort((a, b) => a.offset - b.offset || a.value.localeCompare(b.value))
}

/** Пояс браузера (сучасною назвою). */
export function browserTimezone(): string {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
  return RENAMED[zone] ?? zone
}

export function TimezoneSelect({
  id,
  value,
  onValueChange,
  className,
  ...aria
}: {
  id?: string
  value: string
  onValueChange: (value: string) => void
  className?: string
  "aria-invalid"?: boolean
  "aria-describedby"?: string
}) {
  const t = useErpUiT()
  const options = React.useMemo(() => timezoneOptions(), [])
  const selected =
    options.find((option) => option.value === (RENAMED[value] ?? value)) ?? null

  return (
    <Combobox
      items={options}
      value={selected}
      itemToStringLabel={(option: TimezoneOption) => option.label}
      isItemEqualToValue={(a: TimezoneOption, b: TimezoneOption) =>
        a.value === b.value
      }
      onValueChange={(option: TimezoneOption | null) => {
        if (option) onValueChange(option.value)
      }}
    >
      <ComboboxInput
        id={id}
        className={className}
        placeholder={t("timezone.placeholder")}
        {...aria}
      />
      <ComboboxContent>
        <ComboboxEmpty>{t("timezone.empty")}</ComboboxEmpty>
        <ComboboxList>
          {(option: TimezoneOption) => (
            <ComboboxItem key={option.value} value={option}>
              {option.label}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
