import * as React from "react"
import type { RaRecord } from "ra-core"

import type { ConflictField } from "@/registry/erp/conflict-dialog"
import {
  needsConfirmation,
  TransitionConflict,
  TransitionDialog,
} from "@/registry/erp/document-action-dialogs"
import { DeniedAction } from "@/registry/erp/permission-gate"
import { useMe } from "@/registry/hooks/use-me"
import { useRecordDenialReason } from "@/registry/hooks/use-record-access"
import {
  useRecordTransition,
  type TransitionRecord,
} from "@/registry/hooks/use-record-transition"
import { hasPermission } from "@/registry/lib/auth"
import { lifecycleAllows } from "@/registry/lib/document-lifecycle"
import { useErpUiT } from "@/registry/lib/i18n"
import { transitionsFrom, type ModuleTransition } from "@/registry/lib/statuses"
import { cn } from "@/registry/lib/utils"
import { Button } from "@/registry/ui/button"
import { Spinner } from "@/registry/ui/spinner"

/**
 * Панель дій документа (PF03 DocumentActionBar, ADR-0057): дії графа зі статусу запису, основна —
 * першою й із заливкою. Дії кіта (`submit`, `cancel`, `amend`, `reverse`) — лише зі свого стану
 * `docStatus`, хоч би що дозволяв граф.
 *
 * - Дія без права ролі чи заборонена записом (`deniedActions`, ADR-0037) — неактивна з причиною
 *   (SPEC §8.4); на вузькому контейнері причина ще й видимим рядком під кнопкою: дотик підказки не
 *   відкриває.
 * - Провести, скасувати, сторнувати й дія з причиною — через підтвердження з кнопкою-наслідком;
 *   решта — одразу. Поки дія йде, кнопки зайняті, а не зникають.
 * - Відмова сервера (403) — причина на кнопці й текстом під панеллю; конфлікт версій (409) —
 *   порівняння `compare` того, що бачила людина, коли вирішила, з тим, що зараз (SPEC §8.2).
 * - Кнопка з фокусом зникла разом зі статусом чи стала неактивною — фокус на ту саму дію чи на
 *   панель, а не на `body` (WCAG 2.4.3).
 */
export interface DocumentActionBarProps<R extends TransitionRecord> {
  resource: string
  record: R
  /** Граф модуля зі змінами розширення (`useResolvedTransitions`). */
  transitions: readonly ModuleTransition[]
  /** Поля для порівняння в конфлікті; без них чи без розбіжностей — версія. */
  compare?: (seen: R, current: R) => ConflictField[]
  /** Новий документ після `amend` чи `reverse`: перейти до нього. */
  onCreated?: (created: RaRecord, action: string) => void
  className?: string
}

/** Обгортка кнопки дії (`data-transition`): та сама між активною й неактивною, тож фокус знаходить заміну. */
const TRANSITION_ATTR = "data-transition"

/**
 * Фокус на дію `id`, а без неї на саму панель. Не через повернення фокуса Base UI: воно бере перший
 * елемент у порядку Tab усередині панелі, і випадковий Enter виконав би чужу дію.
 */
function focusAction(group: HTMLElement | null, id: string) {
  const button = group?.querySelector<HTMLElement>(
    `[${TRANSITION_ATTR}="${CSS.escape(id)}"] button`,
  )
  ;(button ?? group)?.focus({ preventScroll: true })
}

/**
 * Кнопка з фокусом зникла з DOM (статус змінився, дія стала неактивною з причиною) — фокус на ту саму
 * дію, а без неї на панель. Людина сама пішла з кнопки (клік повз, Tab) — забуваємо її: елемент у DOM.
 */
function useKeepActionFocus(
  group: React.RefObject<HTMLElement | null>,
  /** Панель уже на сторінці: поки профіль вантажиться, її немає. */
  isShown: boolean,
) {
  const focused = React.useRef<{ element: HTMLElement; id: string } | null>(
    null,
  )
  React.useEffect(() => {
    const node = group.current
    if (!node) return
    const remember = (event: FocusEvent) => {
      const target = event.target as HTMLElement
      const id = target
        .closest(`[${TRANSITION_ATTR}]`)
        ?.getAttribute(TRANSITION_ATTR)
      focused.current = id ? { element: target, id } : null
    }
    const forget = (event: FocusEvent) => {
      const target = event.target as HTMLElement
      // Видалений елемент уже не в DOM: його пам'ятаємо, щоб повернути фокус на заміну.
      queueMicrotask(() => {
        if (target.isConnected && focused.current?.element === target)
          focused.current = null
      })
    }
    node.addEventListener("focusin", remember)
    node.addEventListener("focusout", forget)
    return () => {
      node.removeEventListener("focusin", remember)
      node.removeEventListener("focusout", forget)
    }
  }, [group, isShown])
  React.useLayoutEffect(() => {
    const last = focused.current
    if (!last || last.element.isConnected) return
    focused.current = null
    if (document.activeElement === document.body)
      focusAction(group.current, last.id)
  })
}

