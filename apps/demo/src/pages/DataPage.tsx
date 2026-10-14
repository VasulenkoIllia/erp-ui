import { Search } from "lucide-react"
import {
  useAuthenticated,
  useCanAccess,
  useUpdate,
  type SortPayload,
} from "ra-core"
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
  type FormEvent,
} from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { ConflictDialog } from "@/registry/erp/conflict-dialog"
import { PageSkeleton, PageState } from "@/registry/erp/page-state"
import { useApiErrorMessage } from "@/registry/hooks/use-api-error-message"
import { useMe } from "@/registry/hooks/use-me"
import { isApiError } from "@/registry/lib/api"
import { useErpUiT } from "@/registry/lib/i18n"
import { ACTION_ICONS, MODULE_ICONS } from "@/registry/lib/icons"
import { Button } from "@/registry/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/registry/ui/dialog"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/registry/ui/field"
import { Input } from "@/registry/ui/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/registry/ui/input-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/registry/ui/select"
import { Spinner } from "@/registry/ui/spinner"

import {
  INVOICE_STATUSES,
  type Invoice,
  type InvoiceStatus,
} from "@/data/invoices"

import { InvoiceTable, type InvoiceTableProps } from "./invoice-table"
import { PageHeader } from "./PageHeader"

const usePageT = () => useTranslation("demo", { keyPrefix: "dataPage" }).t

const RESOURCE = "invoices"

type StatusFilter = InvoiceStatus | "all"
type ViewMode = "scroll" | "pages"

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(value)
    }, ms)
    return () => {
      clearTimeout(timer)
    }
  }, [value, ms])
  return debounced
}

/**
 * Стрес-сторінка (SPEC §18.1, крок 0.6b): 10 000 рахунків з мок-сервера через ra-core у
 * erp/data-table. Прокрутка вікнами по 100 (useWindowedList) або звичайні сторінки (useGetList),
 * фільтри й сортування на сервері, права на редагування, збереження з версією й діалог конфлікту.
 */
export function DataPage() {
  const t = usePageT()
  // Без сесії ra-core перенаправить на /login і повернеться сюди після входу.
  const { isPending } = useAuthenticated()
  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} lead={t("lead")} />
      {isPending ? <PageSkeleton rows={8} /> : <InvoiceList />}
    </div>
  )
}

function InvoiceList() {
  const t = usePageT()
  const ids = useId()
  const { data: me } = useMe()
  const [status, setStatus] = useState<StatusFilter>("all")
  const [search, setSearch] = useState("")
  const query = useDebounced(search.trim(), 300)
  const [sort, setSort] = useState<SortPayload>({
    field: "date",
    order: "DESC",
  })
  const [view, setView] = useState<ViewMode>("scroll")
  const [editing, setEditing] = useState<Invoice | null>(null)
  const { canAccess: canEdit } = useCanAccess({
    resource: RESOURCE,
    action: "edit",
  })

  const filter = useMemo(
    () => ({
      ...(status === "all" ? {} : { status }),
      ...(query ? { q: query } : {}),
    }),
    [status, query],
  )
  const resetFilters = useCallback(() => {
    setSearch("")
    setStatus("all")
  }, [])

  const statusItems = [
    { value: "all", label: t("all") },
    ...INVOICE_STATUSES.map((value) => ({
      value,
      label: t(`statuses.${value}`),
    })),
  ]

  const listProps: InvoiceTableProps = {
    view,
    canEdit: canEdit === true,
    onEdit: setEditing,
    filter,
    sort,
    onSortChange: setSort,
    isFiltered: status !== "all" || query !== "",
    onResetFilters: resetFilters,
    empty: (
      <PageState
        kind="empty"
        icon={MODULE_ICONS.K2}
        action={
          <Button
            onClick={() => {
              toast(t("createInvoice"))
            }}
          >
            <ACTION_ICONS.create aria-hidden />
            {t("createInvoice")}
          </Button>
        }
      />
    ),
  }

  return (
    <div className="space-y-4">
      {me ? (
        <p className="text-sm text-muted-foreground">
          {t("permissionsNote", {
            name: me.name,
            roles: me.roles
              .map((role) => t(`roles.${role}`, { defaultValue: role }))
              .join(", "),
          })}
        </p>
      ) : null}
      <div className="flex flex-col gap-3 @2xl:flex-row @2xl:items-end">
        <Field className="@2xl:max-w-sm">
          <FieldLabel htmlFor={`${ids}-search`} className="sr-only">
            {t("search")}
          </FieldLabel>
          <InputGroup>
            <InputGroupAddon>
              <Search aria-hidden />
            </InputGroupAddon>
            <InputGroupInput
              id={`${ids}-search`}
              type="search"
              placeholder={t("search")}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
              }}
            />
          </InputGroup>
        </Field>
        {/* На телефоні статус і подання — в одному рядку, щоб списку лишилось більше місця. */}
        <div className="flex items-end gap-3 @2xl:contents">
          <Field className="min-w-0 flex-1 @2xl:w-56 @2xl:flex-none">
            <FieldLabel htmlFor={`${ids}-status`} className="sr-only">
              {t("statusFilter")}
            </FieldLabel>
            <Select
              items={statusItems}
              value={status}
              onValueChange={(value: StatusFilter | null) => {
                setStatus(value ?? "all")
              }}
            >
              <SelectTrigger id={`${ids}-status`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statusItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div
            role="group"
            aria-label={t("view.label")}
            className="flex shrink-0 gap-1 @2xl:ms-auto"
          >
            {(["scroll", "pages"] as const).map((mode) => (
              <Button
                key={mode}
                variant={view === mode ? "secondary" : "ghost"}
                aria-pressed={view === mode}
                onClick={() => {
                  setView(mode)
                }}
              >
                {t(`view.${mode}`)}
              </Button>
            ))}
          </div>
        </div>
      </div>
      <InvoiceTable {...listProps} />
      {editing ? (
        <EditInvoiceDialog
          key={`${editing.id}-${String(editing.version)}`}
          invoice={editing}
          onReplace={setEditing}
          onClose={() => {
            setEditing(null)
          }}
        />
      ) : null}
    </div>
  )
}

