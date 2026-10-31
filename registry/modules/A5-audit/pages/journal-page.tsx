import { useMemo } from "react"
import { useAuthenticated, useCanAccess } from "ra-core"

import { AuditLog } from "@/components/erp/audit-log"
import { PageSkeleton, PageState } from "@/components/erp/page-state"
import { useRecordHistorySheet } from "@/components/erp/record-history"
import { ListReportHeader } from "@/components/templates/list-report"
import { usePageHeading } from "@/hooks/use-page-heading"
import { localizedText, type LocalizedText } from "@/lib/auth"
import { useLanguage } from "@/lib/i18n"

import { AUDIT } from "../resources"
import { useAuditModule } from "../module-context"
import { useAuditT } from "../use-audit-t"

type ActionLabels = Readonly<Record<string, LocalizedText>>

/** Назви дій проекту мовою інтерфейсу. */
function useActionLabels(labels: ActionLabels | undefined) {
  const { language } = useLanguage()
  return useMemo(
    () =>
      labels &&
      Object.fromEntries(
        Object.entries(labels).flatMap(([action, label]) => {
          const text = localizedText(label, language)
          return text ? [[action, text]] : []
        }),
      ),
    [labels, language],
  )
}

/**
 * Журнал аудиту компанії (SPEC §7, A5; ADR-0013, ADR-0045): частина кіта `erp/audit-log` під шапкою
 * списку, з рядка події відкривається шухляда історії запису. Без `audit:read` — «Немає доступу» без
 * запиту. Шаблон List Report тут не підходить: журнал лише читається, має свій контракт і довантажує
 * події кнопкою.
 */
export function JournalPage() {
  const t = useAuditT()
  const { extension } = useAuditModule()
  // Без сесії ra-core перенаправить на вхід і повернеться сюди після входу.
  const { isPending } = useAuthenticated()
  const access = useCanAccess({ resource: AUDIT, action: "read" })
  const heading = usePageHeading(t("journal.title"))
  const actionLabels = useActionLabels(extension.journal?.actionLabels)
  const history = useRecordHistorySheet({ actionLabels })
  // Шапка — над перевіркою сесії: той самий вузол від першого кадру (ADR-0022).
  return (
    <div className="space-y-6">
      <ListReportHeader
        title={t("journal.title")}
        description={t("journal.lead")}
        headingRef={heading}
      />
      {isPending || access.isPending ? (
        <PageSkeleton rows={6} />
      ) : access.canAccess ? (
        <>
          <AuditLog
            actionLabels={actionLabels}
            exportable={extension.journal?.export !== false}
            onRecordHistory={history.open}
          />
          {history.sheet}
        </>
      ) : (
        <PageState kind="forbidden" />
      )}
    </div>
  )
}
