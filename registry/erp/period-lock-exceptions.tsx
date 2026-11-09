import { useQueryClient } from "@tanstack/react-query"
import { useCanAccess, useDelete, useGetList } from "ra-core"
import * as React from "react"
import { toast } from "sonner"

import { PageState, SectionSkeleton } from "@/registry/erp/page-state"
import { DeniedAction } from "@/registry/erp/permission-gate"
import { PeriodLockExceptionDialog } from "@/registry/erp/period-lock-exception-dialog"
import { useApiErrorMessage } from "@/registry/hooks/use-api-error-message"
import { useCompanyId } from "@/registry/hooks/use-company"
import { useHasPermission } from "@/registry/hooks/use-me"
import { errorStateKind, MAX_PER_PAGE } from "@/registry/lib/api"
import { companyScope } from "@/registry/lib/company-scope"
import { useFormat } from "@/registry/lib/format"
import { useErpUiT } from "@/registry/lib/i18n"
import {
  PERIOD_LOCK,
  PERIOD_LOCK_EXCEPTION_MAX_DAYS,
  PERIOD_LOCK_EXCEPTIONS,
  type PeriodLockException,
} from "@/registry/lib/period-lock"
import { Button } from "@/registry/ui/button"
import { Spinner } from "@/registry/ui/spinner"

/**
 * Винятки закритого періоду (PF13, ADR-0069): чинні винятки компанії — кому, до коли, чому й хто дав;
 * «Дати виняток» (`erp/period-lock-exception-dialog`) і «Відкликати».
 *
 * - Без `period-lock-exceptions:read` — «немає доступу»; без `create` чи `delete` кнопка неактивна з
 *   причиною (SPEC §8.4).
 * - Відкликання — одразу, без підтвердження: воно лише забирає дозвіл, дати його знову можна за мить.
 *   Фокус після відкликання — на «Дати виняток», а не на `body`.
 * - Після видачі чи відкликання перечитується й запис закритого періоду: виняток міг бути свій.
 * - Стани: завантаження, порожньо з дією, помилка й офлайн із повтором.
 */
export interface PeriodLockExceptionsProps {
  /** Рівень заголовків станів: 2 — під h1 сторінки, 3 — у розділі під h2. */
  readonly headingLevel?: 2 | 3
}

export function PeriodLockExceptions({
  headingLevel = 2,
}: PeriodLockExceptionsProps) {
  const access = useCanAccess({
    resource: PERIOD_LOCK_EXCEPTIONS,
    action: "read",
  })
  if (access.isPending) return <SectionSkeleton rows={3} />
  if (!access.canAccess)
    return (
      <PageState
        kind="forbidden"
        headingLevel={headingLevel}
        className="min-h-40"
      />
    )
  return <ExceptionList headingLevel={headingLevel} />
}

function ExceptionList({ headingLevel }: { headingLevel: 2 | 3 }) {
  const t = useErpUiT()
  const companyId = useCompanyId()
  const canCreate = useHasPermission(PERIOD_LOCK_EXCEPTIONS, "create")
  const [isGranting, setGranting] = React.useState(false)
  const grantRef = React.useRef<HTMLButtonElement>(null)
  const { data, isPending, error, refetch, fetchStatus } =
    useGetList<PeriodLockException>(PERIOD_LOCK_EXCEPTIONS, {
      pagination: { page: 1, perPage: MAX_PER_PAGE },
      sort: { field: "until", order: "ASC" },
      meta: companyScope(companyId),
    })
  const grant = canCreate ? (
    <Button
      ref={grantRef}
      type="button"
      variant="outline"
      onClick={() => {
        setGranting(true)
      }}
    >
      {t("periodLock.exceptions.grant")}
    </Button>
  ) : (
    <DeniedAction
      reason={t("periodLock.exceptions.noCreate")}
      variant="outline"
    >
      {t("periodLock.exceptions.grant")}
    </DeniedAction>
  )
  const failure = (
    <PageState
      kind={error ? errorStateKind(error) : "offline"}
      headingLevel={headingLevel}
      onRetry={() => void refetch()}
      className="min-h-40"
    />
  )
  return (
    <div data-slot="period-lock-exceptions" className="@container grid gap-4">
      <div className="flex flex-col gap-3 @lg:flex-row @lg:items-start">
        <p className="min-w-0 flex-1 text-sm text-muted-foreground">
          {t("periodLock.exceptions.description", {
            days: PERIOD_LOCK_EXCEPTION_MAX_DAYS,
          })}
        </p>
        <div className="self-start">{grant}</div>
      </div>
      {isPending ? (
        fetchStatus === "paused" ? (
          failure
        ) : (
          <SectionSkeleton rows={3} />
        )
      ) : !data ? (
        failure
      ) : data.length === 0 ? (
        <PageState
          kind="empty"
          title={t("periodLock.exceptions.empty")}
          headingLevel={headingLevel}
          className="min-h-32"
        />
      ) : (
        <ul
          aria-label={t("periodLock.exceptions.listLabel")}
          className="divide-y rounded-lg border"
        >
          {data.map((exception) => (
            <ExceptionRow
              key={exception.id}
              exception={exception}
              onRevoked={() => {
                grantRef.current?.focus()
              }}
            />
          ))}
        </ul>
      )}
      {isGranting ? (
        <PeriodLockExceptionDialog
          finalFocus={grantRef}
          onClose={() => {
            setGranting(false)
          }}
        />
      ) : null}
    </div>
  )
}

