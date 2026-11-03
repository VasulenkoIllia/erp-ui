import * as React from "react"
import type { RaRecord } from "ra-core"
import type { FieldValues, UseFormReturn } from "react-hook-form"

import type { DocumentLineItem } from "@/registry/erp/document-line-fields"
import { DocumentLineRow } from "@/registry/erp/document-line-row"
import {
  DocumentLinesPreview,
  DocumentLinesPreviewTotals,
} from "@/registry/erp/document-lines-preview"
import type { DocumentLinesValues } from "@/registry/erp/document-lines-schema"
import {
  RepeatingRows,
  type RepeatingRowProps,
  type RepeatingRowsKind,
} from "@/registry/erp/repeating-rows"
import { VirtualRowsList } from "@/registry/erp/repeating-rows-virtual"
import type {
  DocumentBodyLine,
  DocumentLine,
  DocumentLineTax,
  DocumentLineUnit,
  SavedDocumentTotals,
} from "@/registry/lib/document-lines"
import { useErpUiT } from "@/registry/lib/i18n"
import { cn } from "@/registry/lib/utils"

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
  className?: string
}

/**
 * Поріг віртуальних рядків: до нього в DOM усі рядки (пошук браузера знаходить будь-який), від нього —
 * лише видимі. Звичайний рахунок має кілька десятків рядків і порогу не досягає.
 */
const VIRTUALIZE_FROM = 100

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

/** Тимчасовий id нового рядка; `getRandomValues`, бо `randomUUID` є лише на HTTPS. */
const newLineId = () =>
  `line-${Array.from(crypto.getRandomValues(new Uint32Array(2)), (part) =>
    part.toString(36),
  ).join("")}`

/** Новий рядок: типові значення поверх порожнього, `undefined` не стирає порожнє значення. */
const newLineOf = (
  defaults: Partial<Omit<DocumentLine, "id">> = {},
): DocumentLine => ({
  ...EMPTY_LINE,
  ...Object.fromEntries(
    Object.entries(defaults).filter(([, value]) => value !== undefined),
  ),
  id: newLineId(),
})

/** Колонки таблиці й сітка карток (порядок полів — `DocumentLineFields`). */
const ROW_GRID =
  "grid-cols-2 @md:grid-cols-3 @4xl:grid-cols-[minmax(8rem,2.8fr)_minmax(5rem,1fr)_minmax(5.5rem,1.3fr)_minmax(7rem,1.4fr)_minmax(9rem,1.5fr)_minmax(6.5rem,1.3fr)_minmax(6rem,1fr)]"

/** Підписи колонок таблиці в порядку полів рядка; сума — праворуч, як у рядках. */
function LinesHeader() {
  const t = useErpUiT()
  const columns = [
    t("documentLines.name"),
    t("documentLines.quantity"),
    t("documentLines.unit"),
    t("documentLines.price"),
    t("documentLines.discount"),
    t("documentLines.tax"),
  ]
  return (
    <>
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
      />
    ),
    [linesForm, currency, units, taxes, item],
  )
  const extraKinds = React.useMemo<RepeatingRowsKind<DocumentBodyLine>[]>(
    () => [
      {
        addLabel: t("documentLines.addSection"),
        insertLabel: t("documentLines.insertSection"),
        newRow: () => ({ kind: "section", id: newLineId(), title: "" }),
      },
      {
        addLabel: t("documentLines.addNote"),
        insertLabel: t("documentLines.insertNote"),
        newRow: () => ({ kind: "note", id: newLineId(), text: "" }),
      },
    ],
    [t],
  )
  const virtualRows = React.useMemo(
    () => ({ from: virtualizeFrom, List: VirtualRowsList }),
    [virtualizeFrom],
  )
  return (
    <div
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
          newRow={() => newLineOf(defaults.current?.())}
          extraKinds={extraKinds}
          empty={t("documentLines.empty")}
          maxRows={maxLines}
          canReorder
          rowActions="menu"
          columnHeader={<LinesHeader />}
          virtualRows={virtualRows}
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
