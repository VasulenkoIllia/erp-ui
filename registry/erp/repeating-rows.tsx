import * as React from "react"
import {
  get,
  useFieldArray,
  useFormState,
  useWatch,
  type ArrayPath,
  type Control,
  type FieldArray,
  type FieldValues,
} from "react-hook-form"

import { keepFieldFocus } from "@/registry/erp/form"
import { RepeatingRowActions } from "@/registry/erp/repeating-row-actions"
import { announce } from "@/registry/lib/announce"
import { useErpUiT } from "@/registry/lib/i18n"
import { ACTION_ICONS } from "@/registry/lib/icons"
import { cn } from "@/registry/lib/utils"
import { Button } from "@/registry/ui/button"
import {
  FieldDescription,
  FieldError,
  FieldLegend,
  FieldSet,
} from "@/registry/ui/field"

/**
 * Повторювані рядки (UI42, ADR-0047): частини оплати, пари «ключ–значення», умови договору. Група полів
 * форми на `useFieldArray`: рядки зберігаються разом із формою.
 *
 * - Поля рядка дає `renderRow`: це звичайні `FormField` з іменем `` `parts.${index}.percent` ``.
 * - Широкий контейнер — рядки таблицею, підписи видно лише над першим, решта для скрінрідера; вузький —
 *   картки з підписом над кожним полем. Перемикання на `@container`, тож рядки живуть і в діалозі.
 * - Порядок змінюють кнопки «Підняти» й «Опустити» (`canReorder`), перетягування немає: воно б вимагало
 *   такої самої альтернативи (WCAG 2.5.7).
 * - Вилучення — без діалогу, з «Повернути» під рядками (SPEC §8.2): форма ще не збережена, а рядок не
 *   має зникати назавжди від одного натискання. Повертається останній вилучений рядок із тим, що було в
 *   ньому введено; будь-яка наступна зміна рядків прибирає «Повернути», решту повертає скасування форми.
 * - Фокус: новий рядок — на перше поле; після вилучення — на «Вилучити» сусіднього рядка, а якщо рядків
 *   немає — на «Додати»; після зміни порядку — на ту саму кнопку, що й була. Скидання форми (збереження,
 *   «Скасувати зміни») дає рядкам нові ключі: фокус лишається в тому самому рядку. Зміни чує скрінрідер.
 * - «Вилучити» неактивна на `minRows`, «Додати» — на `maxRows` із поясненням; обидві лишаються у фокусі.
 * - Помилка всієї групи (сума частин не 100 %) — під рядками: `refine` на масиві в схемі zod.
 * - `readOnly` — лише поля без кнопок: передайте його полям у `renderRow` (SPEC §8.3).
 * - Перехід зі зведення помилок (`FormErrorSummary`) — на перше поле з помилкою всередині групи.
 */

export interface RepeatingRowProps {
  readonly index: number
  /** Назва рядка для скрінрідера: «Частина 2». */
  readonly rowLabel: string
  readonly readOnly: boolean
}

export interface RepeatingRowsProps<
  TValues extends FieldValues,
  TName extends ArrayPath<TValues>,
  TTransformed extends FieldValues = TValues,
> {
  control: Control<TValues, unknown, TTransformed>
  name: TName
  /** Назва групи. */
  label: React.ReactNode
  description?: React.ReactNode
  /** Назва рядка за індексом: кнопки й скрінрідер кажуть, з яким рядком працюють. */
  rowLabel: (index: number) => string
  /** Підпис кнопки: «Додати частину». */
  addLabel: string
  /** Значення нового рядка. */
  newRow: () => FieldArray<TValues, TName>
  /** Поля рядка. */
  renderRow: (row: RepeatingRowProps) => React.ReactNode
  /** Сітка полів рядка на широкому контейнері: `@lg:grid-cols-2`. */
  rowClassName?: string
  /** Текст, поки рядків немає. */
  empty?: React.ReactNode
  minRows?: number
  maxRows?: number
  /** Порядок має значення: кнопки «Підняти» й «Опустити». */
  canReorder?: boolean
  readOnly?: boolean
  className?: string
}