type EditValues = Pick<Invoice, "client" | "status">

function EditInvoiceDialog({
  invoice,
  onReplace,
  onClose,
}: {
  invoice: Invoice
  /** Показати в формі іншу версію запису (після «Взяти збережене»). */
  onReplace: (invoice: Invoice) => void
  onClose: () => void
}) {
  const t = usePageT()
  const kitT = useErpUiT()
  const errorMessage = useApiErrorMessage()
  const ids = useId()
  const [values, setValues] = useState<EditValues>({
    client: invoice.client,
    status: invoice.status,
  })
  const [clientError, setClientError] = useState<string | null>(null)
  const [conflict, setConflict] = useState<Invoice | null>(null)
  const [update, { isPending: saving }] = useUpdate<Invoice>()

  const statusItems = INVOICE_STATUSES.map((value) => ({
    value,
    label: t(`statuses.${value}`),
  }))

  const save = (version: number) => {
    void update(
      RESOURCE,
      {
        id: invoice.id,
        data: { ...values, version },
        previousData: invoice,
      },
      {
        mutationMode: "pessimistic",
        onSuccess: () => {
          toast.success(t("saved"))
          onClose()
        },
        onError: (error) => {
          if (isApiError(error) && error.code === "conflict") {
            setConflict(error.current as Invoice)
            return
          }
          if (isApiError(error) && error.fieldErrors?.client) {
            setClientError(errorMessage(error))
            return
          }
          toast.error(t("saveFailed", { message: errorMessage(error) }))
        },
      },
    )
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!values.client.trim()) {
      setClientError(kitT("validation.required"))
      return
    }
    setClientError(null)
    save(invoice.version)
  }

  const statusLabel = (status: InvoiceStatus) => t(`statuses.${status}`)

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>
              {t("editTitle", { number: invoice.number })}
            </DialogTitle>
            <DialogDescription>{t("editDescription")}</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field data-invalid={clientError ? true : undefined}>
              <FieldLabel htmlFor={`${ids}-client`}>{t("client")}</FieldLabel>
              <Input
                id={`${ids}-client`}
                value={values.client}
                required
                aria-invalid={clientError ? true : undefined}
                onChange={(event) => {
                  setValues((v) => ({ ...v, client: event.target.value }))
                }}
              />
              {clientError ? <FieldError>{clientError}</FieldError> : null}
            </Field>
            <Field>
              <FieldLabel htmlFor={`${ids}-status`}>
                {t("columns.status")}
              </FieldLabel>
              <Select
                items={statusItems}
                value={values.status}
                onValueChange={(value: InvoiceStatus | null) => {
                  if (value) setValues((v) => ({ ...v, status: value }))
                }}
              >
                <SelectTrigger id={`${ids}-status`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statusItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Spinner aria-hidden /> : null}
              {t("save")}
            </Button>
          </DialogFooter>
        </form>
        {/* Вкладений діалог: Base UI тримає фокус у ньому й повертає у форму. */}
        <ConflictDialog
          open={conflict !== null}
          onOpenChange={(open) => {
            if (!open) setConflict(null)
          }}
          fields={
            conflict
              ? [
                  {
                    key: "client",
                    label: t("client"),
                    mine: values.client,
                    theirs: conflict.client,
                  },
                  {
                    key: "status",
                    label: t("columns.status"),
                    mine: statusLabel(values.status),
                    theirs: statusLabel(conflict.status),
                  },
                ]
              : []
          }
          onOverwrite={() => {
            const latest = conflict
            setConflict(null)
            if (latest) save(latest.version)
          }}
          onReload={() => {
            const latest = conflict
            setConflict(null)
            if (latest) {
              onReplace(latest)
              toast(t("reloaded"))
            }
          }}
        />
      </DialogContent>
    </Dialog>
  )
}
