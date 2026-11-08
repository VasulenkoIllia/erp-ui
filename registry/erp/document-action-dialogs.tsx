import * as React from "react"

import { ConfirmDialog } from "@/registry/erp/confirm-dialog"
import {
  ConflictDialog,
  type ConflictField,
} from "@/registry/erp/conflict-dialog"
import type {
  TransitionConflict as Conflict,
  TransitionOutcome,
  TransitionRecord,
} from "@/registry/hooks/use-record-transition"
import { TRANSITION_REASON_MAX_LENGTH } from "@/registry/lib/document-lifecycle"
import { useErpUiT } from "@/registry/lib/i18n"
import type {
  ModuleTransition,
  TransitionConfirmText,
} from "@/registry/lib/statuses"
import { Field, FieldError, FieldLabel } from "@/registry/ui/field"
import { Textarea } from "@/registry/ui/textarea"

/**
 * Діалоги панелі дій документа (PF03, ADR-0057): підтвердження з причиною й конфлікт версій. Окремо від
 * `erp/document-action-bar`, щоб файл панелі лишався коротким; самі по собі не потрібні.
 */

/** Незворотні дії життєвого циклу питають підтвердження й без поля причини. */
const CONFIRMED_ACTIONS = ["submit", "cancel", "reverse"] as const
type ConfirmedAction = (typeof CONFIRMED_ACTIONS)[number]
const isConfirmed = (action: string): action is ConfirmedAction =>
  (CONFIRMED_ACTIONS as readonly string[]).includes(action)
const confirmKey = (action: string) => (isConfirmed(action) ? action : "other")
const DESTRUCTIVE_ACTIONS = new Set(["cancel", "reverse"])

/** Дія питає підтвердження: незворотна чи з причиною. */
export const needsConfirmation = (transition: ModuleTransition) =>
  transition.reason !== undefined || isConfirmed(transition.id)

/** Конфлікт версій (409): що людина бачила й що зараз; дія ще раз — з новою версією. */
export function TransitionConflict<R extends TransitionRecord>({
  conflict,
  compare,
  returnFocus,
  onRetry,
  onReload,
}: {
  conflict: Conflict<R> | null
  compare?: (seen: R, current: R) => ConflictField[]
  /** Повернути фокус після закриття: кнопка дії могла зникнути разом зі статусом. */
  returnFocus: (action: string) => void
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
      finalFocus={() => {
        returnFocus(shown.transition.id)
        return false
      }}
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
        overwrite:
          shown.transition.confirm?.action ??
          t(
            `documentActions.confirm.${confirmKey(shown.transition.id)}.action`,
            { action: shown.transition.label },
          ),
      }}
      onReload={onReload}
      onOverwrite={onRetry}
    />
  )
}

/** Підтвердження дії з причиною, якщо граф її питає; поле лишається з помилкою, доки сервер не прийме. */
export function TransitionDialog({
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
  /** Повернути фокус після закриття: кнопка дії могла зникнути чи стати неактивною. */
  returnFocus: (action: string) => void
}) {
  const t = useErpUiT()
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
  const text = (part: keyof TransitionConfirmText) =>
    shown.confirm?.[part] ??
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
      returnFocus={() => {
        returnFocus(shown.id)
        return false
      }}
      lockWhileBusy
      body={
        shown.reason ? (
          <TransitionReasonField
            ref={fieldRef}
            reason={shown.reason}
            value={reason}
            error={error}
            onChange={(value) => {
              setReason(value)
              setError(null)
            }}
          />
        ) : null
      }
    />
  )
}

/**
 * Поле причини дії (ADR-0057): підпис за тим, чи причина обов'язкова, межа довжини контракту, помилка
 * під полем. Діалог дії над документом і масової дії (erp/bulk-action, ADR-0066).
 */
export function TransitionReasonField({
  ref,
  reason,
  value,
  error,
  onChange,
}: {
  ref?: React.Ref<HTMLTextAreaElement>
  reason: "required" | "optional"
  value: string
  error: string | null
  onChange: (value: string) => void
}) {
  const t = useErpUiT()
  const id = React.useId()
  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={`${id}-reason`}>
        {reason === "required"
          ? t("documentActions.reason")
          : t("documentActions.reasonOptional")}
      </FieldLabel>
      <Textarea
        ref={ref}
        id={`${id}-reason`}
        value={value}
        maxLength={TRANSITION_REASON_MAX_LENGTH}
        required={reason === "required"}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(event) => {
          onChange(event.target.value)
        }}
      />
      {error ? <FieldError id={`${id}-error`}>{error}</FieldError> : null}
    </Field>
  )
}
