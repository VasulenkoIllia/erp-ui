import * as React from "react"
import type { RaRecord } from "ra-core"

import { ConfirmDialog } from "@/registry/erp/confirm-dialog"
import {
  ConflictDialog,
  type ConflictField,
} from "@/registry/erp/conflict-dialog"
import { DeniedAction } from "@/registry/erp/permission-gate"
import { useMe } from "@/registry/hooks/use-me"
import { useRecordDenialReason } from "@/registry/hooks/use-record-access"
import {
  useRecordTransition,
  type TransitionConflict as Conflict,
  type TransitionOutcome,
  type TransitionRecord,
} from "@/registry/hooks/use-record-transition"
import { hasPermission } from "@/registry/lib/auth"
import {
  lifecycleAllows,
  TRANSITION_REASON_MAX_LENGTH,
} from "@/registry/lib/document-lifecycle"
import { useErpUiT } from "@/registry/lib/i18n"
import { transitionsFrom, type ModuleTransition } from "@/registry/lib/statuses"
import { cn } from "@/registry/lib/utils"
import { Button } from "@/registry/ui/button"
import { Field, FieldError, FieldLabel } from "@/registry/ui/field"
import { Spinner } from "@/registry/ui/spinner"
import { Textarea } from "@/registry/ui/textarea"

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

/** Незворотні дії життєвого циклу питають підтвердження й без поля причини. */
const CONFIRMED_ACTIONS = ["submit", "cancel", "reverse"] as const
type ConfirmedAction = (typeof CONFIRMED_ACTIONS)[number]
const isConfirmed = (action: string): action is ConfirmedAction =>
  (CONFIRMED_ACTIONS as readonly string[]).includes(action)
const confirmKey = (action: string) => (isConfirmed(action) ? action : "other")
const DESTRUCTIVE_ACTIONS = new Set(["cancel", "reverse"])

const needsDialog = (transition: ModuleTransition) =>
  transition.reason !== undefined || isConfirmed(transition.id)

/** Обгортка кнопки дії (`data-transition`): та сама між активною й неактивною, тож фокус знаходить заміну. */
const TRANSITION_ATTR = "data-transition"
const actionButton = (group: HTMLElement | null, id: string) =>
  group?.querySelector<HTMLElement>(
    `[${TRANSITION_ATTR}="${CSS.escape(id)}"] button`,
  ) ?? null

/**
 * Кнопка з фокусом зникла з DOM (статус змінився, дія стала неактивною з причиною) — фокус на ту саму
 * дію, а без неї на панель. Людина сама пішла з кнопки — нічого не робимо: елемент лишився в DOM.
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
    node.addEventListener("focusin", remember)
    return () => {
      node.removeEventListener("focusin", remember)
    }
  }, [group, isShown])
  React.useLayoutEffect(() => {
    const last = focused.current
    if (!last || last.element.isConnected) return
    focused.current = null
    if (document.activeElement !== document.body) return
    ;(actionButton(group.current, last.id) ?? group.current)?.focus({
      preventScroll: true,
    })
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
                  if (needsDialog(transition))
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
        returnFocus={(id) =>
          actionButton(groupRef.current, id) ?? groupRef.current
        }
      />
      <TransitionConflict
        conflict={flow.conflict}
        compare={compare}
        finalFocus={groupRef}
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

/** Конфлікт версій (409): що людина бачила й що зараз; дія ще раз — з новою версією. */
function TransitionConflict<R extends TransitionRecord>({
  conflict,
  compare,
  finalFocus,
  onRetry,
  onReload,
}: {
  conflict: Conflict<R> | null
  compare?: (seen: R, current: R) => ConflictField[]
  finalFocus: React.RefObject<HTMLElement | null>
  onRetry: () => void
  onReload: () => void
}) {
  const t = useErpUiT()
  // Під час закриття діалог ще видно: таблиця й кнопка — останнього конфлікту.
  const [shown, setShown] = React.useState(conflict)
  if (conflict && conflict !== shown) setShown(conflict)
  if (!shown) return null
  const compared = compare?.(shown.seen, shown.current) ?? []
  return (
    <ConflictDialog
      open={conflict !== null}
      // Кнопка дії могла зникнути разом зі статусом: фокус — на панель.
      finalFocus={finalFocus}
      onOpenChange={(open) => {
        if (!open) onReload()
      }}
      fields={
        compared.length
          ? compared
          : [
              {
                key: "version",
                label: t("documentActions.conflict.version"),
                mine: shown.seen.version,
                theirs: shown.current.version,
              },
            ]
      }
      labels={{
        title: t("documentActions.conflict.title"),
        description: t("documentActions.conflict.description"),
        mine: t("documentActions.conflict.mine"),
        theirs: t("documentActions.conflict.theirs"),
        reload: t("documentActions.conflict.reload"),
        // Кнопка називає наслідок (SPEC §8.2): «Скасувати документ», а не «Скасувати».
        overwrite: t(
          `documentActions.confirm.${confirmKey(shown.transition.id)}.action`,
          {
            action: shown.transition.label,
          },
        ),
      }}
      onReload={onReload}
      onOverwrite={onRetry}
    />
  )
}

