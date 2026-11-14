import * as React from "react"
import { ArrowDownToLineIcon } from "lucide-react"
import type { RaRecord } from "ra-core"
import { useWatch, type FieldValues, type UseFormReturn } from "react-hook-form"

import type { DocumentLineItem } from "@/registry/erp/document-line-fields"
import { DocumentLineRow } from "@/registry/erp/document-line-row"
import {
  DocumentLinesPreview,
  DocumentLinesPreviewTotals,
} from "@/registry/erp/document-lines-preview"
import type { DocumentLinesValues } from "@/registry/erp/document-lines-schema"
import {
  DocumentLinesSearch,
  type DocumentLineMatch,
} from "@/registry/erp/document-lines-search"
import {
  RepeatingRows,
  type RepeatingRowProps,
  type RepeatingRowsGroups,
  type RepeatingRowsHandle,
  type RepeatingRowsKind,
} from "@/registry/erp/repeating-rows"
import { VirtualRowsList } from "@/registry/erp/repeating-rows-virtual"
import { ShortcutKeys } from "@/registry/erp/shortcut-keys"
import {
  newDocumentLineId,
  type DocumentBodyLine,
  type DocumentLine,
  type DocumentLineTax,
  type DocumentLineUnit,
  type SavedDocumentTotals,
} from "@/registry/lib/document-lines"
import type { ExtensionField } from "@/registry/lib/extension-fields"
import { extensionFormValues } from "@/registry/lib/extension-form"
import { useErpUiT, useLanguage } from "@/registry/lib/i18n"
import { localizedText } from "@/registry/lib/auth"
import {
  ariaKeyShortcuts,
  isMacPlatform,
  matchesShortcut,
  SHORTCUTS,
} from "@/registry/lib/shortcuts"
import { cn } from "@/registry/lib/utils"
import { Button } from "@/registry/ui/button"

/**
 * Редактор рядків документа (UI05, ADR-0059): пропозиція, замовлення, рахунок. Група полів форми на
 * `erp/repeating-rows`, контракт рядка — `lib/document-lines`, підсумки — `lib/document-totals`.
 *
 * - Рядок: назва вільним текстом чи вибір запису з ресурсу проекту (`item`, підставляє назву, ціну,
 *   одиницю й податок), кількість, одиниця, ціна, знижка відсотком або сумою, податок, сума рядка.
 *   Під рядками — знижка на весь документ і підсумки за ставками.
 * - Контейнер від 56rem — таблиця: підписи колонок над рядками, у рядках — для скрінрідера. Вужчий —
 *   картки: на телефоні дві колонки, від 28rem — три. Горизонтальної прокрутки немає.
 * - Підсумки — попередній розрахунок у браузері; збережений документ у режимі лише для читання
 *   показує числа сервера (`savedTotals` і `totals` рядків), бо джерело правди — сервер (ADR-0056).
 * - Довідники одиниць і податків приходять варіантами (`units`, `taxes`): кіт не знає модуля A6, а
 *   модуль документа бере їх зі своїх ресурсів. Рядок зберігає знімок значення.
 * - Форма: `useForm({ mode: "onTouched", resolver: zodResolver(useDocumentLinesSchema(currency)) })`
 *   з полями `lines`, `discountPercent`, `discountAmount` (`DocumentLinesValues`); шапку модуль додає
 *   `safeExtend`. Додати, змінити й вилучити рядок можна лише з клавіатури, фокус веде `RepeatingRows`.
 *   Форма без `shouldUnregister`: друге поле знижки (відсоток чи сума) не показане, але лишається нулем.
 * - `readOnly` — поля лишаються у фокусі, кнопок немає (SPEC §8.3).
 * - Розділи й нотатки (UI05b, ADR-0060): рядки виду `section` і `note` серед рядків. Розділ має суму
 *   своїх рядків. Дії рядка — одним меню: підняти, опустити, вставити рядок, розділ чи нотатку нижче,
 *   вилучити. Підписи колонок стоять над таблицею, тож першим може бути рядок будь-якого виду.
 * - Багато рядків: кожен рядок підписаний на свої значення, підсумки рахуються нижчим пріоритетом, а від
 *   `virtualizeFrom` рядків малюються лише видимі (вікно сторінки, `erp/repeating-rows-virtual`). Варіанти
 *   `units`, `taxes` і `item` мають бути стабільними (`useMemo`), інакше перемальовуються всі рядки.
 *   Рядок поза екраном забуває вибраний вид нульової знижки; знижка зі значенням не губиться.
 * - Поля рядка поза екраном немає в DOM: форма — з `shouldFocusError: false` і `FormErrorSummary`, яке
 *   переводить на рядок із помилкою. У діалозі чи шторці з власною прокруткою малюються всі рядки.
 * - Поля розширення рядка (`lineFields`, ADR-0086): у рядку товару під назвою, підписи — під «Назва» над
 *   таблицею; новий рядок отримує їхні порожні значення.
 * - Великий документ з клавіатури (UI05d, ADR-0064): Ctrl+End з будь-якого місця рядків — на знижку
 *   документа повз рядки. Від `virtualizeFrom` рядків над рядками — пошук у рядках
 *   (`erp/document-lines-search`) і кнопка «До підсумків»; ⌘F/Ctrl+F у рядках ставить курсор у пошук,
 *   у самому полі пошуку — пошук браузера. Меню розділу переносить розділ разом із його рядками.
 */

