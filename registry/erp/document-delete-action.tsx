import { useQueryClient } from "@tanstack/react-query"
import { useDelete, type RaRecord } from "@/registry/lib/ra-core"
import { useState } from "react"
import { useNavigate } from "react-router"
import { toast } from "sonner"

import { ConfirmDialog } from "@/registry/erp/confirm-dialog"
import { DeniedAction } from "@/registry/erp/permission-gate"
import { useApiErrorMessage } from "@/registry/hooks/use-api-error-message"
import { useCompanyId } from "@/registry/hooks/use-company"
import {
  useRecordAccess,
  type RecordDenialText,
} from "@/registry/hooks/use-record-access"
import { useKeepsInTrash, useMovedToTrash } from "@/registry/hooks/use-trash"
import { isApiError } from "@/registry/lib/api"
import { companyScope } from "@/registry/lib/company-scope"
import { ACTION_ICONS } from "@/registry/lib/icons"
import { Button } from "@/registry/ui/button"
import { Spinner } from "@/registry/ui/spinner"

const DeleteIcon = ACTION_ICONS.delete

/** Після цих відповідей повтор нічого не дасть: документ уже провели, видалили чи право забрали. */
const FINAL_STATUSES: ReadonlySet<number> = new Set([403, 404])

/** Тексти дії словами модуля: «Видалити чернетку», «Видалити чернетку рахунку?». */
export interface DocumentDeleteTexts {
  readonly button: string
  /** Причина без права ролі `<ресурс>:delete`. */
  readonly denied: string
  /** Сповіщення після видалення. */
  readonly done: string
  readonly title: string
  /** Наслідок видалення в підтвердженні. */
  readonly description: string
  readonly confirm: string
  /**
   * Сповіщення, коли сервер переніс запис у кошик (ADR-0095): «Чернетку перенесено в кошик»; без нього —
   * текст кіта.
   */
  readonly trashed?: string
}

/**
 * «Видалити» в шапці картки запису (ADR-0066, ADR-0086, ADR-0095): чернетка документа без номера,
 * організація, контакт; право `<ресурс>:delete`. Проведений і скасований документ — неактивна кнопка з
 * причиною словами модуля (`moduleText`), закритий період — причиною кіта, поки запис редагує інша
 * людина — з причиною блокування (SPEC §8.4). Відмова сервера (провели за мить до того) — сповіщення з
 * причиною, картка перечитується. Після видалення — список.
 *
 * - Сервер переносить записи ресурсу в кошик (`useKeepsInTrash`) — без діалогу: запис іде в кошик одразу,
 *   сповіщення зі «Скасувати» не зникає само (SPEC §8.2, рівень 1).
 * - Кошика немає (чи його налаштування не прочитались) — підтвердження, що називає наслідок (рівень 2).
 * - Поки права невідомі — кнопки немає; без права — неактивна з причиною, не чекаючи налаштувань кошика;
 *   поки налаштування кошика невідомі — кнопки немає.
 * - Без діалогу сторінку ніщо не тримає: людина, що за час запиту пішла з картки, лишається там, куди
 *   пішла, а сповіщення однаково з'являється.
 */
export function DocumentDeleteAction({
  resource,
  document,
  listPath,
  texts,
  name,
  moduleText,
  lockReason,
}: {
  resource: string
  document: RaRecord
  /** Куди після видалення: список документів. */
  listPath: string
  texts: DocumentDeleteTexts
  /** Назва запису для «Відновлено: …» після «Скасувати»; без неї — «Запис <id>». */
  name?: string
  /** Слова модуля для кодів позначки сервера (`useRecordAccess`). */
  moduleText?: RecordDenialText | undefined
  /** Запис редагує інша людина (`useEditLock`). */
  lockReason: string | undefined
}) {
  const navigate = useNavigate()
  const companyId = useCompanyId()
  const errorMessage = useApiErrorMessage()
  const queryClient = useQueryClient()
  const movedToTrash = useMovedToTrash()
  const [remove] = useDelete()
  const { canAccess, isPending, recordReason } = useRecordAccess({
    resource,
    action: "delete",
    record: document,
    moduleText,
  })
  const { keeps } = useKeepsInTrash(resource)
  const [open, setOpen] = useState(false)
  const [isDeleting, setDeleting] = useState(false)
  const reason = canAccess ? lockReason : (recordReason ?? texts.denied)
  // Дію заборонили, поки діалог відкритий (чернетку взяли в редагування): діалог закривається, а не
  // з'являється сам, коли заборону знімуть.
  if (open && (isPending || reason !== undefined)) setOpen(false)
  if (isPending) return null
  const content = (
    <>
      {isDeleting ? <Spinner aria-hidden /> : <DeleteIcon aria-hidden />}
      {texts.button}
    </>
  )
  if (reason !== undefined)
    return <DeniedAction reason={reason}>{content}</DeniedAction>
  if (keeps === undefined) return null
  const run = async () => {
    const page = currentPage()
    try {
      await remove(
        resource,
        {
          id: document.id,
          previousData: document,
          meta: companyScope(companyId),
        },
        { mutationMode: "pessimistic", returnPromise: true },
      )
    } catch (failure: unknown) {
      toast.error(errorMessage(failure))
      if (isApiError(failure) && FINAL_STATUSES.has(failure.status)) {
        setOpen(false)
        void queryClient.invalidateQueries({ queryKey: [resource] })
      }
      return
    }
    if (keeps)
      movedToTrash({
        resource,
        id: String(document.id),
        name,
        message: texts.trashed,
      })
    else toast.success(texts.done)
    setOpen(false)
    if (currentPage() === page) void navigate(listPath)
  }
  const deleteToTrash = () => {
    if (isDeleting) return
    setDeleting(true)
    void run().finally(() => {
      setDeleting(false)
    })
  }
  return (
    <>
      <Button
        variant="outline"
        aria-busy={isDeleting || undefined}
        onClick={() => {
          if (keeps) deleteToTrash()
          else setOpen(true)
        }}
      >
        {content}
      </Button>
      {/* Налаштування кошика прийшли, поки діалог відкритий: діалог лишається до відповіді людини. */}
      {keeps && !open ? null : (
        <ConfirmDialog
          open={open}
          title={texts.title}
          description={texts.description}
          confirmLabel={texts.confirm}
          destructive
          lockWhileBusy
          // Після видалення кнопки вже немає: фокус ставить заголовок списку після переходу.
          returnFocus={() => false}
          onClose={() => {
            setOpen(false)
          }}
          onConfirm={run}
        />
      )}
    </>
  )
}

/**
 * Сторінка без параметрів запиту: людина, що перемкнула вкладку картки (`?tab=`), лишилась на ній, а та,
 * що пішла деінде, — ні. Працює і з HashRouter (шлях у `hash`), і з BrowserRouter (у `pathname`).
 */
function currentPage(): string {
  const { origin, pathname, hash } = window.location
  return `${origin}${pathname}${hash.split("?")[0] ?? ""}`
}
