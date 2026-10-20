import * as React from "react"

import { DateRangeInput } from "@/registry/erp/date-range-input"
import { MoneyInput } from "@/registry/erp/number-input"
import {
  clearFilters,
  filterIssue,
  readFilter,
  writeFilter,
  type FilterDefinition,
  type FilterDraft,
} from "@/registry/lib/filters"
import { useErpUiT } from "@/registry/lib/i18n"
import type { ListFilter } from "@/registry/lib/list-state"
import { Button } from "@/registry/ui/button"
import { Checkbox } from "@/registry/ui/checkbox"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/registry/ui/field"

/**
 * Форма панелі фільтрів FilterBar (UI03, ADR-0017): поля за описом фільтрів і «Застосувати».
 *
 * - Чернетка живе, поки панель відкрита: Escape чи клік поза нею — без змін у списку.
 * - «Застосувати» — один запит до сервера на всі зміни; «Очистити» лише спорожнює поля.
 * - Діапазон, у якому початок більший за кінець, не застосовується: помилка біля поля, фокус на
 *   ньому (SPEC §8.3, кнопка не вимикається).
 */

type Drafts = Record<string, FilterDraft>

const emptyDraft = (definition: FilterDefinition) => readFilter(definition, {})

export interface FilterPanelFormProps {
  filters: readonly FilterDefinition[]
  value: ListFilter
  onApply: (filter: ListFilter) => void
}

export function FilterPanelForm({
  filters,
  value,
  onApply,
}: FilterPanelFormProps) {
  const t = useErpUiT()
  const [drafts, setDrafts] = React.useState<Drafts>(() =>
    Object.fromEntries(filters.map((d) => [d.id, readFilter(d, value)])),
  )
  const [checked, setChecked] = React.useState(false)
  const draftOf = (definition: FilterDefinition) =>
    drafts[definition.id] ?? emptyDraft(definition)

  const submit = (event: React.SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    const invalid = filters.find((d) => filterIssue(draftOf(d)))
    if (invalid) {
      setChecked(true)
      event.currentTarget
        .querySelector<HTMLElement>(`[data-filter="${invalid.id}"] input`)
        ?.focus()
      return
    }
    onApply(
      filters.reduce(
        (next, definition) =>
          writeFilter(definition, next, draftOf(definition)),
        clearFilters(filters, value),
      ),
    )
  }

  return (
    <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
      {/* Поля прокручуються, а «Застосувати» завжди видно внизу панелі. */}
      <FieldGroup className="min-h-0 flex-1 gap-4 overflow-y-auto px-4 pb-4">
        {filters.map((definition) => (
          <div key={definition.id} data-filter={definition.id}>
            <FilterControl
              definition={definition}
              draft={draftOf(definition)}
              showIssue={checked}
              onChange={(draft) => {
                setDrafts((current) => ({ ...current, [definition.id]: draft }))
              }}
            />
          </div>
        ))}
      </FieldGroup>
      <div className="flex justify-end gap-2 border-t px-4 py-3">
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setChecked(false)
            setDrafts(
              Object.fromEntries(filters.map((d) => [d.id, emptyDraft(d)])),
            )
          }}
        >
          {t("filterBar.clearDraft")}
        </Button>
        <Button type="submit">{t("filterBar.apply")}</Button>
      </div>
    </form>
  )
}

interface ControlProps {
  definition: FilterDefinition
  draft: FilterDraft
  showIssue: boolean
  onChange: (draft: FilterDraft) => void
}

function FilterControl({
  definition,
  draft,
  showIssue,
  onChange,
}: ControlProps) {
  const t = useErpUiT()
  const ids = React.useId()
  const issue =
    showIssue && filterIssue(draft) ? t("filterBar.rangeIssue") : null

  if (definition.kind === "options" && draft.kind === "options") {
    const toggle = (option: string, on: boolean) => {
      const values = on
        ? [...draft.values, option]
        : draft.values.filter((v) => v !== option)
      onChange({ kind: "options", values })
    }
    return (
      <FieldSet className="gap-2">
        <FieldLegend variant="label" className="mb-0">
          {definition.label}
        </FieldLegend>
        {/* Відступ 8 px: прапорці 16 px мають зону 24 px без перетину (WCAG 2.5.8). */}
        <div className="space-y-2">
          {definition.options.map((option, index) => {
            const id = `${ids}-${String(index)}`
            return (
              <Field
                key={option.value}
                orientation="horizontal"
                className="pointer-coarse:min-h-touch"
              >
                <Checkbox
                  id={id}
                  checked={draft.values.includes(option.value)}
                  onCheckedChange={(on) => {
                    toggle(option.value, on)
                  }}
                />
                <FieldLabel htmlFor={id} className="font-normal">
                  {option.label}
                </FieldLabel>
              </Field>
            )
          })}
        </div>
      </FieldSet>
    )
  }

  if (definition.kind === "date-range" && draft.kind === "date-range") {
    const range =
      draft.from && draft.to ? { from: draft.from, to: draft.to } : null
    return (
      <Field data-invalid={issue ? true : undefined}>
        <FieldLabel htmlFor={ids}>{definition.label}</FieldLabel>
        <DateRangeInput
          id={ids}
          value={range}
          onValueChange={(next) => {
            onChange({
              kind: "date-range",
              from: next?.from ?? null,
              to: next?.to ?? null,
            })
          }}
          aria-invalid={issue ? true : undefined}
          aria-describedby={issue ? `${ids}-issue` : undefined}
        />
        {issue ? <FieldError id={`${ids}-issue`}>{issue}</FieldError> : null}
      </Field>
    )
  }

  if (definition.kind === "money-range" && draft.kind === "money-range") {
    const end = (key: "from" | "to") => (
      <Field data-invalid={issue ? true : undefined}>
        <FieldLabel htmlFor={`${ids}-${key}`} className="font-normal">
          {t(`filterBar.${key}`)}
        </FieldLabel>
        <MoneyInput
          id={`${ids}-${key}`}
          currency={definition.currency}
          value={
            draft[key] === null
              ? null
              : { amount: draft[key], currency: definition.currency }
          }
          onValueChange={(money) => {
            onChange({
              ...draft,
              [key]: money === null ? null : Number(money.amount),
            })
          }}
          aria-invalid={issue ? true : undefined}
          aria-describedby={issue ? `${ids}-issue` : undefined}
        />
      </Field>
    )
    return (
      <FieldSet className="gap-2">
        <FieldLegend variant="label" className="mb-0">
          {definition.label}
        </FieldLegend>
        <div className="grid grid-cols-2 gap-2">
          {end("from")}
          {end("to")}
        </div>
        {issue ? <FieldError id={`${ids}-issue`}>{issue}</FieldError> : null}
      </FieldSet>
    )
  }

  return null
}
