import { useAuthenticated, useCanAccess } from "ra-core"
import { useCallback, useMemo, useState, type MouseEvent } from "react"
import { useSearchParams } from "react-router"

import { PageSkeleton, PageState } from "@/components/erp/page-state"
import { DeniedAction } from "@/components/erp/permission-gate"
import {
  ListReport,
  ListReportHeader,
  useListReport,
  type ListReportAction,
} from "@/components/templates/list-report"
import { Button } from "@/components/ui/button"
import { usePageHeading } from "@/hooks/use-page-heading"
import { useRecordDenialReason } from "@/hooks/use-record-access"
import type { DataTableColumn } from "@/lib/data-table-core"
import { ACTION_ICONS, SHELL_ICONS } from "@/lib/icons"
import type { ListDefaults } from "@/lib/list-state"

import { AccessAction, useOpener } from "../components/access-action"
import { SegmentFormDialog, usePreloadForm } from "../components/form-dialogs"
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
 * без права змінювати назва — текст; сегмент, зміну якого забороняє сервер (спільний, ADR-0037), —
 * назва текстом і неактивна «Змінити» з замком і причиною в колонці дій. Після збереження список
 * перечитується, фокус — на кнопку, що відкрила форму.
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

type SegmentColumn = DataTableColumn<Segment> & { id: "name" | "actions" }

/**
 * Колонки: назва — з правом змінювати кнопка, що відкриває форму, інакше текст; «Дії» — неактивна
 * «Змінити» з причиною, коли сервер забороняє зміну сегмента (спільний, ADR-0037), інакше порожньо;
 * без права змінювати колонки дій немає.
 * Замок окремою колонкою: назва картки на телефоні — лише назва сегмента, без причини.
 */
function useSegmentColumns(onEdit: OpenForm): readonly SegmentColumn[] {
  const t = useContactsT()
  const { canAccess: canUpdate } = useCanAccess({
    resource: SEGMENTS,
    action: "update",
  })
  const recordReason = useRecordDenialReason()
  return useMemo(() => {
    const lockedBy = (segment: Segment) =>
      canUpdate ? recordReason(segment, "update") : undefined
    const columns: SegmentColumn[] = [
      {
        id: "name",
        header: t("segments.columns.name"),
        cell: (segment) =>
          canUpdate && !lockedBy(segment) ? (
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
      {
        id: "actions",
        header: t("segments.columns.actions"),
        headerHidden: true,
        cell: (segment) => {
          const reason = lockedBy(segment)
          return reason ? (
            <LockedSegmentEdit segment={segment} reason={reason} />
          ) : null
        },
        minWidth: 7,
        grow: 0,
        align: "end",
        card: "actions",
      },
    ]
    // Без права змінювати замка не буває: колонка дій лише порожніла б.
    return canUpdate
      ? columns
      : columns.filter((column) => column.id !== "actions")
  }, [t, canUpdate, recordReason, onEdit])
}

/**
 * «Змінити» сегмента, який не змінити (спільний): неактивна з замком, підписом і причиною. Підпис
 * видно й на телефоні, де підказка на дотик не відкривається.
 */
function LockedSegmentEdit({
  segment,
  reason,
}: {
  segment: Segment
  reason: string
}) {
  const t = useContactsT()
  const Lock = ACTION_ICONS.lock
  return (
    <DeniedAction
      variant="ghost"
      size="sm"
      reason={reason}
      aria-label={t("segments.edit", { name: segment.name })}
    >
      <Lock aria-hidden />
      {t("segments.editShort")}
    </DeniedAction>
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