export interface DocumentLinesEditorProps<
  TValues extends DocumentLinesValues,
  TItem extends RaRecord = RaRecord,
  TTransformed extends FieldValues = TValues,
> {
  form: UseFormReturn<TValues, unknown, TTransformed>
  /** Код валюти документа: знаки після коми й підпис суми. */
  currency: string
  /** Активні одиниці довідника: `id` і коротка назва для документа. */
  units: readonly (DocumentLineUnit & { id: string })[]
  /** Активні ставки довідника. */
  taxes: readonly DocumentLineTax[]
  item?: DocumentLineItem<TItem>
  /** Типові значення нового рядка: податок і одиниця з налаштувань довідників; `undefined` — порожнє. */
  newLine?: () => Partial<Omit<DocumentLine, "id">>
  /** Назва групи; за замовчуванням «Рядки документа». */
  label?: React.ReactNode
  description?: React.ReactNode
  maxLines?: number
  /** З якої кількості рядків малювати лише видимі; за замовчуванням — `VIRTUALIZE_FROM`. */
  virtualizeFrom?: number
  readOnly?: boolean
  savedTotals?: SavedDocumentTotals
  /** Поля розширення рядка товару (`useDocumentLineFields(...).fields`); стабільні між рендерами. */
  lineFields?: readonly ExtensionField[]
  className?: string
}

/**
 * Поріг віртуальних рядків (вікторина власника 03.11.2026, ADR-0060): до нього в DOM усі рядки (пошук
 * браузера знаходить будь-який), від нього — лише видимі. Дія меню перемальовує всі рядки нижче, і на
 * телефоні вже понад десяток рядків у DOM виходять за 200 мс.
 */
const VIRTUALIZE_FROM = 12

const EMPTY_LINE: Omit<DocumentLine, "id"> = {
  kind: "item",
  name: "",
  itemId: null,
  quantity: "1",
  unit: null,
  price: "",
  discountPercent: 0,
  discountAmount: 0,
  tax: null,
}

/** Новий рядок: типові значення поверх порожнього, `undefined` не стирає порожнє значення. */
const newLineOf = (
  defaults: Partial<Omit<DocumentLine, "id">> = {},
): DocumentLine => ({
  ...EMPTY_LINE,
  ...Object.fromEntries(
    Object.entries(defaults).filter(([, value]) => value !== undefined),
  ),
  id: newDocumentLineId(),
})

const isSectionLine = (line: DocumentBodyLine) => line.kind === "section"
const linesCount = (lines: readonly DocumentBodyLine[] | undefined) =>
  lines?.length ?? 0

const TOTALS = '[data-slot="document-lines-totals"]'

/** Перше поле підсумків — знижка документа: туди веде «До підсумків». */
function focusTotals(root: HTMLElement | null) {
  const field = root?.querySelector<HTMLElement>(
    `${TOTALS} :is(input:not([type=hidden]), textarea, button)`,
  )
  field?.focus()
  return Boolean(field)
}

