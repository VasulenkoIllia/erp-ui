import * as React from "react"
import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox"
import { PlusIcon } from "lucide-react"
import type { RaRecord } from "ra-core"

import {
  openSearchFromLetter,
  useFieldRef,
  type PickerFieldKeyDown,
} from "@/registry/erp/picker-field"
import type { RecordPickerProps } from "@/registry/erp/record-picker"
import { useHasPermission } from "@/registry/hooks/use-me"
import {
  useRecordById,
  useRecordSearch,
  type RecordById,
  type RecordSearch,
} from "@/registry/hooks/use-record-search"
import { errorStateKind, isApiError } from "@/registry/lib/api"
import { useFormat } from "@/registry/lib/format"
import { useErpUiT } from "@/registry/lib/i18n"
import { cn } from "@/registry/lib/utils"
import { Button } from "@/registry/ui/button"
import { ComboboxItem, ComboboxList } from "@/registry/ui/combobox"

/** Частина `erp/record-picker` (ADR-0023): стан поля, клавіші, варіанти списку, рядок стану й підпис. */

export interface PickerCreate {
  /** Дія прав ресурсу (ADR-0014); за замовчуванням `create`. */
  access?: string
  /** Чому недоступно без права: «Створювати організації може роль «Менеджер»». */
  deniedReason?: string
}

/** Варіант списку: запис або «Створити…». */
export type PickerItem<T> =
  { kind: "record"; record: T } | { kind: "create"; query: string }

export const sameItem = <T extends RaRecord>(
  a: PickerItem<T>,
  b: PickerItem<T>,
) =>
  a.kind === "record" &&
  b.kind === "record" &&
  String(a.record.id) === String(b.record.id)

/** Підпис поля: вибраний запис, завантаження чи причина, чому підпису немає. */
function useValueText<T extends RaRecord>(
  current: RecordById<T>,
  value: string | null,
  optionLabel: (record: T) => string,
): { label: string; muted: boolean } {
  const t = useErpUiT()
  if (value === null) return { label: "", muted: true }
  if (current.record)
    return { label: optionLabel(current.record), muted: false }
  if (current.isPending)
    return { label: t("recordPicker.loadingValue"), muted: true }
  if (current.isMissing)
    return { label: t("recordPicker.missing"), muted: true }
  // Як підпис у списку й шапці (`RecordLabel`): немає права читати довідник — не «збій».
  if (isApiError(current.error) && current.error.status === 403)
    return { label: t("recordPicker.valueForbidden"), muted: true }
  return { label: t("recordPicker.valueError"), muted: true }
}

/**
 * Рядок стану списку для очей і скрінрідера; «Знайдено N» — лише для скрінрідера. Поки на екрані
 * варіанти попереднього пошуку — «Шукаємо…», а не «нічого не знайдено» чи кількість старих збігів.
 */
function useStatusText<T>(search: RecordSearch<T>): {
  text: string
  visible: boolean
} {
  const t = useErpUiT()
  const format = useFormat()
  const shown = search.records.length
  if (search.error)
    return {
      text: t(`recordPicker.${errorStateKind(search.error)}`),
      visible: true,
    }
  if (search.isPending || search.isStale)
    return { text: t("recordPicker.searching"), visible: true }
  if (shown === 0)
    return {
      text: search.query
        ? t("recordPicker.emptyFor", { query: search.query })
        : t("recordPicker.empty"),
      visible: true,
    }
  if (search.total > shown)
    return {
      text: t("recordPicker.more", {
        shown: format.number(shown),
        total: format.number(search.total),
      }),
      visible: true,
    }
  return { text: t("recordPicker.found", { count: shown }), visible: false }
}

export function PickerResults<T extends RaRecord>({
  search,
  itemText,
  optionDescription,
  create,
  resource,
  listClassName,
}: {
  search: RecordSearch<T>
  itemText: (item: PickerItem<T>) => string
  optionDescription?: (record: T) => string | undefined
  create?: PickerCreate
  resource: string
  listClassName?: string
}) {
  const t = useErpUiT()
  const status = useStatusText(search)
  const canCreate = useHasPermission(resource, create?.access ?? "create")
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
      {/* Без Empty Base UI пускає Escape порожнього списку далі, і закривається діалог
          форми (ADR-0027). Текст стану — у Status вище, тож Empty прихований. */}
      <ComboboxPrimitive.Empty hidden />
      {search.error ? (
        <div className="px-2.5 pb-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={search.retry}
          >
            {t("recordPicker.retry")}
          </Button>
        </div>
      ) : null}
      <ComboboxList className={listClassName}>
        {(item: PickerItem<T>) => {
          const isCreate = item.kind === "create"
          const description = isCreate
            ? canCreate
              ? undefined
              : (create?.deniedReason ?? t("recordPicker.createDenied"))
            : optionDescription?.(item.record)
          return (
            <ComboboxItem
              key={isCreate ? "create" : String(item.record.id)}
              value={item}
              disabled={isCreate && !canCreate}
              className="items-start py-1.5 pointer-coarse:min-h-touch"
            >
              {isCreate ? <PlusIcon aria-hidden className="mt-0.5" /> : null}
              <span className="min-w-0">
                <span className="block break-words">{itemText(item)}</span>
                {description ? (
                  <span className="block text-xs text-muted-foreground">
                    {description}
                  </span>
                ) : null}
              </span>
            </ComboboxItem>
          )
        }}
      </ComboboxList>
    </>
  )
}

