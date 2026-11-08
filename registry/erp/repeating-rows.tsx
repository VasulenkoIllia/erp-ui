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
import {
  REPEATING_ROWS_LAYOUTS,
  type RepeatingRowsTableFrom,
} from "@/registry/erp/repeating-row-actions"
import {
  groupHeadsOf,
  rowGroupFlags,
  rowGroupMove,
  type RowGroupDirection,
} from "@/registry/erp/repeating-rows-groups"
import {
  RepeatingRowItem,
  RepeatingRowsList,
  useRowHandlers,
  type RepeatingRowsVirtual,
} from "@/registry/erp/repeating-rows-list"
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
 *   картки з підписом над кожним полем. Перемикання на `@container`, тож рядки живуть і в діалозі. Таблиця
 *   з `@lg`, для рядка з багатьма полями — з `@4xl` (`tableFrom`, рядки документа).
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
 * - UI05b, ADR-0060: стабільний `renderRow` (`useCallback`), `virtualRows` (`erp/repeating-rows-virtual`),
 *   `rowActions="menu"` з «Вставити… нижче» для кожного виду (`extraKinds`), `columnHeader` над таблицею.
 * - UI05d, ADR-0064: `groups` — меню голови групи (розділу) переносить групу цілком, фокус іде за нею;
 *   `handleRef.focusRow` ставить фокус у рядок поза екраном (пошук); `toolbar` — під назвою групи.
 */

/** Групи рядків: рядок `isHead` відкриває групу до наступного такого (розділ документа). */
export interface RepeatingRowsGroups<TRow> {
  readonly isHead: (row: TRow) => boolean
  /** Пункти меню голови: «Перенести розділ із рядками вище» і «…нижче». */
  readonly labels: readonly [up: string, down: string]
}

/** Дії з рядками ззовні групи. */
export interface RepeatingRowsHandle {
  /**
   * Фокус у рядок `index`: на поле `field` рядка (ім'я без `lines.3.`) чи на перше поле. Рядок поза екраном
   * віртуального списку з'являється, і `focus()` прокручує до нього сторінку.
   */
  readonly focusRow: (index: number, field?: string) => void
}

export interface RepeatingRowProps {
  readonly index: number
  /** Назва рядка для скрінрідера: «Частина 2». */
  readonly rowLabel: string
  readonly readOnly: boolean
}

/** Ще один вид рядка: розділ чи нотатка документа. */
export interface RepeatingRowsKind<TRow> {
  /** Кнопка під рядками: «Додати розділ». */
  readonly addLabel: string
  /** Пункт меню рядка: «Вставити розділ нижче». */
  readonly insertLabel: string
  readonly newRow: () => TRow
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
  /** З якої ширини контейнера рядки стають таблицею: `lg` (32rem) чи `4xl` (56rem). */
  tableFrom?: RepeatingRowsTableFrom
  /** Текст, поки рядків немає. */
  empty?: React.ReactNode
  minRows?: number
  maxRows?: number
  /** Порядок має значення: кнопки «Підняти» й «Опустити». */
  canReorder?: boolean
  /** Дії рядка кнопками чи одним меню з вставкою нижче. */
  rowActions?: "buttons" | "menu"
  /** Пункт меню рядка для основного виду: «Вставити рядок нижче». */
  insertLabel?: string
  /** Інші види рядків: кнопка «Додати…» під рядками й пункт «Вставити… нижче» в меню рядка. */
  extraKinds?: readonly RepeatingRowsKind<FieldArray<TValues, TName>>[]
  /** Підписи колонок над таблицею (на широкому контейнері); праворуч місце на одне меню рядка. */
  columnHeader?: React.ReactNode
  /** Лише видимі рядки від `from`: `{ from, List: VirtualRowsList }` з `erp/repeating-rows-virtual`. */
  virtualRows?: RepeatingRowsVirtual
  /** Групи рядків з перенесенням групи цілком; об'єкт стабільний (`useMemo`). */
  groups?: RepeatingRowsGroups<FieldArray<TValues, TName>>
  /** Над рядками, під назвою групи: пошук у рядках. */
  toolbar?: React.ReactNode
  handleRef?: React.Ref<RepeatingRowsHandle>
  readOnly?: boolean
  className?: string
}

