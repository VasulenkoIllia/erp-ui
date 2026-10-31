import { useAuthenticated } from "ra-core"
import { useMemo, useState } from "react"
import { Link } from "react-router"

import { ExportDialog } from "@/components/erp/export-dialog"
import { PageSkeleton, PageState } from "@/components/erp/page-state"
import { DeniedAction } from "@/components/erp/permission-gate"
import {
  ListReportHeader,
  type ListReportAction,
} from "@/components/templates/list-report"
import { Button, buttonVariants } from "@/components/ui/button"
import { useMe } from "@/hooks/use-me"
import { usePageHeading } from "@/hooks/use-page-heading"
import { hasPermission } from "@/lib/auth"
import type { ImportTarget } from "@/lib/import-rows"
import { cn } from "@/lib/utils"

import { importRunPath, useImportExportModule } from "../module-context"
import { IMPORT_RUNS } from "../resources"
import { targetColumns } from "../targets"
import { useImportExportT } from "../use-import-export-t"
import { useImportExportTargets } from "../use-targets"

/** Скільки полів назвати в рядку цілі: досить, щоб зрозуміти, про що файл. */
const FIELDS_SHOWN = 4

function TargetRow({
  target,
  canImport,
  canExport,
  onExport,
}: {
  target: ImportTarget
  canImport: boolean
  canExport: boolean
  onExport: (target: ImportTarget) => void
}) {
  const t = useImportExportT()
  const { paths } = useImportExportModule()
  const importLabel = t("targets.importLabel", { target: target.label })
  const exportLabel = t("targets.exportLabel", { target: target.label })
  return (
    <li className="grid gap-3 p-4 @xl:grid-cols-[minmax(0,1fr)_auto] @xl:items-center">
      <div className="min-w-0">
        <h2 className="font-medium break-words">{target.label}</h2>
        <p className="text-sm break-words text-muted-foreground">
          {target.fields
            .slice(0, FIELDS_SHOWN)
            .map((field) => field.label)
            .join(", ")}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {canImport ? (
          <Link
            to={importRunPath(paths, target.resource)}
            aria-label={importLabel}
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            {t("targets.import")}
          </Link>
        ) : (
          <DeniedAction
            reason={t("targets.importDenied")}
            aria-label={importLabel}
          >
            {t("targets.import")}
          </DeniedAction>
        )}
        {canExport ? (
          <Button
            variant="outline"
            aria-label={exportLabel}
            onClick={() => {
              onExport(target)
            }}
          >
            {t("targets.export")}
          </Button>
        ) : (
          <DeniedAction
            reason={t("targets.exportDenied")}
            aria-label={exportLabel}
          >
            {t("targets.export")}
          </DeniedAction>
        )}
      </div>
    </li>
  )
}

/** Що людині показувати: експорт дає те, що вона й так бачить у списку, тож право — `read`. */
function useAllowedTargets() {
  const me = useMe()
  const targets = useImportExportTargets()
  const permissions = me.data?.permissions
  return {
    ...me,
    rows: permissions
      ? targets.flatMap((target) => {
          const canImport = hasPermission(
            permissions,
            target.resource,
            "create",
          )
          const canExport = hasPermission(permissions, target.resource, "read")
          return canImport || canExport
            ? [{ target, canImport, canExport }]
            : []
        })
      : [],
    canSeeHistory:
      permissions !== undefined &&
      hasPermission(permissions, IMPORT_RUNS, "read"),
  }
}

/**
 * Цілі імпорту й експорту (SPEC §7, A4; ADR-0050): рядок на кожну ціль із двома діями. Ціль без жодного
 * права не показано, без одного з прав дія неактивна й пояснює причину. Діалог лишається змонтованим
 * після закриття: фокус повертається на кнопку, а вибір колонок цілі зберігається.
 */
export function TargetsPage() {
  const t = useImportExportT()
  const heading = usePageHeading(t("targets.title"))
  const { paths, extension } = useImportExportModule()
  const { isPending } = useAuthenticated()
  const { rows, canSeeHistory, isError, refetch, data } = useAllowedTargets()
  const [exporting, setExporting] = useState<ImportTarget | null>(null)
  const [isExportOpen, setExportOpen] = useState(false)
  const columns = useMemo(
    () => (exporting ? targetColumns(exporting) : []),
    [exporting],
  )
  const actions: ListReportAction[] =
    canSeeHistory && extension.history?.page !== false
      ? [
          {
            id: "history",
            node: (
              <Link
                to={paths.history}
                className={cn(buttonVariants({ variant: "outline" }))}
              >
                {t("targets.history")}
              </Link>
            ),
          },
        ]
      : []
  return (
    <div className="space-y-6">
      <ListReportHeader
        title={t("targets.title")}
        description={t("targets.lead")}
        headingRef={heading}
        actions={actions}
      />
      {isError ? (
        <PageState
          kind="error"
          onRetry={() => {
            void refetch()
          }}
        />
      ) : isPending || data === undefined ? (
        <PageSkeleton rows={6} />
      ) : rows.length ? (
        <ul
          aria-label={t("targets.listLabel")}
          className="@container divide-y rounded-lg border"
        >
          {rows.map((row) => (
            <TargetRow
              key={row.target.resource}
              {...row}
              onExport={(target) => {
                setExporting(target)
                setExportOpen(true)
              }}
            />
          ))}
        </ul>
      ) : (
        <PageState kind="forbidden" />
      )}
      {exporting ? (
        <ExportDialog
          key={exporting.resource}
          open={isExportOpen}
          onOpenChange={setExportOpen}
          resource={exporting.resource}
          title={exporting.label}
          fileName={exporting.resource}
          columns={columns}
        />
      ) : null}
    </div>
  )
}
