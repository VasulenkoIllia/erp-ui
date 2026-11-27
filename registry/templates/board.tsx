import * as React from "react"
import { useCanAccess, type RaRecord } from "@/registry/lib/ra-core"

import { SelectionProvider } from "@/registry/erp/data-table-selection"
import {
  Kanban,
  useKanbanNarrow,
  type KanbanColumn,
  type KanbanLanes,
} from "@/registry/erp/kanban"
import { KanbanQuickCreate } from "@/registry/erp/kanban-quick-create"
import { PageState, SectionSkeleton } from "@/registry/erp/page-state"
import { useCompanyId } from "@/registry/hooks/use-company"
import { useCollapsedColumns } from "@/registry/hooks/use-list-settings"
import type { RecordDenialText } from "@/registry/hooks/use-record-access"
import { errorStateKind } from "@/registry/lib/api"
import {
  useBoardActions,
  type BoardActions,
} from "@/registry/templates/board-actions"
import {
  recordId,
  selectedCards,
  useBoardCard,
  useMoveReason,
} from "@/registry/templates/board-card"
import {
  BoardStatus,
  BulkMove,
  ColumnError,
  ColumnMore,
  hasMore,
  useLoadMore,
} from "@/registry/templates/board-status"
import type { ListReportContentProps } from "@/registry/templates/list-report-layouts"
import {
  boardColumnsFor,
  useBoardColumns,
  useColumnPages,
  withPendingMoves,
  type BoardColumnData,
} from "@/registry/templates/board-data"

/**
 * Шаблон Board — дошка списку сутностей, подання List Report (SPEC §7, §8.1, §9, §10; UI07; ADR-0091,
 * ADR-0100). Вкладки, пошук, фільтри, види й вибір — від шаблону списку; дошка показує ті самі записи
 * колонками за полем (`field`) на erp/kanban.
 *
 *   function DealsBoard(props: ListReportContentProps) {
 *     return <Board {...props} {...dealsBoard} />
 *   }
 *   layouts: [{ id: "board", label: t("board"), icon: LAYOUT_ICONS.board, component: DealsBoard }, …]
 *
 * - Колонка — свій запит (templates/board-data) з «Показати ще»; кількість і сума — від сервера (`sumOf`),
 *   без сум сервера — сума завантажених карток, лише коли завантажено всі.
 * - Згорнуті колонки — в особистих налаштуваннях списку на сервері (`collapsedColumns`); без збереженого —
 *   колонки з `collapsed: true`.
 * - «Перемістити в…» — зміна поля `field` з версією запису (409 — картку змінив інший, дошка оновлюється)
 *   чи своя дія модуля (`move`: перехід статусу). Без права `update`, з позначкою запису (`deniedActions`)
 *   чи коли картку редагує інша людина (`lockedBy`) — причина замість колонок (SPEC §8.4).
 * - Швидке створення в колонці — з правом `create`: назва в `quickCreate.field`, колонка в `field`.
 * - Стани (SPEC §8.1): скелетон, оновлення з видимими картками, «Показати ще», порожньо (пояснення над
 *   колонками, швидке створення лишається), нічого не знайдено зі скиданням фільтрів, помилка з повтором,
 *   збій однієї колонки з повтором у ній, немає доступу, офлайн, «Оновлено о…», вибір «усі за фільтром»,
 *   картку редагує інша людина, лише перегляд.
 * - Перенесення оптимістичне (ADR-0103): картка одразу на новому місці, відмова сервера повертає її з
 *   поясненням. Перетягування — на широкому контейнері (erp/kanban-drag); вибрану картку тягнуть разом з
 *   усіма вибраними. З правом `update` на дошці є вибір і «Перемістити в…» на панелі вибраного (лише
 *   вибрані картки, не «усі за фільтром»).
 */

export interface BoardColumn {
  id: string
  label: string
  /** Згорнута, поки людина не вибрала свого (підсумкові колонки: «Виграно», «Програно»). */
  collapsed?: boolean
}

