import { useUpdate } from "ra-core"
import { useId, useState, type FormEvent } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { ConflictDialog } from "@/registry/erp/conflict-dialog"
import { useApiErrorMessage } from "@/registry/hooks/use-api-error-message"
import { useCompanyId } from "@/registry/hooks/use-company"
import { isApiError } from "@/registry/lib/api"
import { companyScope } from "@/registry/lib/company-scope"
import { useErpUiT } from "@/registry/lib/i18n"
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/registry/ui/select"
import { Spinner } from "@/registry/ui/spinner"

import {
  INVOICE_STATUSES,
  invoiceSchema,
  type Invoice,
  type InvoiceStatus,
} from "@/data/invoices"

const usePageT = () => useTranslation("demo", { keyPrefix: "dataPage" }).t

const RESOURCE = "invoices"

type EditValues = Pick<Invoice, "client" | "status">

export function EditInvoiceDialog({
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
  // Ключ кешу запису з компанією — як у картки: відповідь сервера одразу видно на ній.
  const companyId = useCompanyId()

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
        meta: companyScope(companyId),
      },
      {
        mutationMode: "pessimistic",
        onSuccess: () => {
          toast.success(t("saved"))
          onClose()
        },
        onError: (error) => {
          if (isApiError(error) && error.code === "conflict") {
            // Без збереженої версії у відповіді порівнювати нічого: звичайна помилка збереження.
            const latest = invoiceSchema.safeParse(error.current)
            if (latest.success) {
              setConflict(latest.data)
              return
            }
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
        // Поки зберігається, не закриваємо: відповідь (збережено, конфлікт) інакше нікому показати.
        if (!open && !saving) onClose()
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
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              focusableWhenDisabled
              onClick={onClose}
            >
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
