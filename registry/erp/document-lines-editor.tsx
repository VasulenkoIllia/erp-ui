import * as React from "react"
import type { RaRecord } from "ra-core"
import { useWatch, type FieldValues, type UseFormReturn } from "react-hook-form"

import {
  DocumentLineFields,
  type DocumentLineItem,
} from "@/registry/erp/document-line-fields"
import type { DocumentLinesValues } from "@/registry/erp/document-lines-schema"
import {
  DocumentLinesTotals,
  previewTotals,
} from "@/registry/erp/document-lines-totals"
import { RepeatingRows } from "@/registry/erp/repeating-rows"
import {
  savedDocumentLineSchema,
  type DocumentLine,
  type DocumentLineTax,
  type DocumentLineUnit,
  type SavedDocumentTotals,
} from "@/registry/lib/document-lines"
import type { Totals } from "@/registry/lib/document-totals"
import { currencyDigits } from "@/registry/lib/format"
import { useErpUiT } from "@/registry/lib/i18n"
import { cn } from "@/registry/lib/utils"

/**
 * Редактор рядків документа (UI05, ADR-0059): пропозиція, замовлення, рахунок. Група полів форми на
 * `erp/repeating-rows`, контракт рядка — `lib/document-lines`, підсумки — `lib/document-totals`.
 *
 * - Рядок: назва вільним текстом чи вибір запису з ресурсу проекту (`item`, підставляє назву, ціну,
 *   одиницю й податок), кількість, одиниця, ціна, знижка відсотком або сумою, податок, сума рядка.
 *   Під рядками — знижка на весь документ і підсумки за ставками.
 * - Контейнер від 56rem — таблиця: підписи видно над першим рядком, далі для скрінрідера. Вужчий —
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
  readOnly?: boolean
  savedTotals?: SavedDocumentTotals
  className?: string
}

const EMPTY_LINE: Omit<DocumentLine, "id"> = {
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
const newLineOf = (defaults: Partial<Omit<DocumentLine, "id">> = {}) => ({
  ...EMPTY_LINE,
  ...Object.fromEntries(
    Object.entries(defaults).filter(([, value]) => value !== undefined),
  ),
  id: newLineId(),
})

/** Суми сервера в збереженому рядку (`savedDocumentLineSchema`); рядок форми їх не має. */
const savedLineTotals = (line: DocumentLine | undefined): Totals | undefined =>
  line && "totals" in line
    ? savedDocumentLineSchema.shape.totals.safeParse(line.totals).data
    : undefined

/** Колонки таблиці й сітка карток (порядок полів — `DocumentLineFields`). */
const ROW_GRID =
  "grid-cols-2 @md:grid-cols-3 @4xl:grid-cols-[minmax(8rem,3fr)_minmax(5rem,1fr)_minmax(5.5rem,1.1fr)_minmax(7rem,1.4fr)_minmax(9rem,1.5fr)_minmax(6.5rem,1.3fr)_minmax(6rem,1fr)]"

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
  readOnly = false,
  savedTotals,
  className,
}: DocumentLinesEditorProps<TValues, TItem, TTransformed>) {
  const t = useErpUiT()
  // Поля редактора однакові в будь-якій формі документа: шапку модуля редактор не чіпає.
  const linesForm = form as unknown as UseFormReturn<DocumentLinesValues>
  const { control } = linesForm
  const lines = useWatch({ control, name: "lines" })
  const [discountPercent, discountAmount] = useWatch({
    control,
    name: ["discountPercent", "discountAmount"],
  })
  const preview = React.useMemo(
    () =>
      previewTotals(lines, currencyDigits(currency), {
        discountPercent,
        discountAmount,
      }),
    [lines, currency, discountPercent, discountAmount],
  )
  return (
    <div
      data-slot="document-lines"
      className={cn("@container grid min-w-0 gap-4", className)}
    >
      <RepeatingRows
        control={control}
        name="lines"
        label={label ?? t("documentLines.label")}
        description={description}
        rowLabel={(index) => t("documentLines.row", { index: index + 1 })}
        addLabel={t("documentLines.add")}
        newRow={() => newLineOf(newLine?.())}
        empty={t("documentLines.empty")}
        maxRows={maxLines}
        readOnly={readOnly}
        tableFrom="4xl"
        rowClassName={ROW_GRID}
        renderRow={({ index, rowLabel }) => {
          const line = lines[index] as DocumentLine | undefined
          return (
            <DocumentLineFields
              form={linesForm}
              index={index}
              rowLabel={rowLabel}
              line={line}
              totals={
                (readOnly && savedLineTotals(line)) || preview.lines.get(index)
              }
              currency={currency}
              units={units}
              taxes={taxes}
              item={item}
              readOnly={readOnly}
            />
          )
        }}
      />
      <DocumentLinesTotals
        form={linesForm}
        lines={lines}
        preview={preview}
        savedTotals={savedTotals}
        currency={currency}
        discount={{ discountPercent, discountAmount }}
        readOnly={readOnly}
      />
    </div>
  )
}