export interface BoardOptions<T extends RaRecord> {
  /** Поле запису з ключем колонки: `stage`. */
  field: string
  /**
   * Колонки з ключами, порядок — порядок на дошці; стабільні між рендерами (`useMemo`). Покривають усі значення
   * поля: «усі за фільтром» у масових діях бере фільтр списку без колонки.
   */
  columns: readonly BoardColumn[]
  /** Назва картки: прапорець, меню, оголошення («Угода з ТОВ Альфа»). */
  cardLabel: (record: T) => string
  /**
   * Вміст картки: назва-посилання, сума, відповідальний. Перемальовується, коли змінився запис, мова чи стан
   * картки (ADR-0103): мову й формат усередині беріть хуками компонентів.
   */
  renderCard: (record: T) => React.ReactNode
  /** Сума колонки: поле й формат («340 000,00 ₴»). */
  sum?: { field: string; format: (value: number) => string }
  /** Доріжки: перелік і доріжка картки. */
  lanes?: KanbanLanes<T>
  /** Швидке створення: поле назви, підпис поля, інші значення нового запису. */
  quickCreate?: {
    field: string
    label?: string
    values?: (column: string) => Partial<T>
  }
  /** Своє перенесення (перехід статусу); за замовчуванням — зміна `field` з версією. */
  move?: (record: T, column: string) => Promise<unknown>
  /** Хто зараз редагує картку (SPEC §8.1, стан 15). */
  lockedBy?: (record: T) => string | undefined
  /** Причина без права `update`: «Переносити угоди може менеджер з продажу». */
  moveDenied?: string
  /** Слова модуля для кодів заборони запису (`deniedActions`); стабільна функція. */
  denialText?: RecordDenialText
  /** Лічильник: (120, "120") → «120 угод»; за замовчуванням — «120 карток». */
  countLabel?: (count: number, formatted: string) => string
  /** Порожньо вперше: пояснення над колонками; за замовчуванням — PageState `empty`. */
  empty?: React.ReactNode
  /** Карток колонки за раз («Показати ще»). */
  pageSize?: number
}

export type BoardProps<T extends RaRecord> = ListReportContentProps &
  BoardOptions<T>

const BOARD_PAGE_SIZE = 20
const NONE: ReadonlySet<string> = new Set()

export function Board<T extends RaRecord>(props: BoardProps<T>) {
  const { resource, field, filter, sort, pageSize = BOARD_PAGE_SIZE } = props
  const container = React.useRef<HTMLDivElement>(null)
  const narrow = useKanbanNarrow(container)
  const columns = React.useMemo(
    () => boardColumnsFor(props.columns, filter, field),
    [props.columns, filter, field],
  )
  const defaults = React.useMemo(
    () =>
      props.columns
        .filter((column) => column.collapsed)
        .map((column) => column.id),
    [props.columns],
  )
  const settings = useCollapsedColumns(resource, defaults)
  const collapsed = narrow ? NONE : settings.collapsed
  const pages = useColumnPages([filter, sort, useCompanyId()])
  const data = useBoardColumns<T>({
    resource,
    field,
    columns,
    filter,
    sort,
    sumField: props.sum?.field,
    perPageOf: (column) =>
      collapsed.has(column) ? 1 : pageSize * pages.of(column),
    isCollapsed: (column) => collapsed.has(column),
    enabled: settings.isReady,
  })
  return (
    <div ref={container} data-slot="board" className="min-w-0">
      {settings.isReady ? (
        <BoardBody
          {...props}
          allColumns={props.columns}
          columns={columns}
          data={data}
          narrow={narrow}
          collapsed={collapsed}
          onCollapsedChange={settings.setCollapsed}
          onMore={pages.more}
          container={container}
        />
      ) : (
        <SectionSkeleton rows={6} />
      )}
    </div>
  )
}

type BoardBodyProps<T extends RaRecord> = Omit<BoardProps<T>, "columns"> & {
  /** Усі колонки модуля: пункти «Перемістити в…». */
  allColumns: readonly BoardColumn[]
  /** Колонки за фільтром: на дошці. */
  columns: readonly BoardColumn[]
  data: readonly BoardColumnData<T>[]
  narrow: boolean
  collapsed: ReadonlySet<string>
  onCollapsedChange: (column: string, collapsed: boolean) => void
  onMore: (column: string) => void
  container: React.RefObject<HTMLDivElement | null>
}

/**
 * Стани всієї дошки (SPEC §8.1): помилка всіх колонок (лише коли жодна не має карток: збій оновлення не
 * ховає дошку з фокусом), нічого не знайдено, порожньо вперше.
 */
