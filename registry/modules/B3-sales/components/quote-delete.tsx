import { useQueryClient } from "@tanstack/react-query"
import { useDelete } from "ra-core"
import { useState } from "react"
import { useNavigate } from "react-router"
import { toast } from "sonner"

import { ConfirmDialog } from "@/components/erp/confirm-dialog"
import { DeniedAction } from "@/components/erp/permission-gate"
import { Button } from "@/components/ui/button"
import { useApiErrorMessage } from "@/hooks/use-api-error-message"
import { useCompanyId } from "@/hooks/use-company"
import { isApiError } from "@/lib/api"
import { companyScope } from "@/lib/company-scope"
import { ACTION_ICONS } from "@/lib/icons"

import { QUOTES, type Quote } from "../contract"
import { useSalesModule } from "../module-context"
import { useSalesT } from "../use-sales-t"
import { useQuoteAccess } from "./quote-access"

const DeleteIcon = ACTION_ICONS.delete

/** Після цих відповідей повтор нічого не дасть: пропозицію вже надіслали, видалили чи право забрали. */
const FINAL_STATUSES: ReadonlySet<number> = new Set([403, 404])

/**
 * «Видалити чернетку» в шапці картки (ADR-0066): лише чернетка без номера, право `quotes:delete`.
 * Надіслана й скасована — неактивна кнопка з причиною словами модуля, поки запис редагує інша людина —
 * з причиною блокування (SPEC §8.4). Підтвердження називає наслідок; після видалення — список.
 * Відмова сервера (надіслали за мить до того) — сповіщення з причиною, картка перечитується.
 */
export function QuoteDeleteAction({
  quote,
  lockReason,
}: {
  quote: Quote
  /** Запис редагує інша людина (`useEditLock`). */
  lockReason: string | undefined
}) {
  const t = useSalesT()
  const navigate = useNavigate()
  const { paths } = useSalesModule()
  const companyId = useCompanyId()
  const errorMessage = useApiErrorMessage()
  const queryClient = useQueryClient()
  const [remove] = useDelete<Quote>()
  const { canAccess, isPending, recordReason } = useQuoteAccess("delete", quote)
  const [open, setOpen] = useState(false)
  if (isPending) return null
  const reason = canAccess
    ? lockReason
    : (recordReason ?? t("quote.delete.denied"))
  const content = (
    <>
      <DeleteIcon aria-hidden />
      {t("quote.delete.button")}
    </>
  )
  if (reason !== undefined)
    return <DeniedAction reason={reason}>{content}</DeniedAction>
  const confirm = async () => {
    try {
      await remove(
        QUOTES,
        { id: quote.id, previousData: quote, meta: companyScope(companyId) },
        { mutationMode: "pessimistic", returnPromise: true },
      )
      toast.success(t("quote.delete.done"))
      setOpen(false)
      void navigate(paths.quotes)
    } catch (failure: unknown) {
      toast.error(errorMessage(failure))
      if (isApiError(failure) && FINAL_STATUSES.has(failure.status)) {
        setOpen(false)
        void queryClient.invalidateQueries({ queryKey: [QUOTES] })
      }
    }
  }
  return (
    <>
      <Button
        variant="outline"
        onClick={() => {
          setOpen(true)
        }}
      >
        {content}
      </Button>
      <ConfirmDialog
        open={open}
        title={t("quote.delete.title")}
        description={
          quote.amendedFrom
            ? t("quote.delete.descriptionAmended")
            : t("quote.delete.description")
        }
        confirmLabel={t("quote.delete.confirm")}
        destructive
        lockWhileBusy
        onClose={() => {
          setOpen(false)
        }}
        onConfirm={confirm}
      />
    </>
  )
}