function ExceptionRow({
  exception,
  onRevoked,
}: {
  exception: PeriodLockException
  onRevoked: () => void
}) {
  const t = useErpUiT()
  const format = useFormat()
  const revoke = useRevoke()
  const canDelete = useHasPermission(PERIOD_LOCK_EXCEPTIONS, "delete")
  const [isBusy, setBusy] = React.useState(false)
  const label = t("periodLock.exceptions.revokeLabel", {
    name: exception.userName,
  })
  return (
    <li className="flex flex-col gap-2 px-3 py-2 text-sm @lg:flex-row @lg:items-start">
      <div className="grid min-w-0 flex-1 gap-0.5">
        <span className="font-medium break-words">{exception.userName}</span>
        <span className="tabular-nums">
          {t("periodLock.exceptions.until", {
            until: format.date(exception.until, "dateTime"),
          })}
        </span>
        <span className="break-words">{exception.reason}</span>
        <span className="text-muted-foreground">
          {t("periodLock.exceptions.grantedBy", {
            name: exception.grantedBy.name,
            at: format.date(exception.grantedAt, "dateTime"),
          })}
        </span>
      </div>
      {canDelete ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label={label}
          disabled={isBusy}
          focusableWhenDisabled
          aria-busy={isBusy || undefined}
          className="self-start"
          onClick={() => {
            setBusy(true)
            void revoke(exception).then((done) => {
              if (done) onRevoked()
              else setBusy(false)
            })
          }}
        >
          {isBusy ? <Spinner aria-hidden /> : null}
          {t("periodLock.exceptions.revoke")}
        </Button>
      ) : (
        <DeniedAction
          reason={t("periodLock.exceptions.noDelete")}
          variant="outline"
          size="sm"
          className="self-start"
        >
          {t("periodLock.exceptions.revoke")}
        </DeniedAction>
      )}
    </li>
  )
}

/** Відкликати виняток; `true` — відкликано. Запис закритого періоду перечитується: виняток міг бути свій. */
function useRevoke() {
  const t = useErpUiT()
  const companyId = useCompanyId()
  const errorText = useApiErrorMessage()
  const queryClient = useQueryClient()
  const [remove] = useDelete<PeriodLockException>()
  return async (exception: PeriodLockException): Promise<boolean> => {
    try {
      await remove(
        PERIOD_LOCK_EXCEPTIONS,
        {
          id: exception.id,
          previousData: exception,
          meta: companyScope(companyId),
        },
        { mutationMode: "pessimistic", returnPromise: true },
      )
      toast.success(
        t("periodLock.exceptions.revoked", { name: exception.userName }),
      )
      void queryClient.invalidateQueries({ queryKey: [PERIOD_LOCK] })
      return true
    } catch (error) {
      toast.error(errorText(error))
      // Виняток уже відкликав колега чи він закінчився (404): список на екрані застарів.
      void queryClient.invalidateQueries({ queryKey: [PERIOD_LOCK_EXCEPTIONS] })
      return false
    }
  }
}