type RowFocus =
  | { readonly target: "add" }
  | {
      readonly target: "field" | "up" | "down" | "remove"
      readonly index: number
    }

/** Перше поле рядка: кнопки дій стоять поза `[data-row-fields]`. */
const ROW_FIELD =
  "[data-row-fields] :is(input:not([type=hidden]), textarea, select, button)"

/** Фокус після змін рядків: DOM уже оновлено, бо ефект іде після рендера з новими `fields`. */
function focusRow(scope: HTMLElement, focus: RowFocus) {
  if (focus.target === "add") {
    scope.querySelector<HTMLElement>("[data-rows-add]")?.focus()
    return
  }
  const row = scope.querySelector(`[data-row-index="${focus.index}"]`)
  const selector =
    focus.target === "field" ? ROW_FIELD : `[data-row-action=${focus.target}]`
  row?.querySelector<HTMLElement>(selector)?.focus()
}

/** Помилка всієї групи: з рядками zodResolver кладе її в `root`, без рядків — на саме поле. */
function groupError(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined
  const { root, message } = error as {
    root?: { message?: string }
    message?: string
  }
  return root?.message ?? message
}

/** Вилучений рядок для «Повернути»: чинний, доки рядки ті самі, що одразу після вилучення. */
interface RemovedRow<TRow> {
  readonly index: number
  readonly value: TRow
  readonly label: string
  readonly remaining: string
}

const rowKeys = (rows: readonly { rowId: string }[]) =>
  rows.map((row) => row.rowId).join(",")

function RepeatingRows<
  TValues extends FieldValues,
  TName extends ArrayPath<TValues>,
  TTransformed extends FieldValues = TValues,
