import { MessageSquareWarningIcon } from "lucide-react"
import { useMemo } from "react"

import { StatusBadge } from "@/components/erp/status-badge"
import type { FilterDefinition } from "@/lib/filters"

import type { DictionaryColumn } from "../components/dictionary-columns"
import { DictionaryPage } from "../components/dictionary-page"
import { ReasonFormDialog } from "../components/reason-form"
import { useReasonKinds } from "../components/use-reason-kinds"
import { REASONS, type Reason } from "../contract"
import type { ReasonColumnId, ReasonFilterId } from "../extension"
import { useDictionariesModule } from "../module-context"
import { useDictionariesT } from "../use-dictionaries-t"

interface ReasonIds {
  column: ReasonColumnId
  filter: ReasonFilterId
  tab: never
}

/**
 * Причини (ADR-0047): де застосовується і чи потрібен коментар. Сторінка — `DictionaryPage`, види —
 * `useReasonKinds`.
 */
export function ReasonsPage() {
  const t = useDictionariesT()
  const { extension } = useDictionariesModule()
  const kinds = useReasonKinds()
  const columns = useMemo(
    (): readonly DictionaryColumn<Reason, ReasonColumnId>[] => [
      {
        id: "kind",
        header: t("reasons.columns.kind"),
        cell: (reason) => (
          <StatusBadge status={kinds.byId.get(reason.kind) ?? reason.kind} />
        ),
        minWidth: 10,
        grow: 1,
      },
      {
        id: "commentRequired",
        header: t("reasons.columns.commentRequired"),
        cell: (reason) =>
          t(reason.commentRequired ? "common.yes" : "common.no"),
        minWidth: 9,
        grow: 0,
      },
    ],
    [t, kinds],
  )
  const filters = useMemo(
    (): readonly (FilterDefinition & { id: ReasonFilterId })[] => [
      {
        kind: "options",
        id: "kind",
        field: "kind",
        label: t("reasons.filters.kind"),
        options: kinds.options.map(({ id, label }) => ({ value: id, label })),
      },
    ],
    [t, kinds],
  )
  return (
    <DictionaryPage<Reason, ReasonIds>
      resource={REASONS}
      strings="reasons"
      icon={MessageSquareWarningIcon}
      columns={columns}
      filters={filters}
      extension={extension.reasons}
      form={ReasonFormDialog}
    />
  )
}
