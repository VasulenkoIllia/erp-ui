import { useAuthenticated, useCanAccess } from "ra-core"
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type RefObject,
} from "react"
import { useSearchParams } from "react-router"
import type { LucideIcon } from "lucide-react"

import { ConfirmDialog } from "@/components/erp/confirm-dialog"
import { PageSkeleton, PageState } from "@/components/erp/page-state"
import { DeniedAction, PermissionGate } from "@/components/erp/permission-gate"
import {
  ListReport,
  ListReportHeader,
  useListReport,
  type ListReportAction,
} from "@/components/templates/list-report"
import { Button } from "@/components/ui/button"
import { useExtendedList } from "@/hooks/use-extended-list"
import { useHasPermission } from "@/hooks/use-me"
import { usePageHeading } from "@/hooks/use-page-heading"
import type {
  ExtensionColumn,
  ExtensionColumnChange,
  ExtensionFilter,
} from "@/lib/extension-fields"
import type { KeyedChanges } from "@/lib/extensions"
import type { FilterDefinition } from "@/lib/filters"
import { ACTION_ICONS } from "@/lib/icons"
import type { ListDefaults } from "@/lib/list-state"

import type { DictionaryEntry } from "../contract"
import type { DictionaryFilterId } from "../extension"
import { useDictionariesT } from "../use-dictionaries-t"
import {
  useEntryColumns,
  type DictionaryColumn,
  type EntryAction,
} from "./dictionary-columns"
import { useDefaultEntryId } from "./use-default-entry"
import { useEntryToggle } from "./use-entry-toggle"

/** Розділ рядків модуля: `taxes.title`, `units.form.saved`. */
export type DictionaryStrings =
  "taxes" | "units" | "paymentTerms" | "tags" | "reasons"

const LIST_DEFAULTS: ListDefaults = {
  tab: "all",
  sort: { field: "name", order: "ASC" },
  sortFields: ["name"],
}
const NO_TABS = [] as const
/** Назва — заголовок картки на телефоні й кнопка форми: розширення її не ховає. */
const LOCKED_COLUMNS = ["name"] as const

export interface DictionaryFormProps<T> {
  /** Значення для зміни; без нього — нове. */
  readonly entry?: T
  readonly onClose: () => void
  readonly finalFocus: RefObject<HTMLElement | null>
}

interface DictionaryIds {
  column: string
  filter: string
  tab: never
}

interface DictionaryListExtension<Ids extends DictionaryIds> {
  readonly columns?: KeyedChanges<
    ExtensionColumn,
    Ids["column"],
    ExtensionColumnChange
  >
  readonly filters?: KeyedChanges<ExtensionFilter, Ids["filter"]>
}

export interface DictionaryPageProps<
  T extends DictionaryEntry,
  Ids extends DictionaryIds,
> {
  readonly resource: string
  readonly strings: DictionaryStrings
  readonly icon: LucideIcon
  /** Колонки довідника між назвою й станом; стабільні між рендерами. */
  readonly columns: readonly DictionaryColumn<T, Ids["column"]>[]
  /** Фільтри довідника після фільтра стану; стабільні між рендерами. */
  readonly filters?: readonly (FilterDefinition & { id: Ids["filter"] })[]
  readonly extension?: DictionaryListExtension<Ids>
  /** Форма значення в діалозі; стабільна між рендерами. */
  readonly form: ComponentType<DictionaryFormProps<T>>
}

const NO_FILTERS = [] as const

/**
 * Сторінка довідника на шаблоні List Report сторінками (SPEC §7; ADR-0047): пошук за назвою, фільтр
 * стану, форма в діалозі, «Вимкнути» в рядку; значення не видаляються. Без `<ресурс>:read` — «Немає
 * доступу» без запиту. Показано всі значення: вимкнене лишається в рядку, а не зникає з-під рук.
 */
export function DictionaryPage<
  T extends DictionaryEntry,
  Ids extends DictionaryIds,
