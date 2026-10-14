import { useQueryClient } from "@tanstack/react-query"
import { useUpdate } from "ra-core"
import { Suspense } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { ConflictDialog } from "@/registry/erp/conflict-dialog"
import {
  EditableCell,
  type EditableCellProps,
} from "@/registry/erp/editable-cell"
import { ErrorBoundary } from "@/registry/erp/error-boundary"
import { useApiErrorMessage } from "@/registry/hooks/use-api-error-message"
import { isApiError } from "@/registry/lib/api"
import { useFormat } from "@/registry/lib/format"
import { useErpUiT } from "@/registry/lib/i18n"
import { Button } from "@/registry/ui/button"
import { Input } from "@/registry/ui/input"
import { Spinner } from "@/registry/ui/spinner"

import { invoiceSchema, type Invoice } from "@/data/invoices"
import { MoneyInput } from "@/pages/inline-editors"

/**
 * Клієнт і сума рахунку в комірці стрес-сторінки (SPEC §8.1 стан 16, ADR-0018): оптимістично через
 * erp/editable-cell, збереження з версією запису (ADR-0002). Конфлікт версій — діалог сторінки з
 * порівнянням, як у формі редагування.
 */

const RESOURCE = "invoices"

export type InlineField = "client" | "amount"

/** Збереження з комірки не пройшло: запис змінив інший користувач. */
export interface InlineConflict {
  field: InlineField
  /** Що ввела людина. */
  mine: string | number
  /** Збережена версія з відповіді 409. */
  current: Invoice
}

const usePageT = () => useTranslation("demo", { keyPrefix: "dataPage" }).t

/** Останнє збереження кожного рахунку: збережений запис або null (не вдалося). */
const saving = new Map<string, Promise<Invoice | null>>()

/**
 * Збереження з версією запису (ADR-0002); відхилений проміс — відкат у комірці. Збереження одного
 * рахунку йдуть по черзі, кожне з версією попереднього: інакше друга комірка рядка, змінена до
 * відповіді на першу, отримала б 409 на власну зміну людини.
 */
function useSaveInvoice(invoice: Invoice) {
  const [update] = useUpdate<Invoice>()
  return (changes: Partial<Pick<Invoice, InlineField>>) => {
    const previous = saving.get(invoice.id) ?? Promise.resolve(null)
    const saved = previous.then((last) => {
      const base = last && last.version > invoice.version ? last : invoice
      return update(
        RESOURCE,
        {
          id: invoice.id,
          data: { ...changes, version: base.version },
          previousData: base,
        },
        { mutationMode: "pessimistic", returnPromise: true },
      )
    })
    const queued = saved.then(
      (record) => record || null,
      () => null,
    )
    saving.set(invoice.id, queued)
    void queued.then(() => {
      if (saving.get(invoice.id) === queued) saving.delete(invoice.id)
    })
    return saved
  }
}

/** Конфлікт версій — діалог сторінки; інша помилка чи відповідь без запису — сповіщення кіта. */
function conflictHandler<V>(
  field: InlineField,
  onConflict: (conflict: InlineConflict) => void,
  /** Значення, яке зберігалось (без пробілів по краях). */
  toSaved: (value: V) => string | number | null,
): EditableCellProps<V>["onError"] {
  return (error, value) => {
    const mine = toSaved(value)
    if (!isApiError(error) || error.code !== "conflict" || mine === null)
      return false
    const current = invoiceSchema.safeParse(error.current)
    if (!current.success) return false
    onConflict({ field, mine, current: current.data })
    return true
  }
}

const toClient = (client: string) => client.trim()
const toAmount = (amount: number | null) => amount

interface CellProps {
  invoice: Invoice
  readOnly: boolean
  onConflict: (conflict: InlineConflict) => void
}