/**
 * Клавіша лишається полю: Shift чи Alt (виділити до кінця), набір через IME, уже оброблена подія,
 * а Ctrl+End у багаторядковому тексті нотатки — «у кінець тексту».
 */
const isFieldKey = (event: KeyboardEvent, target: Element) =>
  event.shiftKey ||
  event.altKey ||
  event.isComposing ||
  event.defaultPrevented ||
  (event.key === "End" &&
    Boolean(
      target.closest(
        'textarea, [contenteditable]:not([contenteditable="false"])',
      ),
    ))

/** Колонки таблиці й сітка карток (порядок полів — `DocumentLineFields`). */
const ROW_GRID =
  "grid-cols-2 @md:grid-cols-3 @4xl:grid-cols-[minmax(8rem,2.8fr)_minmax(5rem,1fr)_minmax(5.5rem,1.3fr)_minmax(7rem,1.4fr)_minmax(9rem,1.5fr)_minmax(6.5rem,1.3fr)_minmax(6rem,1fr)]"

/** Підписи колонок таблиці в порядку полів рядка; сума — праворуч, як у рядках. */
function LinesHeader({
  lineFields,
}: {
  lineFields: readonly ExtensionField[] | undefined
}) {
  const t = useErpUiT()
  const { language } = useLanguage()
  const columns = [
    t("documentLines.quantity"),
    t("documentLines.unit"),
    t("documentLines.price"),
    t("documentLines.discount"),
    t("documentLines.tax"),
  ]
  return (
    <>
      <span className="text-sm leading-snug font-medium">
        {t("documentLines.name")}
        {lineFields?.map((field) => (
          <span
            key={field.id}
            className="block font-normal text-muted-foreground"
          >
            {localizedText(field.label, language) ?? field.id}
          </span>
        ))}
      </span>
      {columns.map((column) => (
        <span key={column} className="text-sm leading-snug font-medium">
          {column}
        </span>
      ))}
      <span className="text-end text-sm leading-snug font-medium">
        {t("documentLines.sum")}
      </span>
    </>
  )
}

export function DocumentLinesEditor<
  TValues extends DocumentLinesValues,
  TItem extends RaRecord = RaRecord,
  TTransformed extends FieldValues = TValues,
