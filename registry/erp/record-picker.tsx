"use client"

import * as React from "react"
import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox"
import { ChevronDownIcon, XIcon } from "lucide-react"
import type { RaRecord, SortPayload } from "ra-core"

import {
  PickerResults,
  sameItem,
  useRecordPicker,
  type PickerCreate,
} from "@/registry/erp/record-picker-parts"
import { useBreakpoint } from "@/registry/hooks/use-breakpoint"
import { useErpUiT } from "@/registry/lib/i18n"
import type { ListFilter } from "@/registry/lib/list-state"
import { cn } from "@/registry/lib/utils"
import { Button } from "@/registry/ui/button"
import {
  Combobox,
  ComboboxContent,
  ComboboxInput,
} from "@/registry/ui/combobox"
import { Input } from "@/registry/ui/input"
import { InputGroupAddon } from "@/registry/ui/input-group"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/registry/ui/sheet"
import { Spinner } from "@/registry/ui/spinner"

/**
 * Вибір запису (UI40, ADR-0023): компанія для контакту, відповідальний, клієнт рахунку.
 *
 * - Поле — кнопка з підписом вибраного запису (`role=combobox`); список із пошуком відкривається
 *   поверх сторінки, на телефоні — у нижній шторці (SPEC §9, UI38): шторка залежить від ширини
 *   екрана, а не контейнера. Пошук — на сервері (`getList` з `q`), перша сторінка; більше збігів —
 *   «Показано 20 з 134. Уточніть пошук.» Літера на закритому полі відкриває пошук із неї.
 * - Поки на екрані варіанти попереднього пошуку, Enter нічого не вибирає: «Шукаємо…» до відповіді.
 * - Значення — `id` запису (порожній рядок — те саме, що `null`); підпис поля — з щойно вибраного
 *   запису або `getOne`. Запис видалили — «Запис не знайдено», і можна вибрати інший.
 * - «Створити…» (`create`) — останній варіант списку з текстом пошуку: проект відкриває свою форму й
 *   ставить новий запис у значення. Без права — варіант неактивний із причиною (SPEC §8.4).
 * - Стани: порожнє, заповнене, завантаження підпису, помилка (`aria-invalid`), лише читання (поле
 *   читається й лишається у фокусі, SPEC §8.3), вимкнено; у списку — пошук, нічого не знайдено,
 *   помилка з повтором, немає доступу, офлайн. Кількість збігів чує скрінрідер (Combobox.Status).
 * - Після «Очистити» фокус — на полі.
 */

export interface RecordPickerCreate extends PickerCreate {
  /** Відкрити форму створення з текстом пошуку; новий запис проект ставить у значення сам. */
  onCreate: (query: string) => void
}

export interface RecordPickerProps<T extends RaRecord> {
  /** Ресурс API (ADR-0002): `organizations`. */
  resource: string
  /** `id` вибраного запису. */
  value: string | null
  onValueChange: (id: string | null, record: T | null) => void
  /** Назва поля: заголовок шторки на телефоні й назва поля пошуку. */
  label: string
  /** Текст варіанта й значення поля. */
  optionLabel: (record: T) => string
  /** Другий рядок варіанта: код ЄДРПОУ, місто. */
  optionDescription?: (record: T) => string | undefined
  /** Постійні умови списку: лише активні, лише клієнти. */
  filter?: ListFilter
  sort?: SortPayload
  /** Скільки варіантів показати; за замовчуванням 20. */
  perPage?: number
  placeholder?: string
  searchPlaceholder?: string
  create?: RecordPickerCreate
  /** Кнопка «Очистити» біля заповненого поля. */
  clearable?: boolean
  required?: boolean
  /** Немає права змінювати — поле лише для читання (SPEC §8.3). */
  readOnly?: boolean
  disabled?: boolean
  id?: string
  "aria-invalid"?: boolean | "true" | "false"
  "aria-describedby"?: string
  /** Поле покинули: закрили список чи пішли з поля — для перевірки форми (react-hook-form). */
  onBlur?: () => void
  /**
   * Кнопка поля: фокус на полі з помилкою (react-hook-form) і після форми створення. Обидва — через
   * один callback-ref (приклад — демо «Вибір і реквізити»).
   */
  ref?: React.Ref<HTMLButtonElement>
  className?: string
}

const FIELD_CLASS =
  "flex h-control w-full min-w-0 items-center gap-2 rounded-lg border border-input bg-transparent px-2.5 text-start text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-popup-open:border-ring md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40"

