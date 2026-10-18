"use client"

import * as React from "react"
import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox"
import { ChevronDownIcon } from "lucide-react"

import {
  choiceLabel,
  isPrintableKey,
  MultiSelectClear,
  MultiSelectResults,
  MultiSelectValue,
  sameChoice,
  useChoices,
  type Choice,
} from "@/registry/erp/multi-select-parts"
import { useBreakpoint } from "@/registry/hooks/use-breakpoint"
import { useErpUiT } from "@/registry/lib/i18n"
import { cn } from "@/registry/lib/utils"
import { Button } from "@/registry/ui/button"
import {
  Combobox,
  ComboboxContent,
  ComboboxInput,
} from "@/registry/ui/combobox"
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/registry/ui/sheet"
import { Textarea } from "@/registry/ui/textarea"

/**
 * Мультивибір із довідника (UI40, ADR-0027): кілька значень із короткого списку в пам'яті —
 * сегменти, теги, ролі. Мультивибір із пошуком на сервері — пізніше (`erp/record-picker` — один
 * запис).
 *
 * - Поле — кнопка (`role=combobox`) з вибраними значеннями мітками; список із пошуком — поверх
 *   сторінки, на телефоні — у нижній шторці з «Готово» (SPEC §9, UI38). Пошук — за підписом.
 * - Значення — масив `value` варіантів у порядку вибору. Вибір і зняття — у списку (клік, Enter),
 *   список після вибору не закривається; «Очистити» прибирає все, фокус лишається на полі. Літера на
 *   закритому полі відкриває пошук із неї.
 * - Вибране значення, якого немає в довіднику (видалили), — мітка з ключем і варіант угорі списку з
 *   поясненням: його можна зняти.
 * - Стани: порожнє, заповнене, довідник вантажиться, помилка (`aria-invalid`), лише читання (текст
 *   у полі, що лишається у фокусі, SPEC §8.3), вимкнено; у списку — довідник порожній, нічого не
 *   знайдено, не завантажився (причина й «Спробувати ще»). Кількість збігів і вибраних чує
 *   скрінрідер (Combobox.Status).
 */

export interface MultiSelectOption {
  readonly value: string
  readonly label: string
  /** Другий рядок варіанта. */
  readonly description?: string
}

export interface MultiSelectProps {
  /** Варіанти довідника; `undefined` — ще вантажаться. */
  options: readonly MultiSelectOption[] | undefined
  /** Вибрані значення в порядку вибору. */
  value: readonly string[]
  onValueChange: (value: string[]) => void
  /** Назва поля: заголовок шторки на телефоні, назва пошуку й «Очистити». */
  label: string
  placeholder?: string
  searchPlaceholder?: string
  /** Довідник не завантажився: причина в списку (офлайн, немає доступу, збій). */
  error?: unknown
  /** «Спробувати ще» поруч із помилкою довідника. */
  onRetry?: () => void
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
  /** Кнопка поля: фокус на полі з помилкою (react-hook-form). */
  ref?: React.Ref<HTMLButtonElement>
  className?: string
}

const FIELD_CLASS =
  "flex min-h-control w-full min-w-0 items-center gap-2 rounded-lg border border-input bg-transparent px-2.5 text-start text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-popup-open:border-ring md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40"

/** Відкритий список, текст пошуку й вихід із поля (перевірка форми — коли список закрили). */
function useMultiSelectOpen({
  readOnly,
  disabled,
  onBlur,
  phone,
}: Pick<MultiSelectProps, "readOnly" | "disabled" | "onBlur"> & {
  phone: boolean
}) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  // Шторка чи список — як під час відкриття: поворот екрана посеред вибору не перемонтовує поле
  // (фокус не падає на body, а закриття списку й далі перевіряє поле).
  const [openedOnPhone, setOpenedOnPhone] = React.useState(phone)
  // Синхронно: blur кнопки, коли фокус іде в щойно відкритий список, — ще не вихід із поля.
  const openRef = React.useRef(false)
  const changeOpen = (next: boolean) => {
    if (next && (readOnly || disabled)) return
    if (!next && !openRef.current) return
    openRef.current = next
    setOpen(next)
    if (next) {
      setOpenedOnPhone(phone)
      return
    }
    setQuery("")
    onBlur?.()
  }
  // Base UI на закритому полі вибирав би варіант за першою літерою без списку — відкриваємо пошук.
  const onFieldKeyDown: NonNullable<
    ComboboxPrimitive.Trigger.Props["onKeyDown"]
  > = (event) => {
    if (!isPrintableKey(event)) return
    event.preventBaseUIHandler()
    event.preventDefault()
    setQuery(event.key)
    changeOpen(true)
  }
  const asSheet = open ? openedOnPhone : phone
  return { open, asSheet, query, setQuery, openRef, changeOpen, onFieldKeyDown }
}