/** Підтвердження дії з причиною, якщо граф її питає; поле лишається з помилкою, доки сервер не прийме. */
function TransitionDialog({
  transition,
  onClose,
  onConfirm,
  returnFocus,
}: {
  transition: ModuleTransition | null
  onClose: () => void
  onConfirm: (
    transition: ModuleTransition,
    reason?: string,
  ) => Promise<TransitionOutcome>
  /** Куди повернути фокус: кнопка дії могла зникнути чи стати неактивною. */
  returnFocus: (action: string) => HTMLElement | null
}) {
  const t = useErpUiT()
  const id = React.useId()
  const fieldRef = React.useRef<HTMLTextAreaElement>(null)
  const [reason, setReason] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  // Під час закриття діалог ще видно: тексти — останньої дії. Кожне відкриття — з порожнього поля.
  const [shown, setShown] = React.useState(transition)
  const [wasOpen, setWasOpen] = React.useState(transition !== null)
  if (
    (transition !== null) !== wasOpen ||
    (transition && transition !== shown)
  ) {
    setWasOpen(transition !== null)
    if (transition) {
      setShown(transition)
      setReason("")
      setError(null)
    }
  }
  if (!shown) return null
  const text = (part: "title" | "description" | "action") =>
    t(`documentActions.confirm.${confirmKey(shown.id)}.${part}`, {
      action: shown.label,
    })
  const fail = (message: string) => {
    setError(message)
    fieldRef.current?.focus()
  }
  const confirm = async () => {
    const value = reason.trim()
    if (shown.reason === "required" && !value)
      return fail(t("documentActions.reasonRequired"))
    const outcome = await onConfirm(shown, value || undefined)
    if (typeof outcome === "object")
      return fail(
        outcome.reasonError === "required"
          ? t("documentActions.reasonRequired")
          : t("apiErrors.validation"),
      )
    onClose()
  }
  return (
    <ConfirmDialog
      open={transition !== null}
      title={text("title")}
      description={text("description")}
      confirmLabel={text("action")}
      destructive={DESTRUCTIVE_ACTIONS.has(shown.id)}
      cancelLabel={t("documentActions.keep")}
      onClose={onClose}
      onConfirm={confirm}
      returnFocus={() => returnFocus(shown.id)}
      lockWhileBusy
      body={
        shown.reason ? (
          <Field data-invalid={error ? true : undefined}>
            <FieldLabel htmlFor={`${id}-reason`}>
              {shown.reason === "required"
                ? t("documentActions.reason")
                : t("documentActions.reasonOptional")}
            </FieldLabel>
            <Textarea
              ref={fieldRef}
              id={`${id}-reason`}
              value={reason}
              maxLength={TRANSITION_REASON_MAX_LENGTH}
              required={shown.reason === "required"}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${id}-error` : undefined}
              onChange={(event) => {
                setReason(event.target.value)
                setError(null)
              }}
            />
            {error ? <FieldError id={`${id}-error`}>{error}</FieldError> : null}
          </Field>
        ) : null
      }
    />
  )
}

export { DocumentActionBar }