export function RecordPicker<T extends RaRecord>(props: RecordPickerProps<T>) {
  const {
    resource,
    label,
    optionDescription,
    placeholder,
    searchPlaceholder,
    create,
    clearable = false,
    required,
    readOnly,
    disabled,
    id,
    onBlur,
    className,
    "aria-invalid": ariaInvalid,
    "aria-describedby": ariaDescribedBy,
  } = props
  const aria = {
    "aria-invalid": ariaInvalid,
    "aria-describedby": ariaDescribedBy,
  }
  const t = useErpUiT()
  const phone = useBreakpoint() === "phone"
  const picker = useRecordPicker(props)
  const sheetId = React.useId()
  const { open, search, text, valueId, changeOpen, openRef } = picker

  if (readOnly)
    return (
      <Input
        id={id}
        readOnly
        value={valueId === null ? "—" : text.label}
        className={className}
        {...aria}
      />
    )

  const canClear = clearable && valueId !== null && !disabled
  const fieldProps = {
    id,
    ref: picker.setFieldRef,
    className: FIELD_CLASS,
    onBlur: () => {
      if (!openRef.current) onBlur?.()
    },
    ...aria,
  }
  const fieldContent = (
    <>
      <span
        className={cn(
          "min-w-0 truncate",
          text.muted && "text-muted-foreground",
          // Місце для «Очистити» між підписом і стрілкою.
          canClear && "me-7",
        )}
      >
        {text.label || placeholder || t("recordPicker.placeholder")}
      </span>
      <ChevronDownIcon
        aria-hidden
        className="ms-auto size-4 shrink-0 text-muted-foreground"
      />
    </>
  )
  const root = {
    items: picker.items,
    filter: null,
    value: picker.selected,
    onValueChange: picker.select,
    inputValue: picker.query,
    onInputValueChange: picker.setQuery,
    itemToStringLabel: picker.itemText,
    isItemEqualToValue: sameItem,
    open,
    onOpenChange: (next: boolean) => {
      changeOpen(next)
    },
    required,
    disabled,
    autoHighlight: true,
  }
  const searchInput = (
    <ComboboxInput
      showTrigger={false}
      aria-label={t("recordPicker.search", { label })}
      placeholder={searchPlaceholder ?? t("recordPicker.searchPlaceholder")}
      onKeyDown={picker.onSearchKeyDown}
    >
      {search.isSearching && !search.isPending ? (
        <InputGroupAddon align="inline-end">
          <Spinner aria-hidden />
        </InputGroupAddon>
      ) : null}
    </ComboboxInput>
  )
  const results = (
    <PickerResults
      search={search}
      itemText={picker.itemText}
      optionDescription={optionDescription}
      create={create}
      resource={resource}
      // У шторці прокручується сам список (listbox), а не обгортка без фокусованих елементів.
      listClassName={
        phone ? "max-h-none min-h-0 flex-1 overflow-y-auto p-0" : undefined
      }
    />
  )

  const field = phone ? (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        changeOpen(next)
      }}
    >
      <SheetTrigger
        render={
          <button
            type="button"
            role="combobox"
            aria-expanded={open}
            aria-controls={sheetId}
            aria-required={required || undefined}
            disabled={disabled}
            {...fieldProps}
          />
        }
      >
        {fieldContent}
      </SheetTrigger>
      <SheetContent
        id={sheetId}
        side="bottom"
        className="max-h-[calc(100dvh-2rem)] gap-0" // erp-ui: allow-raw-value — відступ 1 rem від верху екрана, як у шторці фільтрів
      >
        <SheetHeader className="pb-2">
          <SheetTitle>{label}</SheetTitle>
        </SheetHeader>
        <Combobox {...root} inline>
          <div className="px-4 pb-2">{searchInput}</div>
          <div className="flex min-h-0 flex-1 flex-col px-3 pb-4">
            {results}
          </div>
        </Combobox>
      </SheetContent>
    </Sheet>
  ) : (
    <Combobox {...root}>
      <ComboboxPrimitive.Trigger
        {...fieldProps}
        onKeyDown={picker.onFieldKeyDown}
      >
        {fieldContent}
      </ComboboxPrimitive.Trigger>
      <ComboboxContent aria-label={label} className="min-w-72">
        {searchInput}
        {results}
      </ComboboxContent>
    </Combobox>
  )

  return (
    <div
      data-slot="record-picker"
      className={cn("relative min-w-0", className)}
    >
      {field}
      {canClear ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="absolute end-8 top-1/2 -translate-y-1/2"
          aria-label={t("recordPicker.clear", { label })}
          onClick={picker.clear}
        >
          <XIcon aria-hidden />
        </Button>
      ) : null}
    </div>
  )
}
