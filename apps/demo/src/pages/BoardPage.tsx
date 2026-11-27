import { createContext, use, useCallback, useMemo, useState } from "react"
import { DownloadIcon } from "lucide-react"
import { useSearchParams } from "react-router"
import { toast } from "sonner"
import { useAuthenticated } from "@/registry/lib/ra-core"

import { PageHeader } from "@/registry/erp/page-header"
import { PageSkeleton } from "@/registry/erp/page-state"
import type { RecordDenialText } from "@/registry/hooks/use-record-access"
import type { DataTableColumn } from "@/registry/lib/data-table-core"
import { useFormat } from "@/registry/lib/format"
import { LAYOUT_ICONS } from "@/registry/lib/icons"
import type { ListDefaults, ListTab } from "@/registry/lib/list-state"
import { Board, type BoardColumn } from "@/registry/templates/board"
import {
  ListReport,
  useListReport,
  type ListReportBulk,
  type ListReportContentProps,
  type ListReportLayout,
} from "@/registry/templates/list-report"
import { Button } from "@/registry/ui/button"
import { Label } from "@/registry/ui/label"
import { Switch } from "@/registry/ui/switch"

import {
  PIPELINE,
  PIPELINE_CLOSED_DENIAL,
  PIPELINE_OWNERS,
  PIPELINE_STAGES,
  PIPELINE_STRESS_CARDS,
  isPipelineStress,
  type PipelineDeal,
} from "@/data/pipeline"
import { useDemoTranslation } from "@/i18n"
import { ukBoardPage } from "@/i18n/pages"
import { MOCK_USERS } from "@/mocks/users"

import { usePageHeading } from "./heading-focus"

const usePageT = () =>
  useDemoTranslation([ukBoardPage], { keyPrefix: "boardPage" }).t

/** Без параметрів в адресі: усі угоди, дорожчі першими; подання за замовчуванням — дошка. */
const BOARD_LIST_DEFAULTS: Omit<ListDefaults, "layouts"> = {
  tab: "all",
  sort: { field: "amount", order: "DESC" },
  sortFields: ["amount", "title"],
}

/** Етапи вкладки «Відкриті»: дошка показує лише їхні колонки. */
const OPEN_STAGES = ["new", "qualified", "proposal", "negotiation"]

/**
 * Доріжки за відповідальним вмикає перемикач над дошкою, а велику колонку — адреса `?cards=500` (перевірка
 * швидкості): подання отримує лише пропси списку.
 */
const BoardPageContext = createContext({ withLanes: false, isStress: false })

/**
 * Шаблон Board (UI07, ADR-0100) на угодах воронки демо: подання «Дошка» й «Таблиця» одного списку
 * (ADR-0091). Колонки — етапи, сума колонки від сервера, «Показати ще», згортання з пам'яттю на сервері,
 * доріжки за відповідальним, швидке створення, «Перемістити в…», виграна угода з причиною, угода, яку
 * редагує колега, і вибір карток для масової дії. Модуль угод (B2) візьме цей шаблон.
 */
export function BoardPage() {
  const t = usePageT()
  const { isPending } = useAuthenticated()
  const heading = usePageHeading(t("title"))
  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("lead")}
        headingRef={heading}
      />
      {isPending ? <PageSkeleton rows={8} /> : <PipelineList />}
    </div>
  )
}

function PipelineList() {
  const t = usePageT()
  const [searchParams, setSearchParams] = useSearchParams()
  const [withLanes, setWithLanes] = useState(false)
  // Список переписує адресу своїми параметрами: велику колонку беремо з адреси один раз.
  const [isStress] = useState(() => isPipelineStress())
  const tabs = useMemo<ListTab[]>(
    () => [
      { id: "all", label: t("tabs.all"), filter: {} },
      { id: "open", label: t("tabs.open"), filter: { stage: OPEN_STAGES } },
    ],
    [t],
  )
  const layouts = useMemo<ListReportLayout[]>(
    () => [
      {
        id: "board",
        label: t("layouts.board"),
        icon: LAYOUT_ICONS.board,
        component: PipelineBoard,
      },
      { id: "table", label: t("layouts.table"), icon: LAYOUT_ICONS.table },
    ],
    [t],
  )
  const report = useListReport({
    resource: PIPELINE,
    params: searchParams,
    onParamsChange: setSearchParams,
    defaults: BOARD_LIST_DEFAULTS,
    tabs,
    layouts,
  })
  const columns = usePipelineColumns()
  const context = useMemo(
    () => ({ withLanes, isStress }),
    [withLanes, isStress],
  )
  const bulk = useMemo<ListReportBulk<PipelineDeal>>(
    () => ({
      actions: [
        { id: "export", render: (count) => <ExportDeals count={count} /> },
      ],
      rowLabel: (deal) => deal.title,
    }),
    [],
  )
  return (
    <BoardPageContext value={context}>
      <ListReport
        report={report}
        mode="pages"
        tabsLabel={t("tabsLabel")}
        searchPlaceholder={t("search")}
        tableLabel={t("tableLabel")}
        columns={columns}
        bulk={bulk}
        countLabel={(count, value) => t("count", { count, value })}
        toolbar={[
          {
            id: "lanes",
            node: (
              <div className="flex items-center gap-2">
                <Switch
                  id="board-lanes"
                  checked={withLanes}
                  onCheckedChange={setWithLanes}
                />
                <Label htmlFor="board-lanes">{t("lanes")}</Label>
              </div>
            ),
          },
        ]}
      />
    </BoardPageContext>
  )
}