function BoardBody<T extends RaRecord>(props: BoardBodyProps<T>) {
  const { isFiltered, onResetFilters, data, resource, selection } = props
  const update = useCanAccess({ resource, action: "update" })
  const actions = useBoardActions<T>({
    resource,
    field: props.field,
    columns: props.allColumns,
    cardLabel: props.cardLabel,
    quickCreate: props.quickCreate,
    move: props.move,
    container: props.container,
    columnOf: (column) => data.find(({ id }) => id === column),
  })
  const reasonOf = useMoveReason(props, update.canAccess === true)
  const canMove = update.canAccess === true
  const failed = data.filter((column) => column.error && !column.cards)
  const first = failed[0]
  if (first && failed.length === data.length) {
    const kind = errorStateKind(first.error)
    return (
      <PageState
        kind={kind}
        onRetry={
          kind === "forbidden"
            ? undefined
            : () => {
                for (const column of data) column.refetch()
              }
        }
      />
    )
  }
  const isKnown = data.every((column) => column.total !== undefined)
  const total = data.reduce((sum, column) => sum + (column.total ?? 0), 0)
  if (isKnown && total === 0 && isFiltered)
    return <PageState kind="no-results" onReset={onResetFilters} />
  const isSelectable = Boolean(props.bulkActions) || canMove
  const moveSelected = (to: string) => {
    void actions.moveCards(selectedCards(data, selection), to, { reasonOf })
  }
  // Обгортка вибору є завжди: інакше, коли права прийдуть, уся дошка змонтувалась би заново й фокус загубився б.
  return (
    <SelectionProvider
      options={{
        selection,
        rowLabel: props.cardLabel,
        bulkActions: (count) => (
          <>
            {canMove ? (
              <BulkMove
                columns={props.allColumns}
                isAll={selection.state.mode === "all"}
                onMove={moveSelected}
              />
            ) : null}
            {props.bulkActions?.(count)}
          </>
        ),
      }}
      getRowId={recordId}
      scope={{ kind: "all", pageIds: NO_IDS, total }}
    >
      <div className="space-y-3">
        <BoardStatus
          data={props.data}
          total={isKnown ? total : undefined}
          countLabel={props.countLabel}
          isSelectable={isSelectable}
          container={props.container}
        />
        {isKnown && total === 0
          ? (props.empty ?? <PageState kind="empty" compact />)
          : null}
        <BoardKanban
          {...props}
          actions={actions}
          reasonOf={reasonOf}
          isSelectable={isSelectable}
          isAccessPending={update.isPending}
        />
      </div>
    </SelectionProvider>
  )
}

const NO_IDS: readonly string[] = []

type BoardKanbanProps<T extends RaRecord> = BoardBodyProps<T> & {
  actions: BoardActions<T>
  reasonOf: (record: T) => string | undefined
  isSelectable: boolean
  /** Права ще не відомі: ні меню, ні перетягування. */
  isAccessPending: boolean
}

/** Колонки й картки: права, перенесення, перетягування, швидке створення, «Показати ще». */
function BoardKanban<T extends RaRecord>(props: BoardKanbanProps<T>) {
  const { resource, field, actions } = props
  const data = withPendingMoves(
    props.data,
    actions.pending,
    field,
    props.sum?.field,
  )
  const onMore = useLoadMore(data, props.onMore, props.container)
  const create = useCanAccess({ resource, action: "create" })
  const card = useBoardCard<T>(props)
  const byId = new Map(data.map((column) => [column.id, column]))

  const columns = props.columns.map((column): KanbanColumn<T> => {
    const loaded = byId.get(column.id)
    const sum = loaded?.sum
    return {
      id: column.id,
      label: column.label,
      total: loaded?.total,
      cards: loaded?.cards,
      ...(sum !== undefined && props.sum
        ? { summary: props.sum.format(sum) }
        : {}),
      header:
        props.quickCreate && create.canAccess ? (
          <KanbanQuickCreate
            column={column.label}
            label={props.quickCreate.label}
            onCreate={(name) => actions.create(column.id, name)}
          />
        ) : undefined,
      state: loaded?.error ? (
        <ColumnError
          column={column.label}
          error={loaded.error}
          onRetry={loaded.refetch}
        />
      ) : undefined,
      footer:
        loaded && hasMore(loaded) ? (
          <ColumnMore column={loaded} onMore={onMore} />
        ) : undefined,
    }
  })

  return (
    <Kanban
      label={props.label}
      columns={columns}
      getCardId={recordId}
      lanes={props.lanes}
      collapsed={props.collapsed}
      onCollapsedChange={props.onCollapsedChange}
      narrow={props.narrow}
      busy={data.some((column) => column.isFetching)}
      drag={card.drag}
      cardKey={card.cardKey}
      renderCard={card.renderCard}
    />
  )
}