function DocumentActionBar<R extends TransitionRecord>({
  resource,
  record,
  transitions,
  compare,
  onCreated,
  className,
}: DocumentActionBarProps<R>) {
  const t = useErpUiT()
  const { data: me, isPending } = useMe()
  const denialReason = useRecordDenialReason()
  const flow = useRecordTransition({ resource, record, onCreated })
  const [asking, setAsking] = React.useState<{
    transition: ModuleTransition
    seen: R
  } | null>(null)
  // Інший документ у тій самій панелі (кнопка «Назад») — підтвердження старого вже не про нього.
  if (asking && asking.seen.id !== record.id) setAsking(null)
  const groupRef = React.useRef<HTMLDivElement>(null)
  useKeepActionFocus(groupRef, !isPending)
  // Профіль ще вантажиться — без кнопок, які за мить стануть неактивними.
  if (isPending) return null
  const available = transitionsFrom(transitions, record.status).filter(
    (transition) => lifecycleAllows(transition.id, record.docStatus),
  )
  const reasonOf = (transition: ModuleTransition) =>
    hasPermission(me?.permissions ?? [], resource, transition.id)
      ? (denialReason(record, transition.id) ?? flow.refusalOf(transition.id))
      : t("documentActions.noPermission")
  const returnFocus = (id: string) => {
    focusAction(groupRef.current, id)
  }
  return (
    <div
      ref={groupRef}
      role="group"
      aria-label={t("documentActions.label")}
      aria-busy={flow.pending !== null || undefined}
      tabIndex={-1}
      data-slot="document-action-bar"
      className={cn(
        "@container space-y-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      {available.length ? (
        <div className="flex flex-col gap-2 @md:flex-row @md:flex-wrap @md:items-start">
          {available.map((transition, index) => (
            <div
              key={transition.id}
              data-transition={transition.id}
              className="flex flex-col gap-1"
            >
              <ActionButton
                transition={transition}
                reason={reasonOf(transition)}
                variant={index === 0 ? "default" : "outline"}
                pending={flow.pending}
                onRun={() => {
                  if (needsConfirmation(transition))
                    setAsking({ transition, seen: record })
                  else void flow.run(transition)
                }}
              />
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {t("documentActions.none")}
        </p>
      )}
      {flow.feedback ? (
        <p role="alert" className="text-sm text-destructive">
          {flow.feedback.text}
        </p>
      ) : null}
      <TransitionDialog
        transition={asking?.transition ?? null}
        onClose={() => {
          setAsking(null)
        }}
        onConfirm={(transition, reason) =>
          flow.run(transition, {
            reason,
            seen: asking?.seen,
            inDialog: transition.reason !== undefined,
          })
        }
        returnFocus={returnFocus}
      />
      <TransitionConflict
        conflict={flow.conflict}
        compare={compare}
        returnFocus={returnFocus}
        onRetry={() => void flow.retryConflict()}
        onReload={() => void flow.reloadAfterConflict()}
      />
    </div>
  )
}

/** Кнопка дії: активна, зайнята під час дії чи неактивна з причиною. */
function ActionButton({
  transition,
  reason,
  variant,
  pending,
  onRun,
}: {
  transition: ModuleTransition
  reason: string | undefined
  variant: "default" | "outline"
  pending: string | null
  onRun: () => void
}) {
  if (reason)
    return (
      <>
        <DeniedAction
          reason={reason}
          variant={variant}
          className="w-full @md:w-auto"
        >
          {transition.label}
        </DeniedAction>
        <p aria-hidden className="text-sm text-muted-foreground @md:hidden">
          {reason}
        </p>
      </>
    )
  const busy = pending === transition.id
  return (
    <Button
      variant={variant}
      disabled={pending !== null}
      focusableWhenDisabled
      aria-busy={busy || undefined}
      className="w-full @md:w-auto"
      onClick={onRun}
    >
      {busy ? <Spinner aria-hidden /> : null}
      {transition.label}
    </Button>
  )
}

export { DocumentActionBar }