>({
  resource,
  strings,
  icon,
  columns,
  filters = NO_FILTERS,
  extension,
  form: Form,
}: DictionaryPageProps<T, Ids>) {
  const t = useDictionariesT()
  const { isPending } = useAuthenticated()
  const access = useCanAccess({ resource, action: "read" })
  const heading = usePageHeading(t(`${strings}.title`))
  const [editing, setEditing] = useState<{ entry?: T } | null>(null)
  const opener = useRef<HTMLElement | null>(null)
  const Create = ACTION_ICONS.create
  const onEdit = useCallback<EntryAction<T>>((entry, event) => {
    opener.current = event.currentTarget
    setEditing({ entry })
  }, [])
  const actions: (ListReportAction & { id: "create" })[] = [
    {
      id: "create",
      node: (
        <PermissionGate
          resource={resource}
          action="create"
          fallback={
            <DeniedAction reason={t(`${strings}.createDenied`)}>
              <Create aria-hidden />
              {t(`${strings}.create`)}
            </DeniedAction>
          }
        >
          <Button
            onClick={(event) => {
              opener.current = event.currentTarget
              setEditing({})
            }}
          >
            <Create aria-hidden />
            {t(`${strings}.create`)}
          </Button>
        </PermissionGate>
      ),
    },
  ]
  return (
    <div className="space-y-6">
      <ListReportHeader
        title={t(`${strings}.title`)}
        description={t(`${strings}.lead`)}
        headingRef={heading}
        actions={isPending ? undefined : actions}
      />
      {isPending || access.isPending ? (
        <PageSkeleton rows={6} />
      ) : access.canAccess ? (
        <DictionaryList<T, Ids>
          resource={resource}
          strings={strings}
          icon={icon}
          columns={columns}
          filters={filters}
          extension={extension}
          heading={heading}
          onEdit={onEdit}
        />
      ) : (
        <PageState kind="forbidden" />
      )}
      {editing ? (
        <Form
          entry={editing.entry}
          finalFocus={opener}
          onClose={() => {
            setEditing(null)
          }}
        />
      ) : null}
    </div>
  )
}

/** Типове значення, яке вимикають: окремо від `open`, щоб текст не зникав, поки діалог закривається. */
interface EntryToDisable<T> {
  readonly entry: T
  readonly button: HTMLElement
}

interface DictionaryListProps<
  T extends DictionaryEntry,
  Ids extends DictionaryIds,
> extends Omit<DictionaryPageProps<T, Ids>, "form" | "filters"> {
  readonly filters: readonly (FilterDefinition & { id: Ids["filter"] })[]
  readonly heading: RefObject<HTMLHeadingElement | null>
  readonly onEdit: EntryAction<T>
}

function DictionaryList<T extends DictionaryEntry, Ids extends DictionaryIds>({
  resource,
  strings,
  icon,
  columns,
  filters,
  extension,
  heading,
  onEdit,
}: DictionaryListProps<T, Ids>) {
  const t = useDictionariesT()
  const [searchParams, setSearchParams] = useSearchParams()
  const canUpdate = useHasPermission(resource, "update")
  const { toggle, isSaving } = useEntryToggle<T>(resource, heading)
  const defaultId = useDefaultEntryId(resource)
  const [disabling, setDisabling] = useState<EntryToDisable<T> | null>(null)
  const [isConfirming, setConfirming] = useState(false)
  const onToggle = useCallback<EntryAction<T>>(
    (entry, event) => {
      if (entry.active && entry.id === defaultId) {
        setDisabling({ entry, button: event.currentTarget })
        setConfirming(true)
        return
      }
      void toggle(entry, event.currentTarget)
    },
    [toggle, defaultId],
  )
  const entry = useEntryColumns<T>({
    canUpdate,
    defaultId,
    isSaving,
    onEdit,
    onToggle,
  })
  const allColumns = useMemo(
    () => [entry.name, ...columns, entry.status, ...entry.actions],
    [entry, columns],
  )
  const allFilters = useMemo(() => {
    const active: FilterDefinition & { id: DictionaryFilterId } = {
      kind: "options",
      id: "active",
      field: "active",
      label: t("common.filters.active"),
      options: [
        { value: "true", label: t("common.status.active") },
        { value: "false", label: t("common.status.disabled") },
      ],
    }
    return [active, ...filters]
  }, [t, filters])
  const list = useExtendedList<T, Ids>(
    allColumns,
    allFilters,
    NO_TABS,
    extension,
    LOCKED_COLUMNS,
  )
  const report = useListReport({
    resource,
    params: searchParams,
    onParamsChange: setSearchParams,
    defaults: LIST_DEFAULTS,
    filters: list.filters,
  })
  return (
    <>
      <ListReport
        report={report}
        mode="pages"
        searchPlaceholder={t(`${strings}.search`)}
        tableLabel={t(`${strings}.tableLabel`)}
        columns={list.columns}
        countLabel={(count, value) => t(`${strings}.count`, { count, value })}
        empty={
          <PageState
            kind="empty"
            icon={icon}
            title={t(`${strings}.empty.title`)}
            description={t(`${strings}.empty.description`)}
          />
        }
      />
      <ConfirmDialog
        open={isConfirming}
        title={t("common.disableDefault.title")}
        description={t("common.disableDefault.description", {
          name: disabling?.entry.name,
        })}
        confirmLabel={t("common.disableDefault.confirm")}
        destructive
        onClose={() => {
          setConfirming(false)
        }}
        onConfirm={() => {
          setConfirming(false)
          if (disabling) void toggle(disabling.entry, disabling.button)
        }}
      />
    </>
  )
}