export function InvoiceClientCell({
  invoice,
  readOnly,
  onConflict,
}: CellProps) {
  const t = usePageT()
  const kitT = useErpUiT()
  const save = useSaveInvoice(invoice)
  return (
    <EditableCell
      value={invoice.client}
      label={t("columns.client")}
      recordLabel={invoice.number}
      readOnly={readOnly}
      display={(client) => <span className="truncate">{client}</span>}
      editor={({ value, onChange, inputProps }) => (
        <Input
          {...inputProps}
          value={value}
          onChange={(event) => {
            onChange(event.target.value)
          }}
        />
      )}
      validate={(client) =>
        client.trim() ? null : kitT("validation.required")
      }
      onSave={(client) => save({ client: toClient(client) })}
      onError={conflictHandler("client", onConflict, toClient)}
    />
  )
}

export function InvoiceAmountCell({
  invoice,
  readOnly,
  onConflict,
}: CellProps) {
  const t = usePageT()
  const kitT = useErpUiT()
  const format = useFormat()
  const save = useSaveInvoice(invoice)
  const { currency } = invoice
  return (
    <EditableCell<number | null>
      value={invoice.amount}
      label={t("columns.amount")}
      recordLabel={invoice.number}
      readOnly={readOnly}
      align="end"
      display={(amount) => (
        <span className="tabular-nums">
          {amount === null ? "" : format.money({ amount, currency })}
        </span>
      )}
      editor={({ value, onChange, inputProps }) => (
        // Чанк поля не завантажився (офлайн) — «Спробувати ще» в комірці, а не вся сторінка.
        <ErrorBoundary
          fallback={(retry) => (
            <Button variant="outline" size="sm" onClick={retry}>
              {kitT("pageState.error.retry")}
            </Button>
          )}
        >
          <Suspense fallback={<Spinner className="ms-auto" />}>
            <MoneyInput
              {...inputProps}
              currency={currency}
              value={value === null ? null : { amount: value, currency }}
              onValueChange={(money) => {
                onChange(money === null ? null : Number(money.amount))
              }}
            />
          </Suspense>
        </ErrorBoundary>
      )}
      validate={(amount) =>
        amount === null ? t("inline.amountRequired") : null
      }
      onSave={(amount) => save({ amount: toAmount(amount) ?? 0 })}
      onError={conflictHandler("amount", onConflict, toAmount)}
    />
  )
}

/**
 * Конфлікт зі збереження в комірці: ваше й збережене значення поля. «Зберегти мої зміни» —
 * повтор із версією збереженого запису, «Взяти збережене» — список перечитується.
 */
export function InlineConflictDialog({
  conflict,
  onClose,
}: {
  conflict: InlineConflict | null
  onClose: () => void
}) {
  const t = usePageT()
  const format = useFormat()
  const errorMessage = useApiErrorMessage()
  const queryClient = useQueryClient()
  const [update] = useUpdate<Invoice>()
  const show = (
    field: InlineField,
    value: string | number,
    current: Invoice,
  ) =>
    field === "amount"
      ? format.money({ amount: Number(value), currency: current.currency })
      : String(value)
  return (
    <ConflictDialog
      open={conflict !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      fields={
        conflict
          ? [
              {
                key: conflict.field,
                label: t(`columns.${conflict.field}`),
                mine: show(conflict.field, conflict.mine, conflict.current),
                theirs: show(
                  conflict.field,
                  conflict.current[conflict.field],
                  conflict.current,
                ),
              },
            ]
          : []
      }
      onOverwrite={() => {
        onClose()
        if (!conflict) return
        const { field, mine, current } = conflict
        void update(
          RESOURCE,
          {
            id: current.id,
            data: { [field]: mine, version: current.version },
            previousData: current,
          },
          {
            mutationMode: "pessimistic",
            onSuccess: () => {
              toast.success(t("saved"))
            },
            onError: (error) => {
              toast.error(t("saveFailed", { message: errorMessage(error) }))
            },
          },
        )
      }}
      onReload={() => {
        onClose()
        void queryClient.invalidateQueries({ queryKey: [RESOURCE] })
        toast(t("reloaded"))
      }}
    />
  )
}
