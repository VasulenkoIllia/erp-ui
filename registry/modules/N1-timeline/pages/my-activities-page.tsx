import { useAuthenticated } from "ra-core"

import { PageSkeleton } from "@/components/erp/page-state"
import { ListReportHeader } from "@/components/templates/list-report"
import { usePageHeading } from "@/hooks/use-page-heading"

import { MyActivities } from "../components/my-activities"
import { useTimelineT } from "../use-timeline-t"

/**
 * Сторінка «Мої справи» (SPEC §7, N1; ADR-0054) під шапкою списку. Шаблон List Report не підходить:
 * колонок, фільтрів полів і масових дій тут немає, дія виконується в рядку.
 */
export function MyActivitiesPage() {
  const t = useTimelineT()
  // Без сесії ra-core перенаправить на вхід і повернеться сюди після входу.
  const { isPending } = useAuthenticated()
  const heading = usePageHeading(t("myActivities.title"))
  // Шапка — над перевіркою сесії: той самий вузол від першого кадру (ADR-0022).
  return (
    <div className="space-y-6">
      <ListReportHeader
        title={t("myActivities.title")}
        description={t("myActivities.lead")}
        headingRef={heading}
      />
      {isPending ? (
        <PageSkeleton rows={6} />
      ) : (
        <MyActivities heading={heading} />
      )}
    </div>
  )
}
