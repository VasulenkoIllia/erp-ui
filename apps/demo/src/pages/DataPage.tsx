import { keepPreviousData } from "@tanstack/react-query"
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Search,
  type LucideIcon,
} from "lucide-react"
import {
  useAuthenticated,
  useCanAccess,
  useGetList,
  useUpdate,
  type SortPayload,
} from "ra-core"
import { useEffect, useId, useMemo, useState, type FormEvent } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { ConflictDialog } from "@/registry/erp/conflict-dialog"
import { PageSkeleton, PageState } from "@/registry/erp/page-state"
import { useApiErrorMessage } from "@/registry/hooks/use-api-error-message"
import { useMe } from "@/registry/hooks/use-me"
import { isApiError } from "@/registry/lib/api"
import { useFormat } from "@/registry/lib/format"
import { useErpUiT } from "@/registry/lib/i18n"
import { ACTION_ICONS, MODULE_ICONS, STATUS_ICONS } from "@/registry/lib/icons"
import { Badge } from "@/registry/ui/badge"
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/registry/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/registry/ui/tooltip"

import {
  INVOICE_STATUSES,
  type Invoice,
  type InvoiceStatus,
} from "@/data/invoices"

import { PageHeader } from "./PageHeader"

const usePageT = () => useTranslation("demo", { keyPrefix: "dataPage" }).t

const PER_PAGE = 20
const RESOURCE = "invoices"

type StatusFilter = InvoiceStatus | "all"
type SortableField = "number" | "client" | "date" | "amount"

const STATUS_BADGES: Record<
  InvoiceStatus,
  {
    variant: "secondary" | "info" | "warning" | "success" | "destructive"
    icon: LucideIcon
  }
> = {
  draft: { variant: "secondary", icon: STATUS_ICONS.draft },
  sent: { variant: "info", icon: STATUS_ICONS.info },
  partially_paid: { variant: "warning", icon: STATUS_ICONS.pending },
  paid: { variant: "success", icon: STATUS_ICONS.success },
  overdue: { variant: "destructive", icon: STATUS_ICONS.destructive },
}

function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  const t = usePageT()
  const { variant, icon: Icon } = STATUS_BADGES[status]
  return (
    <Badge variant={variant}>
      <Icon aria-hidden />
      {t(`statuses.${status}`)}
    </Badge>
  )
}

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
 * Рахунки з мок-сервера через ra-core: перевірка сесії, список із фільтрами й сортуванням,
 * права на редагування, збереження з версією й діалог конфлікту.
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

function SortHeader({
  field,
  sort,
  onSort,
  className,
}: {
  field: SortableField
  sort: SortPayload
  onSort: (field: SortableField) => void
  className?: string
}) {
  const t = usePageT()
  const active = sort.field === field
  const Icon = !active
    ? ArrowUpDown
    : sort.order === "ASC"
      ? ArrowUp
      : ArrowDown
  return (
    <TableHead
      className={className}
      aria-sort={
        active ? (sort.order === "ASC" ? "ascending" : "descending") : undefined
      }
    >
      <Button
        variant="ghost"
        size="sm"
        className="-mx-2"
        onClick={() => {
          onSort(field)
        }}
      >
        {t(`columns.${field}`)}
        <Icon
          aria-hidden
          className={active ? undefined : "text-muted-foreground"}
        />
      </Button>
    </TableHead>
  )
}