/** Назва відповідального з команди демо. */
const ownerName = (id: string | null | undefined) =>
  MOCK_USERS.find((user) => user.id === id)?.name

/** Подання «Дошка»: етапи колонками, сума угод, доріжки за відповідальним з перемикача сторінки. */
function PipelineBoard(props: ListReportContentProps) {
  const t = usePageT()
  const format = useFormat()
  const { withLanes, isStress } = use(BoardPageContext)
  const columns = useMemo<BoardColumn[]>(
    () =>
      PIPELINE_STAGES.map((stage) => ({
        id: stage,
        label: t(`stages.${stage}`),
        // Програні угоди рідко потрібні: колонка згорнута, поки людина не вибере свого.
        collapsed: stage === "lost",
      })),
    [t],
  )
  const lanes = useMemo(
    () => ({
      items: [
        ...PIPELINE_OWNERS.map((id) => ({ id, label: ownerName(id) ?? id })),
        { id: "", label: t("noOwner") },
      ],
      of: (deal: PipelineDeal) => deal.owner ?? "",
    }),
    [t],
  )
  const sum = useMemo(
    () => ({
      field: "amount",
      format: (amount: number) => format.money({ amount, currency: "UAH" }),
    }),
    [format],
  )
  const denialText = useCallback<RecordDenialText>(
    (_action, code) =>
      code === PIPELINE_CLOSED_DENIAL ? t("closed") : undefined,
    [t],
  )
  return (
    <Board<PipelineDeal>
      {...props}
      field="stage"
      columns={columns}
      cardLabel={(deal) => deal.title}
      renderCard={(deal) => <DealCard deal={deal} />}
      sum={sum}
      {...(withLanes ? { lanes } : {})}
      quickCreate={{ field: "title", label: t("quickCreateLabel") }}
      lockedBy={(deal) => deal.editedBy ?? undefined}
      denialText={denialText}
      countLabel={(count, value) => t("count", { count, value })}
      {...(isStress ? { pageSize: PIPELINE_STRESS_CARDS } : {})}
    />
  )
}

function DealCard({ deal }: { deal: PipelineDeal }) {
  const format = useFormat()
  const owner = ownerName(deal.owner)
  return (
    <>
      <p className="font-medium">{deal.title}</p>
      {deal.amount === undefined ? null : (
        <p className="tabular-nums">
          {format.money({ amount: deal.amount, currency: "UAH" })}
        </p>
      )}
      {owner ? <p className="text-muted-foreground">{owner}</p> : null}
    </>
  )
}

/** Колонки таблиці: угода, етап, сума, відповідальний; на телефоні — картки. */
function usePipelineColumns(): DataTableColumn<PipelineDeal>[] {
  const t = usePageT()
  const format = useFormat()
  return useMemo(
    () => [
      {
        id: "title",
        header: t("columns.title"),
        cell: (deal) => deal.title,
        sortField: "title",
        minWidth: 16,
        grow: 3,
        sticky: true,
        card: "title",
      },
      {
        id: "stage",
        header: t("columns.stage"),
        cell: (deal) => t(`stages.${deal.stage}`),
        minWidth: 9,
        card: "badge",
      },
      {
        id: "amount",
        header: t("columns.amount"),
        cell: (deal) =>
          deal.amount === undefined ? null : (
            <span className="tabular-nums">
              {format.money({ amount: deal.amount, currency: "UAH" })}
            </span>
          ),
        sortField: "amount",
        minWidth: 9,
        align: "end",
      },
      {
        id: "owner",
        header: t("columns.owner"),
        cell: (deal) => ownerName(deal.owner) ?? t("noOwner"),
        minWidth: 10,
        priority: 4,
      },
    ],
    [t, format],
  )
}

/** Масова дія демо: повідомлення замість справжнього вивантаження. */
function ExportDeals({ count }: { count: number }) {
  const t = usePageT()
  const format = useFormat()
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => {
        toast.success(t("exported", { count, value: format.number(count) }))
      }}
    >
      <DownloadIcon aria-hidden />
      {t("export")}
    </Button>
  )
}
