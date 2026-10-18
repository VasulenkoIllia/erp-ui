import { useAuthenticated, useCanAccess } from "ra-core"
import { useCallback, useMemo, useState, type MouseEvent } from "react"
import { useSearchParams } from "react-router"

import { PageSkeleton, PageState } from "@/components/erp/page-state"
import {
  ListReport,
  ListReportHeader,
  useListReport,
  type ListReportAction,
} from "@/components/templates/list-report"
import { Button } from "@/components/ui/button"
import type { DataTableColumn } from "@/lib/data-table-core"
import { SHELL_ICONS } from "@/lib/icons"
import type { ListDefaults } from "@/lib/list-state"

import { AccessAction, useOpener } from "../components/access-action"
import { SegmentFormDialog, usePreloadForm } from "../components/form-dialogs"
import { usePageHeading } from "../components/use-page-heading"
import { SEGMENTS, type Segment } from "../contract"
import { useContactsT } from "../use-contacts-t"

/** Без параметрів в адресі: усі сегменти за назвою. */
const SEGMENT_LIST_DEFAULTS: ListDefaults = {
  tab: "all",
  sort: { field: "name", order: "ASC" },
  sortFields: ["name"],
}

type OpenForm = (segment: Segment, event: MouseEvent<HTMLElement>) => void

/**
 * Довідник сегментів (ADR-0027) на шаблоні List Report сторінками: пошук за назвою, сортування,
 * запам'ятаний розмір сторінки. «Створити сегмент» і назва сегмента відкривають форму в діалозі;
 * без права змінювати назва — текст. Після збереження список перечитується, фокус — на кнопку,
 * що відкрила форму.
 */
export function SegmentsListPage() {
  const t = useContactsT()
  // Без сесії ra-core перенаправить на вхід і повернеться сюди після входу.
  const { isPending } = useAuthenticated()
  const heading = usePageHeading(t("segments.title"))
  const [editing, setEditing] = useState<{ segment?: Segment } | null>(null)
  const opener = useOpener()
  usePreloadForm("segment", "create")
  const actions: (ListReportAction & { id: "create" })[] = [
    {
      id: "create",
      node: (
        <AccessAction
          resource={SEGMENTS}
          action="create"
          icon="create"
          label={t("segments.create")}
          deniedReason={t("segments.createDenied")}
          variant="default"
          onClick={(event) => {
            opener.remember(event)
            setEditing({})
          }}
        />
      ),
    },
  ]
  // Стабільна: від неї залежать колонки, а новий масив колонок перебудовує таблицю.
  const { remember } = opener
  const openEdit = useCallback<OpenForm>(
    (segment, event) => {
      remember(event)
      setEditing({ segment })
    },
    [remember],
  )
  const close = () => {
    setEditing(null)
  }
  // Шапка — над перевіркою сесії: той самий вузол від першого кадру (ADR-0022).
  return (
    <div className="space-y-6">
      <ListReportHeader
        title={t("segments.title")}
        description={t("segments.lead")}
        headingRef={heading}
        actions={isPending ? undefined : actions}
      />
      {isPending ? (
        <PageSkeleton rows={6} />
      ) : (
        <SegmentList onEdit={openEdit} />
      )}
      {editing ? (
        <SegmentFormDialog
          segment={editing.segment}
          finalFocus={opener.ref}
          onClose={close}
          onSaved={close}
        />
      ) : null}
    </div>
  )
}

/** Колонка назви: з правом змінювати — кнопка, що відкриває форму; без права — текст. */
function useSegmentColumns(
  onEdit: OpenForm,
): readonly (DataTableColumn<Segment> & { id: "name" })[] {
  const t = useContactsT()
  const { canAccess: canUpdate } = useCanAccess({
    resource: SEGMENTS,
    action: "update",
  })
  return useMemo(
    () => [
      {
        id: "name",
        header: t("segments.columns.name"),
        cell: (segment) =>
          canUpdate ? (
            <Button
              variant="link"
              className="h-auto min-h-7 px-0 font-medium"
              aria-label={t("segments.edit", { name: segment.name })}
              onClick={(event) => {
                onEdit(segment, event)
              }}
            >
              {segment.name}
            </Button>
          ) : (
            <span className="font-medium">{segment.name}</span>
          ),
        sortField: "name",
        minWidth: 14,
        grow: 1,
        sticky: true,
        card: "title",
      },
    ],
    [t, canUpdate, onEdit],
  )
}

function SegmentList({ onEdit }: { onEdit: OpenForm }) {
  const t = useContactsT()
  const [searchParams, setSearchParams] = useSearchParams()
  const columns = useSegmentColumns(onEdit)
  const report = useListReport({
    resource: SEGMENTS,
    params: searchParams,
    onParamsChange: setSearchParams,
    defaults: SEGMENT_LIST_DEFAULTS,
  })
  return (
    <ListReport
      report={report}
      mode="pages"
      searchPlaceholder={t("segments.search")}
      tableLabel={t("segments.tableLabel")}
      columns={columns}
      countLabel={(count, value) => t("segments.count", { count, value })}
      empty={
        <PageState
          kind="empty"
          icon={SHELL_ICONS.segments}
          title={t("segments.empty.title")}
          description={t("segments.empty.description")}
        />
      }
    />
  )
}