export function MultiSelect(props: MultiSelectProps) {
  const {
    options,
    value,
    onValueChange,
    label,
    placeholder,
    searchPlaceholder,
    error,
    onRetry,
    clearable = false,
    required,
    readOnly,
    disabled,
    onBlur,
    ref,
    className,
  } = props
  const aria = {
    "aria-invalid": props["aria-invalid"],
    "aria-describedby": props["aria-describedby"],
  }
  const t = useErpUiT()
  const autoId = React.useId()
  const fieldId = props.id ?? autoId
  const sheetId = React.useId()
  const state = useMultiSelectOpen({
    readOnly,
    disabled,
    onBlur,
    phone: useBreakpoint() === "phone",
  })
  const { open, asSheet, query, changeOpen } = state
  const choices = useChoices(options, value, query)
  const isLoading = options === undefined && !error

  // Лише читання: усі вибрані текстом, що переноситься, — довгий перелік не обрізається.
  if (readOnly)
    return (
      <Textarea
        id={fieldId}
        readOnly
        rows={1}
        value={
          isLoading && value.length
            ? t("multiSelect.loading")
            : choices.selected.map(choiceLabel).join(", ") || "—"
        }
        className={cn("min-h-control resize-none", className)}
        {...aria}
      />
    )

  const canClear = clearable && value.length > 0 && !disabled
  const fieldProps = {
    id: fieldId,
    ref,
    className: FIELD_CLASS,
    onBlur: () => {
      if (!state.openRef.current) onBlur?.()
    },
    ...aria,
  }
  const fieldContent = (
    <>
      <MultiSelectValue
        selected={choices.selected}
        isLoading={isLoading}
        placeholder={placeholder ?? t("multiSelect.placeholder")}
        // Місце для «Очистити» між мітками й стрілкою.
        className={canClear ? "me-7" : undefined}
      />
      <ChevronDownIcon
        aria-hidden
        className="ms-auto size-4 shrink-0 text-muted-foreground"
      />
    </>
  )
  const root = {
    multiple: true as const,
    items: choices.shown,
    filter: null,
    value: choices.selected,
    onValueChange: (next: Choice[]) => {
      onValueChange(next.map((choice) => choice.value))
    },
    inputValue: query,
    onInputValueChange: state.setQuery,
    itemToStringLabel: choiceLabel,
    isItemEqualToValue: sameChoice,
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
      aria-label={t("multiSelect.search", { label })}
      placeholder={searchPlaceholder ?? t("multiSelect.searchPlaceholder")}
    />
  )
  const results = (
    <MultiSelectResults
      options={options}
      error={error}
      onRetry={onRetry}
      shown={choices.shown}
      total={choices.total}
      query={query}
      selected={value.length}
      // У шторці прокручується сам список (listbox), а не обгортка без фокусованих елементів.
      listClassName={
        asSheet ? "max-h-none min-h-0 flex-1 overflow-y-auto p-0" : undefined
      }
    />
  )

  const field = asSheet ? (
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
          <div className="flex min-h-0 flex-1 flex-col px-3">{results}</div>
        </Combobox>
        <SheetFooter>
          <Button
            type="button"
            onClick={() => {
              changeOpen(false)
            }}
          >
            {t("multiSelect.done")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  ) : (
    <Combobox {...root}>
      <ComboboxPrimitive.Trigger
        {...fieldProps}
        onKeyDown={state.onFieldKeyDown}
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
    <div data-slot="multi-select" className={cn("relative min-w-0", className)}>
      {field}
      {canClear ? (
        <MultiSelectClear
          label={label}
          fieldId={fieldId}
          onClear={() => {
            onValueChange([])
          }}
        />
      ) : null}
    </div>
  )
}