type RowTarget = "field" | "up" | "down" | "remove"
type RowFocus =
  | { readonly target: "add" }
  | {
      readonly target: RowTarget
      readonly index: number
      /** Повне ім'я поля (`lines.3.name`): фокус на нього, а не на перше поле рядка. */
      readonly field?: string
    }

const FIELD_CONTROL = ":is(input:not([type=hidden]), textarea, select, button)"
/** Перше поле рядка: кнопки дій стоять поза `[data-row-fields]`. */
const ROW_FIELD = `[data-row-fields] ${FIELD_CONTROL}`

/** Фокус після змін рядків: DOM уже оновлено, бо ефект іде після рендера з новими `fields`. */
function focusRow(scope: HTMLElement, focus: RowFocus) {
  if (focus.target === "add") {
    scope.querySelector<HTMLElement>("[data-rows-add]")?.focus()
    return
  }
  const row = scope.querySelector(`[data-row-index="${focus.index}"]`)
  if (focus.target !== "field") {
    // У меню рядка дії немає окремою кнопкою: фокус — на саме меню.
    row
      ?.querySelector<HTMLElement>(
        `[data-row-action=${focus.target}], [data-row-action=menu]`,
      )
      ?.focus()
    return
  }
  const field = focus.field
    ? row?.querySelector<HTMLElement>(
        `[data-field-name="${CSS.escape(focus.field)}"] ${FIELD_CONTROL}`,
      )
    : null
  ;(field ?? row?.querySelector<HTMLElement>(ROW_FIELD))?.focus()
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
  tableFrom = "lg",
  empty,
  minRows = 0,
  maxRows,
  canReorder = false,
  rowActions = "buttons",
  insertLabel,
  extraKinds,
  columnHeader,
  virtualRows,
  groups,
  toolbar,
  handleRef,
  readOnly = false,
  className,
}: RepeatingRowsProps<TValues, TName, TTransformed>) {
  const t = useErpUiT()
  const id = React.useId()
  const scopeRef = React.useRef<HTMLFieldSetElement>(null)
  const pendingFocus = React.useRef<RowFocus | null>(null)
  const focusedRow = React.useRef<number | null>(null)
  // `rowId`, а не типове `id`: рядок сам може мати поле `id`.
  const { fields, insert, move, remove } = useFieldArray<
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
  const groupErrors: unknown = get(errors, name)
  const message = groupError(groupErrors)
  const count = fields.length
  const isFull = maxRows !== undefined && count >= maxRows
  const kinds = [
    { addLabel, insertLabel: insertLabel ?? addLabel, newRow },
    ...(extraKinds ?? []),
  ]
  const insertKey = kinds.map((kind) => kind.insertLabel).join("\n")
  const insertLabels = React.useMemo(() => insertKey.split("\n"), [insertKey])
  const isHead = groups?.isHead
  const heads = React.useMemo(
    () => (isHead && values ? groupHeadsOf(values, isHead) : []),
    [isHead, values],
  )
  // Рядок, куди йде фокус далеко від екрана. Віртуальний список перераховує рядки в DOM лише зі зміною
  // кількості чи меж екрана, тож без цього стану рядок поза екраном не з'явився б. Новий об'єкт і для
  // того самого рядка, щоб ефект фокуса спрацював.
  const [revealed, setRevealed] = React.useState<{ index: number } | null>(null)
  const focusFar = React.useCallback(
    (focus: RowFocus & { readonly index: number }) => {
      pendingFocus.current = focus
      setRevealed({ index: focus.index })
    },
    [],
  )
  React.useImperativeHandle(
    handleRef,
    () => ({
      focusRow: (index, field) => {
        focusFar({
          target: "field",
          index,
          field: field ? `${name}.${String(index)}.${field}` : undefined,
        })
      },
    }),
    [focusFar, name],
  )

  const keepLive = React.useCallback(() => {
    const focus = pendingFocus.current
    const next = focus?.target === "add" ? -1 : (focus?.index ?? -1)
    return [focusedRow.current ?? -1, next]
  }, [])

  React.useEffect(() => {
    const scope = scopeRef.current
    const focus = pendingFocus.current
    if (!scope) return
    if (focus) {
      pendingFocus.current = null
      focusRow(scope, focus)
      // Рядок у фокусі тримає `keepLive`: закріплений для переходу більше не потрібен.
      setRevealed(null)
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
  }, [fields, revealed])

  const insertRow = (index: number, kind: number) => {
    const make = kinds[kind]?.newRow
    if (isFull || !make) return
    pendingFocus.current = { target: "field", index: index + 1 }
    insert(index + 1, make(), { shouldFocus: false })
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
  const moveGroup = (index: number, direction: RowGroupDirection) => {
    const plan = rowGroupMove(heads, count, index, direction)
    if (!plan) return
    // Розділ може стати далеко за екраном, а кількість рядків не змінюється.
    focusFar({ target: direction, index: plan.head })
    for (const [from, to] of plan.moves) move(from, to)
    const moved = { row: rowLabel(index), place: plan.head + 1 }
    // Розділ без рядків — як звичайний рядок, без «і 0 рядків під ним».
    announce(
      plan.size > 1
        ? t("repeatingRows.groupMoved", { ...moved, count: plan.size - 1 })
        : t("repeatingRows.moved", moved),
    )
  }
  const handlers = useRowHandlers({
    move: moveRow,
    remove: removeRow,
    insert: insertRow,
    moveGroup,
  })

  const rowItem = (index: number) => {
    const group = groups ? rowGroupFlags(heads, index) : null
    return (
      <RepeatingRowItem
        index={index}
        rowLabel={rowLabel(index)}
        readOnly={readOnly}
        renderRow={renderRow}
        fieldsClassName={cn(
          "grid min-w-0 flex-1 gap-3",
          (index > 0 || columnHeader) &&
            REPEATING_ROWS_LAYOUTS[tableFrom].laterLabels,
          rowClassName,
        )}
        tableFrom={tableFrom}
        rowActions={rowActions}
        count={rowActions === "buttons" ? count : 0}
        isLast={index === count - 1}
        labelSpacer={index === 0 && !columnHeader}
        canReorder={canReorder}
        canRemove={count > minRows}
        canInsert={!isFull}
        insertLabels={insertLabels}
        groupLabels={group ? groups?.labels : undefined}
        canMoveGroupUp={group?.canUp}
        canMoveGroupDown={group?.canDown}
        handlers={handlers}
      />
    )
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
      {toolbar}
      {count ? (
        <RepeatingRowsList
          fields={fields}
          renderItem={rowItem}
          columnHeader={columnHeader}
          rowClassName={rowClassName}
          tableFrom={tableFrom}
          readOnly={readOnly}
          virtualRows={virtualRows}
          rowErrors={groupErrors}
          revealed={revealed?.index}
          keepLive={keepLive}
        />
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
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {kinds.map((kind, index) => (
            <Button
              key={index}
              type="button"
              variant="outline"
              data-rows-add={index === 0 ? "" : undefined}
              disabled={isFull}
              focusableWhenDisabled
              aria-describedby={isFull ? `${id}-limit` : undefined}
              onMouseDown={keepFieldFocus}
              onClick={() => {
                insertRow(count - 1, index)
              }}
            >
              <ACTION_ICONS.create aria-hidden />
              {kind.addLabel}
            </Button>
          ))}
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