>({
  form,
  currency,
  units,
  taxes,
  item,
  newLine,
  label,
  description,
  maxLines,
  virtualizeFrom = VIRTUALIZE_FROM,
  readOnly = false,
  savedTotals,
  lineFields,
  className,
}: DocumentLinesEditorProps<TValues, TItem, TTransformed>) {
  const t = useErpUiT()
  // Поля редактора однакові в будь-якій формі документа: шапку модуля редактор не чіпає.
  const linesForm = form as unknown as UseFormReturn<DocumentLinesValues>
  const { control } = linesForm
  const defaults = React.useRef(newLine)
  React.useLayoutEffect(() => {
    defaults.current = newLine
  })
  // Стабільний рядок: `RepeatingRows` не перемальовує рядки, доки не змінились їхні пропси.
  const renderRow = React.useCallback(
    ({ index, rowLabel, readOnly: isReadOnly }: RepeatingRowProps) => (
      <DocumentLineRow
        form={linesForm}
        index={index}
        rowLabel={rowLabel}
        readOnly={isReadOnly}
        currency={currency}
        units={units}
        taxes={taxes}
        item={item}
        lineFields={lineFields}
      />
    ),
    [linesForm, currency, units, taxes, item, lineFields],
  )
  const lineDefaults = React.useMemo(
    () => (lineFields?.length ? extensionFormValues(lineFields) : undefined),
    [lineFields],
  )
  const extraKinds = React.useMemo<RepeatingRowsKind<DocumentBodyLine>[]>(
    () => [
      {
        addLabel: t("documentLines.addSection"),
        insertLabel: t("documentLines.insertSection"),
        newRow: () => ({ kind: "section", id: newDocumentLineId(), title: "" }),
      },
      {
        addLabel: t("documentLines.addNote"),
        insertLabel: t("documentLines.insertNote"),
        newRow: () => ({ kind: "note", id: newDocumentLineId(), text: "" }),
      },
    ],
    [t],
  )
  const virtualRows = React.useMemo(
    () => ({ from: virtualizeFrom, List: VirtualRowsList }),
    [virtualizeFrom],
  )
  const groups = React.useMemo<RepeatingRowsGroups<DocumentBodyLine>>(
    () => ({
      isHead: isSectionLine,
      labels: [
        t("documentLines.moveSectionUp"),
        t("documentLines.moveSectionDown"),
      ],
    }),
    [t],
  )
  const rootRef = React.useRef<HTMLDivElement>(null)
  const rowsRef = React.useRef<RepeatingRowsHandle>(null)
  const searchRef = React.useRef<HTMLInputElement>(null)
  // Лише кількість рядків: введення в рядках редактор не перемальовує.
  const count = useWatch({ control, name: "lines", compute: linesCount })
  const isLong = count >= virtualizeFrom
  const onFind = React.useCallback((match: DocumentLineMatch) => {
    rowsRef.current?.focusRow(match.index, match.field ?? undefined)
  }, [])
  const onKeyDown = React.useEffectEvent((event: KeyboardEvent) => {
    const { target } = event
    if (!(target instanceof Element) || isFieldKey(event, target)) return
    if (matchesShortcut(event, SHORTCUTS.documentTotals)) {
      if (!target.closest(TOTALS) && focusTotals(rootRef.current))
        event.preventDefault()
    } else if (
      isLong &&
      matchesShortcut(event, SHORTCUTS.documentSearch) &&
      target !== searchRef.current &&
      target.closest('[data-slot="repeating-rows"]')
    ) {
      event.preventDefault()
      searchRef.current?.focus()
      searchRef.current?.select()
    }
  })
  // Слухач на самому редакторі: меню й списки вибору стоять у порталі поза ним, там клавіші свої.
  React.useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const listener = (event: KeyboardEvent) => {
      onKeyDown(event)
    }
    root.addEventListener("keydown", listener)
    return () => {
      root.removeEventListener("keydown", listener)
    }
  }, [])
  const toolbar = isLong ? (
    <div
      data-slot="document-lines-toolbar"
      className="flex flex-wrap items-center gap-2"
    >
      <DocumentLinesSearch
        form={linesForm}
        onFind={onFind}
        inputRef={searchRef}
        className="min-w-0 flex-[1_1_16rem] @2xl:max-w-md"
      />
      <Button
        type="button"
        variant="outline"
        aria-keyshortcuts={ariaKeyShortcuts(
          SHORTCUTS.documentTotals,
          isMacPlatform(),
        )}
        onClick={() => {
          focusTotals(rootRef.current)
        }}
      >
        <ArrowDownToLineIcon aria-hidden />
        {t("documentLines.toTotals")}
        <span aria-hidden className="hidden @md:contents">
          <ShortcutKeys shortcut={SHORTCUTS.documentTotals} />
        </span>
      </Button>
    </div>
  ) : null
  return (
    <div
      ref={rootRef}
      data-slot="document-lines"
      className={cn("@container grid min-w-0 gap-4", className)}
    >
      <DocumentLinesPreview
        control={control}
        currency={currency}
        readOnly={readOnly}
      >
        <RepeatingRows
          control={control}
          name="lines"
          label={label ?? t("documentLines.label")}
          description={description}
          rowLabel={(index) => t("documentLines.row", { index: index + 1 })}
          addLabel={t("documentLines.add")}
          insertLabel={t("documentLines.insert")}
          newRow={() => ({
            ...lineDefaults,
            ...newLineOf(defaults.current?.()),
          })}
          extraKinds={extraKinds}
          empty={t("documentLines.empty")}
          maxRows={maxLines}
          canReorder
          rowActions="menu"
          columnHeader={<LinesHeader lineFields={lineFields} />}
          virtualRows={virtualRows}
          groups={groups}
          toolbar={toolbar}
          handleRef={rowsRef}
          readOnly={readOnly}
          tableFrom="4xl"
          rowClassName={ROW_GRID}
          renderRow={renderRow}
        />
        <DocumentLinesPreviewTotals
          form={linesForm}
          savedTotals={savedTotals}
          currency={currency}
          readOnly={readOnly}
        />
      </DocumentLinesPreview>
    </div>
  )
}