function InvoiceList() {
  const t = usePageT()
  const format = useFormat()
  const ids = useId()
  const { data: me } = useMe()
  const [status, setStatus] = useState<StatusFilter>("all")
  const [search, setSearch] = useState("")
  const query = useDebounced(search.trim(), 300)
  const [sort, setSort] = useState<SortPayload>({
    field: "date",
    order: "DESC",
  })
  const [editing, setEditing] = useState<Invoice | null>(null)

  const filter = useMemo(
    () => ({
      ...(status === "all" ? {} : { status }),
      ...(query ? { q: query } : {}),
    }),
    [status, query],
  )
  const filtered = status !== "all" || query !== ""

  // Інший фільтр чи сортування — знову з першої сторінки.
  const listKey = JSON.stringify([filter, sort])
  const [paging, setPaging] = useState({ page: 1, listKey })
  const page = paging.listKey === listKey ? paging.page : 1
  const setPage = (next: number) => {
    setPaging({ page: next, listKey })
  }

  const { data, total, isPending, isFetching, error, refetch } =
    useGetList<Invoice>(
      RESOURCE,
      { pagination: { page, perPage: PER_PAGE }, sort, filter },
      { placeholderData: keepPreviousData },
    )
  const { canAccess: canEdit } = useCanAccess({
    resource: RESOURCE,
    action: "edit",
  })

  const statusItems = [
    { value: "all", label: t("all") },
    ...INVOICE_STATUSES.map((value) => ({
      value,
      label: t(`statuses.${value}`),
    })),
  ]

  const toolbar = (
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
      <Field className="@2xl:w-56">
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
        role="status"
        className="flex min-h-5 items-center gap-2 text-sm text-muted-foreground @2xl:ms-auto @2xl:min-h-control"
      >
        {isFetching && !isPending ? (
          <>
            <Spinner aria-hidden />
            {t("refreshing")}
          </>
        ) : null}
      </div>
    </div>
  )

  let body: React.ReactNode
  if (isPending) {
    body = <PageSkeleton rows={8} />
  } else if (error) {
    const retry = () => {
      void refetch()
    }
    body =
      isApiError(error) && error.code === "offline" ? (
        <PageState kind="offline" onRetry={retry} />
      ) : isApiError(error) && error.status === 403 ? (
        <PageState kind="forbidden" />
      ) : (
        <PageState kind="error" onRetry={retry} />
      )
  } else if (!data?.length) {
    body = filtered ? (
      <PageState
        kind="no-results"
        onReset={() => {
          setSearch("")
          setStatus("all")
        }}
      />
    ) : (
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
    )
  } else {
    const count = total ?? data.length
    const from = (page - 1) * PER_PAGE + 1
    const to = from + data.length - 1
    const onSort = (field: SortableField) => {
      setSort((current) =>
        current.field === field
          ? { field, order: current.order === "ASC" ? "DESC" : "ASC" }
          : {
              field,
              order: field === "date" || field === "amount" ? "DESC" : "ASC",
            },
      )
    }
    body = (
      <div className="space-y-3">
        <Table label={t("tableLabel")}>
          <TableHeader>
            <TableRow>
              <SortHeader field="number" sort={sort} onSort={onSort} />
              <SortHeader field="client" sort={sort} onSort={onSort} />
              <SortHeader field="date" sort={sort} onSort={onSort} />
              <SortHeader
                field="amount"
                sort={sort}
                onSort={onSort}
                className="text-right"
              />
              <TableHead>{t("columns.status")}</TableHead>
              <TableHead>
                <span className="sr-only">{t("columns.actions")}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((invoice) => (
              <TableRow key={invoice.id}>
                <TableCell className="tabular-nums">{invoice.number}</TableCell>
                <TableCell>{invoice.client}</TableCell>
                <TableCell className="tabular-nums">
                  {format.date(invoice.date, "date")}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {format.money({
                    amount: invoice.amount,
                    currency: invoice.currency,
                  })}
                </TableCell>
                <TableCell>
                  <InvoiceStatusBadge status={invoice.status} />
                </TableCell>
                <TableCell className="text-right">
                  <EditButton
                    label={t("edit", { number: invoice.number })}
                    canEdit={canEdit === true}
                    onEdit={() => {
                      setEditing(invoice)
                    }}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <nav
          aria-label={t("tableLabel")}
          className="flex items-center justify-end gap-2"
        >
          <span className="me-2 text-sm text-muted-foreground tabular-nums">
            {t("range", {
              from: format.number(from),
              to: format.number(to),
              total: format.number(count),
            })}
          </span>
          <Button
            variant="outline"
            size="icon"
            aria-label={t("previous")}
            disabled={page <= 1}
            onClick={() => {
              setPage(page - 1)
            }}
          >
            <ChevronLeft aria-hidden />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label={t("next")}
            disabled={to >= count}
            onClick={() => {
              setPage(page + 1)
            }}
          >
            <ChevronRight aria-hidden />
          </Button>
        </nav>
      </div>
    )
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
      {toolbar}
      {body}
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

/** SPEC §8.4: без права дія неактивна, але у фокусі й пояснює причину. */
function EditButton({
  label,
  canEdit,
  onEdit,
}: {
  label: string
  canEdit: boolean
  onEdit: () => void
}) {
  const t = usePageT()
  const Edit = ACTION_ICONS.edit
  if (canEdit) {
    return (
      <Button variant="ghost" size="icon" aria-label={label} onClick={onEdit}>
        <Edit aria-hidden />
      </Button>
    )
  }
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label={label}
            disabled
            focusableWhenDisabled
          />
        }
      >
        <Edit aria-hidden />
      </TooltipTrigger>
      <TooltipContent>{t("readOnlyHint")}</TooltipContent>
    </Tooltip>
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