>({
  control,
  name,
  label,
  description,
  rowLabel,
  addLabel,
  newRow,
  renderRow,
  rowClassName,
  empty,
  minRows = 0,
  maxRows,
  canReorder = false,
  readOnly = false,
  className,
}: RepeatingRowsProps<TValues, TName, TTransformed>) {
  const t = useErpUiT()
  const id = React.useId()
  const scopeRef = React.useRef<HTMLFieldSetElement>(null)
  const pendingFocus = React.useRef<RowFocus | null>(null)
  const focusedRow = React.useRef<number | null>(null)
  // `rowId`, а не типове `id`: рядок сам може мати поле `id`.
  const { fields, append, insert, move, remove } = useFieldArray<
    TValues,
    TName,
    "rowId",
    TTransformed
  >({ control, name, keyName: "rowId" })
  const { errors } = useFormState({ control, name: name as never })
  // `fields` оновлюється лише зі зміною складу рядків: введене в поля є тільки у значеннях форми.
  const values = useWatch({ control, name: name as never }) as
    readonly FieldArray<TValues, TName>[] | undefined
  const [removed, setRemoved] = React.useState<RemovedRow<
    FieldArray<TValues, TName>
  > | null>(null)
  const canRestore = removed?.remaining === rowKeys(fields)
  const message = groupError(get(errors, name))
  const count = fields.length
  const isFull = maxRows !== undefined && count >= maxRows

  React.useEffect(() => {
    const scope = scopeRef.current
    const focus = pendingFocus.current
    if (!scope) return
    if (focus) {
      pendingFocus.current = null
      focusRow(scope, focus)
      return
    }
    const row = focusedRow.current
    if (row === null || document.activeElement !== document.body) return
    focusRow(
      scope,
      fields.length
        ? { target: "field", index: Math.min(row, fields.length - 1) }
        : { target: "add" },
    )
  }, [fields])

  const add = () => {
    if (isFull) return
    pendingFocus.current = { target: "field", index: count }
    append(newRow(), { shouldFocus: false })
  }
  const removeRow = (index: number) => {
    const row = rowLabel(index)
    const value = values?.[index]
    if (value === undefined) return
    setRemoved({
      index,
      value,
      label: row,
      remaining: rowKeys(fields.filter((_, position) => position !== index)),
    })
    pendingFocus.current =
      count > 1
        ? { target: "remove", index: Math.min(index, count - 2) }
        : { target: "add" }
    remove(index)
    announce(t("repeatingRows.removedHint", { row }))
  }
  const restore = () => {
    if (!removed) return
    pendingFocus.current = { target: "field", index: removed.index }
    insert(removed.index, removed.value, { shouldFocus: false })
    setRemoved(null)
    announce(t("repeatingRows.restored", { row: removed.label }))
  }
  const moveRow = (from: number, to: number) => {
    pendingFocus.current = { target: to < from ? "up" : "down", index: to }
    move(from, to)
    announce(t("repeatingRows.moved", { row: rowLabel(from), place: to + 1 }))
  }

  const describedBy =
    [description ? `${id}-hint` : "", message ? `${id}-error` : ""]
      .filter(Boolean)
      .join(" ") || undefined
  return (
    <FieldSet
      ref={scopeRef}
      data-slot="repeating-rows"
      data-field-name={name}
      aria-describedby={describedBy}
      className={cn("@container min-w-0 gap-2", className)}
      onFocusCapture={(event) => {
        const row = event.target.closest("[data-row-index]")
        focusedRow.current = row
          ? Number(row.getAttribute("data-row-index"))
          : null
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          focusedRow.current = null
      }}
    >
      <FieldLegend variant="label" className="mb-0">
        {label}
      </FieldLegend>
      {description ? (
        <FieldDescription id={`${id}-hint`}>{description}</FieldDescription>
      ) : null}
      {count ? (
        <ol className="grid gap-3 @lg:gap-2">
          {fields.map((field, index) => {
            const row = rowLabel(index)
            return (
              <li key={field.rowId} data-row-index={index} className="min-w-0">
                <div
                  role="group"
                  aria-label={row}
                  className="flex flex-col gap-2 rounded-lg border p-3 @lg:flex-row @lg:items-start @lg:border-0 @lg:p-0"
                >
                  <div
                    data-row-fields
                    className={cn(
                      "grid min-w-0 flex-1 gap-3",
                      index > 0 && "@lg:**:data-[slot=field-label]:sr-only",
                      rowClassName,
                    )}
                  >
                    {renderRow({ index, rowLabel: row, readOnly })}
                  </div>
                  {readOnly ? null : (
                    <RepeatingRowActions
                      index={index}
                      count={count}
                      rowLabel={row}
                      canReorder={canReorder}
                      canRemove={count > minRows}
                      isFirst={index === 0}
                      onMove={moveRow}
                      onRemove={removeRow}
                    />
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      ) : empty ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : null}
      {message ? <FieldError id={`${id}-error`}>{message}</FieldError> : null}
      {canRestore ? (
        <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
          {t("repeatingRows.removed", { row: removed.label })}
          <Button
            type="button"
            variant="link"
            className="h-auto min-h-7 px-0"
            onMouseDown={keepFieldFocus}
            onClick={restore}
          >
            {t("repeatingRows.restore")}
          </Button>
        </p>
      ) : null}
      {readOnly ? null : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Button
            type="button"
            variant="outline"
            data-rows-add
            disabled={isFull}
            focusableWhenDisabled
            aria-describedby={isFull ? `${id}-limit` : undefined}
            onMouseDown={keepFieldFocus}
            onClick={add}
          >
            <ACTION_ICONS.create aria-hidden />
            {addLabel}
          </Button>
          {isFull ? (
            <span id={`${id}-limit`} className="text-sm text-muted-foreground">
              {t("repeatingRows.limit", { count: maxRows })}
            </span>
          ) : null}
        </div>
      )}
    </FieldSet>
  )
}

export { RepeatingRows }
