import { LockKeyholeIcon, LockKeyholeOpenIcon } from "lucide-react"
import type * as React from "react"

import { usePeriodLock } from "@/registry/hooks/use-period-lock"
import { isApiError } from "@/registry/lib/api"
import { useFormat } from "@/registry/lib/format"
import { useErpUiT } from "@/registry/lib/i18n"
import {
  isPeriodLocked,
  type OwnPeriodLockException,
} from "@/registry/lib/period-lock"
import { cn } from "@/registry/lib/utils"
import { Alert, AlertDescription, AlertTitle } from "@/registry/ui/alert"
import { Button } from "@/registry/ui/button"

/**
 * Смуга закритого періоду на картці документа (PF13 PeriodLockBanner, ADR-0069): дата документа в
 * закритому періоді — «Період закрито по 20.10.2026» і що з документом робити не можна; чинний виняток
 * того, хто дивиться, — до коли й з якою причиною.
 *
 * - Дата у відкритому періоді, запис ще вантажиться, бекенд без закритих періодів (404) чи не дає
 *   його цій людині (403) — смуги немає: сервер однаково перевіряє дату, а смуга, що з'являється на
 *   мить чи без шляху виправлення, лише зсуває картку.
 * - Збій читання — смуга з «Спробувати ще»: кнопки дій однаково покажуть відмову сервера з причиною.
 * - `hint` — що робити далі словами модуля («Виправте помилку сторно сьогоднішньою датою»).
 * - Смуга не оголошується скрінрідером при появі (`role` не `alert`): це стан документа, а не подія;
 *   читається на своєму місці перед панеллю дій.
 * - Вузький контейнер — кнопка повтору під текстом (`@container`).
 */
export interface PeriodLockBannerProps {
  /** Дата документа (`YYYY-MM-DD`), за якою він лежить у періоді. */
  readonly date: string | null | undefined
  readonly hint?: React.ReactNode
  readonly className?: string
}

export function PeriodLockBanner({
  date,
  hint,
  className,
}: PeriodLockBannerProps) {
  const lock = usePeriodLock()
  if (lock.isPending || lock.isUnsupported || isForbidden(lock.error))
    return null
  if (lock.error || lock.isOffline)
    return (
      <PeriodLockNotice
        state="error"
        onRetry={lock.refetch}
        className={className}
      />
    )
  if (!date || !lock.lockedThrough || !isPeriodLocked(date, lock.lockedThrough))
    return null
  return (
    <PeriodLockNotice
      state="locked"
      date={date}
      lockedThrough={lock.lockedThrough}
      exception={lock.exception}
      hint={hint}
      className={className}
    />
  )
}

const isForbidden = (error: unknown) =>
  isApiError(error) && error.status === 403

/** Смуга з явними даними: для `PeriodLockBanner` і сторінки демо з усіма варіантами. */
export type PeriodLockNoticeProps =
  | {
      readonly state: "locked"
      readonly date: string
      readonly lockedThrough: string
      readonly exception?: OwnPeriodLockException | null
      readonly hint?: React.ReactNode
      readonly className?: string
    }
  | {
      readonly state: "error"
      readonly onRetry: () => void
      readonly className?: string
    }

export function PeriodLockNotice(props: PeriodLockNoticeProps) {
  const t = useErpUiT()
  const format = useFormat()
  if (props.state === "error")
    return (
      <div className={cn("@container", props.className)}>
        <Alert
          role={undefined}
          data-slot="period-lock-banner"
          data-state="error"
          className="flex flex-col gap-2 @md:flex-row @md:items-center"
        >
          <AlertDescription className="min-w-0 flex-1 text-foreground">
            {t("periodLock.banner.error")}
          </AlertDescription>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start @md:self-auto"
            onClick={props.onRetry}
          >
            {t("periodLock.banner.retry")}
          </Button>
        </Alert>
      </div>
    )
  const { exception } = props
  const Icon = exception ? LockKeyholeOpenIcon : LockKeyholeIcon
  return (
    <Alert
      role={undefined}
      variant={exception ? "info" : "warning"}
      data-slot="period-lock-banner"
      data-state={exception ? "exception" : "locked"}
      className={props.className}
    >
      <Icon aria-hidden />
      <AlertTitle>
        {t("periodLock.banner.title", {
          date: format.date(props.lockedThrough, "date"),
        })}
      </AlertTitle>
      <AlertDescription className="grid gap-1">
        <p>
          {exception
            ? t("periodLock.banner.exception", {
                until: format.date(exception.until, "dateTime"),
                reason: exception.reason,
              })
            : t("periodLock.banner.locked", {
                date: format.date(props.date, "date"),
              })}
        </p>
        {props.hint && !exception ? <p>{props.hint}</p> : null}
      </AlertDescription>
    </Alert>
  )
}
