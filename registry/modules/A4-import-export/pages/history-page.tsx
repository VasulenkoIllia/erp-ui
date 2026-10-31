import { useAuthenticated, useCanAccess } from "ra-core"
import { HistoryIcon } from "lucide-react"
import { useCallback, useMemo, useRef, useState } from "react"
import { useSearchParams } from "react-router"

import { PageSkeleton, PageState } from "@/components/erp/page-state"
import {
  ListReport,
  ListReportHeader,
  useListReport,
} from "@/components/templates/list-report"
import { useExtendedList } from "@/hooks/use-extended-list"
import { usePageHeading } from "@/hooks/use-page-heading"
import type { FilterDefinition } from "@/lib/filters"
import type { ListDefaults } from "@/lib/list-state"

import { RunDetails } from "../components/run-details"
import { useRunColumns } from "../components/run-columns"
import { useRefreshWhileRunning } from "../components/use-refresh-while-running"
import { IMPORT_RUN_STATUSES, IMPORT_RUNS, type ImportRun } from "../contract"
import type { ImportRunColumnId, ImportRunFilterId } from "../extension"
import { useImportExportModule } from "../module-context"
import { useImportExportT } from "../use-import-export-t"
import { useImportExportTargets } from "../use-targets"

interface RunIds {
  column: ImportRunColumnId
  filter: ImportRunFilterId
  tab: never
}

const LIST_DEFAULTS: ListDefaults = {
  tab: "all",
  sort: { field: "startedAt", order: "DESC" },
  sortFields: ["startedAt"],
}
const NO_TABS = [] as const
/** Файл — заголовок картки на телефоні й кнопка подробиць: розширення його не ховає. */
const LOCKED_COLUMNS = ["fileName"] as const

function RunsList() {
  const t = useImportExportT()
  const { extension } = useImportExportModule()
  const targets = useImportExportTargets()
  const [searchParams, setSearchParams] = useSearchParams()
  const [details, setDetails] = useState<ImportRun | null>(null)
  const [isDetailsOpen, setDetailsOpen] = useState(false)
  // Safari кнопку кліком не фокусує: куди повернути фокус, беремо з самого кліку.
  const opener = useRef<HTMLElement | null>(null)
  const onOpen = useCallback((run: ImportRun, button: HTMLElement) => {
    opener.current = button
    setDetails(run)
    setDetailsOpen(true)
  }, [])
  const columns = useRunColumns(onOpen)
  const filters = useMemo(
    (): readonly (FilterDefinition & { id: ImportRunFilterId })[] => [
      {
        kind: "options",
        id: "target",
        field: "target",
        label: t("history.columns.target"),
        options: targets.map(({ resource, label }) => ({
          value: resource,
          label,
        })),
      },
      {
        kind: "options",
        id: "status",
        field: "status",
        label: t("history.columns.status"),
        options: IMPORT_RUN_STATUSES.map((status) => ({
          value: status,
          label: t(`history.status.${status}`),
        })),
      },
    ],
    [t, targets],
  )
  const list = useExtendedList<ImportRun, RunIds>(
    columns,
    filters,
    NO_TABS,
    extension.history,
    LOCKED_COLUMNS,
  )
  const report = useListReport({
    resource: IMPORT_RUNS,
    params: searchParams,
    onParamsChange: setSearchParams,
    defaults: LIST_DEFAULTS,
    filters: list.filters,
  })
  useRefreshWhileRunning()
  return (
    <>
      <ListReport<ImportRun>
        report={report}
        mode="pages"
        searchPlaceholder={t("history.search")}
        tableLabel={t("history.tableLabel")}
        columns={list.columns}
        countLabel={(count, value) => t("history.count", { count, value })}
        empty={
          <PageState
            kind="empty"
            icon={HistoryIcon}
            title={t("history.empty.title")}
            description={t("history.empty.description")}
          />
        }
      />
      {details ? (
        <RunDetails
          key={details.id}
          run={details}
          open={isDetailsOpen}
          onOpenChange={setDetailsOpen}
          finalFocus={opener}
        />
      ) : null}
    </>
  )
}

/**
 * Історія запусків імпорту на шаблоні List Report (SPEC §7, A4; ADR-0050): пошук за файлом, фільтри
 * цілі й стану, подробиці з причинами невдач. Лише читання. Без `import-runs:read` — «Немає доступу» без
 * запиту. Запуск, що йде, сторінка наздоганяє сама.
 */
export function HistoryPage() {
  const t = useImportExportT()
  const { isPending } = useAuthenticated()
  const access = useCanAccess({ resource: IMPORT_RUNS, action: "read" })
  const heading = usePageHeading(t("history.title"))
  return (
    <div className="space-y-6">
      <ListReportHeader
        title={t("history.title")}
        description={t("history.lead")}
        headingRef={heading}
      />
      {isPending || access.isPending ? (
        <PageSkeleton rows={6} />
      ) : access.error ? (
        <PageState
          kind="error"
          onRetry={() => {
            void access.refetch()
          }}
        />
      ) : access.canAccess ? (
        <RunsList />
      ) : (
        <PageState kind="forbidden" />
      )}
    </div>
  )
}
