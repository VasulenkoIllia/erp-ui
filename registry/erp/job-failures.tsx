"use client"

import * as React from "react"

import { useFormat } from "@/registry/lib/format"
import { useErpUiT } from "@/registry/lib/i18n"
import { JOB_FAILURE_SAMPLE, type JobFailureGroup } from "@/registry/lib/jobs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/registry/ui/dialog"

/**
 * Невдачі масової дії для erp/job-progress (SPEC §8.1 стан 14, ADR-0018): причини групами з
 * кількістю й першими записами, «Повторити (N)» у підвалі. Ставиться разом з erp/job-progress.
 */

/** Невдачі кількох задач (повтор і попередні): одна група на причину. */
export function mergeFailures(groups: JobFailureGroup[]): JobFailureGroup[] {
  const byCode = new Map<string, JobFailureGroup>()
  for (const group of groups) {
    const same = byCode.get(group.code)
    byCode.set(
      group.code,
      same
        ? {
            ...same,
            count: same.count + group.count,
            retryable: same.retryable && group.retryable,
            items: [...same.items, ...group.items].slice(0, JOB_FAILURE_SAMPLE),
          }
        : group,
    )
  }
  return [...byCode.values()]
}

/**
 * Події з порталу діалогу спливають у сповіщення React-деревом: без цього перетягування в діалозі
 * «змахує» його, а фокус-події сповіщення повертають фокус із діалогу.
 */
const keepInDialog = (event: React.SyntheticEvent) => {
  event.stopPropagation()
}

export function JobFailuresDialog({
  failures,
  title,
  reason,
  retry,
  onClose,
}: {
  failures: JobFailureGroup[]
  title: string
  reason: (code: string) => string
  retry: React.ReactNode
  onClose: () => void
}) {
  const t = useErpUiT()
  const format = useFormat()
  const count = failures.reduce((sum, group) => sum + group.count, 0)
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent
        onPointerDown={keepInDialog}
        onPointerMove={keepInDialog}
        onPointerUp={keepInDialog}
        onFocus={keepInDialog}
        onBlur={keepInDialog}
      >
        <DialogHeader>
          <DialogTitle>
            {t("jobs.failuresTitle", { value: format.number(count) })}
          </DialogTitle>
          <DialogDescription>
            {title}. {t("jobs.failuresDescription")}
          </DialogDescription>
        </DialogHeader>
        <ul className="grid gap-3">
          {failures.map((group) => {
            const rest = group.count - group.items.length
            return (
              <li key={group.code} className="grid gap-1">
                <p className="font-medium">
                  {reason(group.code)}: {format.number(group.count)}
                  {group.retryable ? (
                    <span className="font-normal text-muted-foreground">
                      {" "}
                      · {t("jobs.canRetry")}
                    </span>
                  ) : null}
                </p>
                <p className="text-muted-foreground tabular-nums">
                  {group.items.map((item) => item.title ?? item.id).join(", ")}
                  {rest > 0
                    ? ` ${t("jobs.andMore", { value: format.number(rest) })}`
                    : null}
                </p>
              </li>
            )
          })}
        </ul>
        <DialogFooter showCloseButton closeLabel={t("jobs.close")}>
          {retry}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
