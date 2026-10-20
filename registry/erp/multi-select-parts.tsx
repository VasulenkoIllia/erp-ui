import * as React from "react"
import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox"
import { XIcon } from "lucide-react"

import type {
  MultiSelectOption,
  MultiSelectProps,
} from "@/registry/erp/multi-select"
import { errorStateKind } from "@/registry/lib/api"
import { useErpUiT } from "@/registry/lib/i18n"
import { cn } from "@/registry/lib/utils"
import { Badge } from "@/registry/ui/badge"
import { Button } from "@/registry/ui/button"
import { ComboboxItem, ComboboxList } from "@/registry/ui/combobox"

/** Частина `erp/multi-select` (ADR-0027): варіанти, пошук у пам'яті, рядок стану, значення поля. */

/** Варіант списку: з довідника чи вибране значення, якого в довіднику немає (видалили). */
export type Choice = MultiSelectOption

export const sameChoice = (a: Choice, b: Choice) => a.value === b.value
export const choiceLabel = (choice: Choice) => choice.label

/** Збіг пошуку: підпис містить введене без урахування регістру. */
const matches = (choice: Choice, needle: string) =>
  choice.label.toLocaleLowerCase().includes(needle)

/**
 * Вибрані варіанти й показані в списку: значення, яких немає в завантаженому довіднику, — угорі
 * списку з поясненням, щоб їх можна було зняти; пошук — за підписом.
 */
export function useChoices(
  options: readonly MultiSelectOption[] | undefined,
  value: readonly string[],
  query: string,
) {
  const t = useErpUiT()
  // Вибрані — окремо від пошуку: значення Combobox не змінюється з кожною літерою.
  const { selected, all } = React.useMemo(() => {
    const byValue = new Map<string, Choice>(
      (options ?? []).map((option) => [option.value, option]),
    )
    const missing: Choice[] = options
      ? value
          .filter((item) => !byValue.has(item))
          .map((item) => ({
            value: item,
            label: item,
            description: t("multiSelect.missing"),
          }))
      : []
    return {
      selected: value.map(
        (item): Choice => byValue.get(item) ?? { value: item, label: item },
      ),
      all: [...missing, ...(options ?? [])],
    }
  }, [options, value, t])
  const shown = React.useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    return needle ? all.filter((choice) => matches(choice, needle)) : all
  }, [all, query])
  return { selected, shown, total: all.length }
}

/** Рядок стану списку для очей і скрінрідера; кількість збігів і вибраних — лише для скрінрідера. */
function useStatusText({
  options,
  error,
  shown,
  total,
  query,
  selected,
}: {
  options: MultiSelectProps["options"]
  error: unknown
  shown: number
  total: number
  query: string
  selected: number
}): { text: string; visible: boolean } {
  const t = useErpUiT()
  if (error)
    return { text: t(`multiSelect.${errorStateKind(error)}`), visible: true }
  if (!options) return { text: t("multiSelect.loading"), visible: true }
  if (total === 0) return { text: t("multiSelect.empty"), visible: true }
  if (shown === 0)
    return {
      text: t("multiSelect.emptyFor", { query: query.trim() }),
      visible: true,
    }
  return {
    text: `${t("multiSelect.found", { count: shown })}. ${t("multiSelect.selected", { count: selected })}`,
    visible: false,
  }
}

export function MultiSelectResults({
  options,
  error,
  onRetry,
  shown,
  total,
  query,
  selected,
  listClassName,
}: {
  options: MultiSelectProps["options"]
  error: unknown
  onRetry: (() => void) | undefined
  shown: readonly Choice[]
  total: number
  query: string
  selected: number
  listClassName?: string
}) {
  const t = useErpUiT()
  const status = useStatusText({
    options,
    error,
    shown: shown.length,
    total,
    query,
    selected,
  })
  return (
    <>
      <ComboboxPrimitive.Status
        className={cn(
          status.visible
            ? "px-2.5 py-1.5 text-sm text-muted-foreground"
            : "sr-only",
        )}
      >
        {status.text}
      </ComboboxPrimitive.Status>
      {/* Без Empty Base UI пускає Escape порожнього списку далі, і закривається діалог форми.
          Текст стану — у Status вище, тож Empty прихований. */}
      <ComboboxPrimitive.Empty hidden />
      {error && onRetry ? (
        <div className="px-2.5 pb-1.5">
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            {t("multiSelect.retry")}
          </Button>
        </div>
      ) : null}
      <ComboboxList className={listClassName}>
        {(choice: Choice) => (
          <ComboboxItem
            key={choice.value}
            value={choice}
            className="items-start py-1.5 pointer-coarse:min-h-touch"
          >
            <span className="min-w-0">
              <span className="block break-words">{choice.label}</span>
              {choice.description ? (
                <span className="block text-xs text-muted-foreground">
                  {choice.description}
                </span>
              ) : null}
            </span>
          </ComboboxItem>
        )}
      </ComboboxList>
    </>
  )
}

/** Значення в полі: мітки вибраних, завантаження довідника чи підказка порожнього поля. */
export function MultiSelectValue({
  selected,
  isLoading,
  placeholder,
  className,
}: {
  selected: readonly Choice[]
  isLoading: boolean
  placeholder: string
  className?: string
}) {
  const t = useErpUiT()
  if (!selected.length || isLoading)
    return (
      <span className={cn("min-w-0 truncate text-muted-foreground", className)}>
        {selected.length ? t("multiSelect.loading") : placeholder}
      </span>
    )
  return (
    <span className={cn("flex min-w-0 flex-wrap gap-1 py-1", className)}>
      {selected.map((choice) => (
        <Badge key={choice.value} variant="secondary" className="max-w-full">
          <span className="truncate">{choice.label}</span>
        </Badge>
      ))}
    </span>
  )
}

/** «Очистити» біля заповненого поля. */
export function MultiSelectClear({
  label,
  onClear,
}: {
  label: string
  onClear: () => void
}) {
  const t = useErpUiT()
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      className="absolute end-8 top-1/2 -translate-y-1/2"
      aria-label={t("multiSelect.clear", { label })}
      onClick={onClear}
    >
      <XIcon aria-hidden />
    </Button>
  )
}
