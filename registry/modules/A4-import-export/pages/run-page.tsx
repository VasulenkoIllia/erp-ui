import { useAuthenticated, useCanAccess } from "ra-core"
import { useNavigate, useParams } from "react-router"

import { ImportWizard } from "@/components/erp/import-wizard"
import { PageSkeleton, PageState } from "@/components/erp/page-state"
import { BackToList } from "@/components/erp/record-link"
import { useHasPermission } from "@/hooks/use-me"
import { usePageHeading } from "@/hooks/use-page-heading"

import { useImportExportModule } from "../module-context"
import { IMPORT_RUNS } from "../resources"
import { useImportExportT } from "../use-import-export-t"
import { useImportExportTargets } from "../use-targets"

/**
 * Майстер імпорту цілі (SPEC §7, A4; ADR-0049, ADR-0050). Адреса — ціль, тож посилання «Імпорт» зі своєї
 * сторінки проекту веде сюди. Без права створювати — «Немає доступу» без запиту, невідома ціль — «не
 * знайдено», без права змінювати дублі лише пропускаються. «Готово» веде до історії, а без неї до цілей.
 * Інша ціль — інший майстер: файл і колонки попередньої сюди не переходять.
 */
export function RunPage() {
  const t = useImportExportT()
  const navigate = useNavigate()
  const { target: resource = "" } = useParams()
  const { paths, extension } = useImportExportModule()
  const target = useImportExportTargets().find(
    (item) => item.resource === resource,
  )
  const { isPending } = useAuthenticated()
  const access = useCanAccess({
    resource,
    action: "create",
    enabled: target !== undefined,
  })
  const canUpdate = useHasPermission(resource, "update")
  const canSeeHistory = useHasPermission(IMPORT_RUNS, "read")
  const isReady = !isPending && !access.isPending
  const title = target
    ? t("run.title", { target: target.label })
    : t("targets.title")
  const heading = usePageHeading(title, isReady)
  if (!target) return <PageState kind="not-found" headingLevel={1} />
  if (!isReady) return <PageSkeleton rows={6} />
  if (access.error)
    return (
      <PageState
        kind="error"
        headingLevel={1}
        onRetry={() => {
          void access.refetch()
        }}
      />
    )
  if (!access.canAccess) return <PageState kind="forbidden" headingLevel={1} />
  const back = <BackToList to={paths.targets} label={t("run.back")} />
  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      {back}
      <ImportWizard
        key={target.resource}
        target={target}
        canUpdate={canUpdate}
        title={title}
        headingRef={heading}
        onDone={() => {
          void navigate(
            canSeeHistory && extension.history?.page !== false
              ? paths.history
              : paths.targets,
          )
        }}
      />
    </div>
  )
}