/** Клавіші поля й пошуку. */
function usePickerKeys({
  isStale,
  setQuery,
  open,
}: {
  isStale: boolean
  setQuery: (query: string) => void
  open: () => void
}) {
  const onFieldKeyDown: PickerFieldKeyDown = (event) => {
    openSearchFromLetter(event, (letter) => {
      setQuery(letter)
      open()
    })
  }
  // Enter на варіантах попереднього пошуку вибрав би запис не за текстом поля.
  const onSearchKeyDown: NonNullable<
    ComboboxPrimitive.Input.Props["onKeyDown"]
  > = (event) => {
    if (event.key !== "Enter" || !isStale) return
    event.preventBaseUIHandler()
    event.preventDefault()
  }
  return { onFieldKeyDown, onSearchKeyDown }
}

/** Варіанти списку: записи й «Створити…» з текстом пошуку; текст варіанта. */
function usePickerItems<T extends RaRecord>(
  records: readonly T[],
  offersCreate: boolean,
  typed: string,
  optionLabel: (record: T) => string,
) {
  const t = useErpUiT()
  const items = React.useMemo<PickerItem<T>[]>(() => {
    const options = records.map((record): PickerItem<T> => ({
      kind: "record",
      record,
    }))
    return offersCreate
      ? [...options, { kind: "create", query: typed }]
      : options
  }, [records, offersCreate, typed])
  const itemText = (item: PickerItem<T>) =>
    item.kind === "record"
      ? optionLabel(item.record)
      : item.query
        ? t("recordPicker.create", { query: item.query })
        : t("recordPicker.createNew")
  return { items, itemText }
}

/** Стан поля: список, пошук, значення й клавіші. */
export function useRecordPicker<T extends RaRecord>({
  resource,
  value,
  onValueChange,
  optionLabel,
  filter,
  sort,
  perPage,
  create,
  readOnly,
  disabled,
  onBlur,
  ref,
}: RecordPickerProps<T>) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const [picked, setPicked] = React.useState<T | null>(null)
  // Синхронно: blur кнопки, коли фокус іде в щойно відкритий список, — ще не вихід із поля.
  const openRef = React.useRef(false)
  const [fieldRef, setFieldRef] = useFieldRef(ref)
  const valueId = value || null
  const search = useRecordSearch<T>({
    resource,
    query,
    filter,
    sort,
    perPage,
    enabled: open,
  })
  const current = useRecordById<T>(resource, valueId, picked)
  const { items, itemText } = usePickerItems(
    search.records,
    create !== undefined,
    query.trim(),
    optionLabel,
  )
  const selected = React.useMemo<PickerItem<T> | null>(
    () => (current.record ? { kind: "record", record: current.record } : null),
    [current.record],
  )
  const text = useValueText(current, valueId, optionLabel)

  // Закрити список — вийти з поля (перевірка форми), крім «Створити…»: людина ще заповнює поле.
  // Base UI закриває список після вибору ще раз — його вже закрив `select`.
  const changeOpen = (next: boolean, leaving = true) => {
    if (next && (readOnly || disabled)) return
    if (!next && !openRef.current) return
    openRef.current = next
    setOpen(next)
    if (next) return
    setQuery("")
    if (leaving) onBlur?.()
  }
  const select = (item: PickerItem<T> | null) => {
    if (!item) return
    if (item.kind === "create") {
      changeOpen(false, false)
      create?.onCreate(item.query)
      return
    }
    setPicked(item.record)
    onValueChange(String(item.record.id), item.record)
    // Після нового значення: перевірка форми при виході з поля бачить уже його.
    changeOpen(false)
  }
  const keys = usePickerKeys({
    isStale: search.isStale,
    setQuery,
    open: () => {
      changeOpen(true)
    },
  })
  const clear = () => {
    setPicked(null)
    onValueChange(null, null)
    // Кнопка зникає разом зі значенням — фокус лишається на полі (WCAG 2.4.3).
    fieldRef.current?.focus()
  }
  return {
    open,
    query,
    setQuery,
    search,
    items,
    selected,
    text,
    valueId,
    openRef,
    setFieldRef,
    changeOpen,
    select,
    itemText,
    ...keys,
    clear,
  }
}
