import { useMemo, type MouseEvent } from "react"

import { DeniedAction } from "@/components/erp/permission-gate"
import { StatusBadge } from "@/components/erp/status-badge"
import { Button } from "@/components/ui/button"
import { useRecordDenialReason } from "@/hooks/use-record-access"
import type { DataTableColumn } from "@/lib/data-table-core"
import { ACTION_ICONS } from "@/lib/icons"

import type { DictionaryEntry } from "../contract"
import { useDictionariesT } from "../use-dictionaries-t"

export type DictionaryColumn<
  T,
  TId extends string = string,
> = DataTableColumn<T> & { id: TId }

/** Дія над значенням із рядка: подія дає кнопку, на яку повернеться фокус. */
export type EntryAction<T> = (entry: T, event: MouseEvent<HTMLElement>) => void

interface EntryColumnsOptions<T> {
  readonly canUpdate: boolean
  /** Значення, що стоїть типовим: позначка біля назви. */
  readonly defaultId: string | null
  readonly isSaving: boolean
  readonly onEdit: EntryAction<T>
  readonly onToggle: EntryAction<T>
}

/**
 * Спільні колонки довідника: назва, стан і дії. Назва — з правом змінювати кнопка, що відкриває форму,
 * інакше текст. «Вимкнути» чи «Увімкнути» — у колонці дій; значення, зміну якого забороняє сервер
 * (`deniedActions`, ADR-0037), — неактивна «Змінити» з причиною. Без права змінювати колонки дій немає.
 */
export function useEntryColumns<T extends DictionaryEntry>({
  canUpdate,
  defaultId,
  isSaving,
  onEdit,
  onToggle,
}: EntryColumnsOptions<T>) {
  const t = useDictionariesT()
  const recordReason = useRecordDenialReason()
  return useMemo(() => {
    const lockedBy = (entry: T) =>
      canUpdate ? recordReason(entry, "update") : undefined
    const name: DictionaryColumn<T, "name"> = {
      id: "name",
      header: t("common.columns.name"),
      cell: (entry) => (
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {canUpdate && !lockedBy(entry) ? (
            <Button
              variant="link"
              className="h-auto min-h-7 px-0 font-medium whitespace-normal"
              aria-label={t("common.edit", { name: entry.name })}
              onClick={(event) => {
                onEdit(entry, event)
              }}
            >
              {entry.name}
            </Button>
          ) : (
            <span className="font-medium">{entry.name}</span>
          )}
          {entry.id === defaultId ? (
            <StatusBadge
              status={{
                id: "default",
                label: t("common.defaultBadge"),
                tone: "info",
              }}
            />
          ) : null}
        </span>
      ),
      sortField: "name",
      minWidth: 14,
      grow: 2,
      sticky: true,
      card: "title",
    }
    const status: DictionaryColumn<T, "status"> = {
      id: "status",
      header: t("common.columns.status"),
      cell: (entry) => (
        <StatusBadge
          status={
            entry.active
              ? {
                  id: "active",
                  label: t("common.status.active"),
                  tone: "success",
                }
              : {
                  id: "disabled",
                  label: t("common.status.disabled"),
                  tone: "neutral",
                }
          }
        />
      ),
      minWidth: 8,
      grow: 0,
      card: "badge",
    }
    const actions: DictionaryColumn<T, "actions"> = {
      id: "actions",
      header: t("common.columns.actions"),
      headerHidden: true,
      cell: (entry) => {
        const reason = lockedBy(entry)
        const Lock = ACTION_ICONS.lock
        return reason ? (
          <DeniedAction
            variant="ghost"
            size="sm"
            reason={reason}
            aria-label={t("common.edit", { name: entry.name })}
          >
            <Lock aria-hidden />
            {t("common.editShort")}
          </DeniedAction>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            disabled={isSaving}
            focusableWhenDisabled
            aria-label={t(
              entry.active ? "common.disableFor" : "common.enableFor",
              { name: entry.name },
            )}
            onClick={(event) => {
              onToggle(entry, event)
            }}
          >
            {t(entry.active ? "common.disable" : "common.enable")}
          </Button>
        )
      },
      minWidth: 8,
      grow: 0,
      align: "end",
      card: "actions",
    }
    return { name, status, actions: canUpdate ? [actions] : [] }
  }, [t, canUpdate, defaultId, recordReason, isSaving, onEdit, onToggle])
}
