/**
 * Дія над записом за графом переходів (lib/statuses, lib/document-lifecycle, ADR-0057): запит і
 * відповіді сервера для `erp/document-action-bar`.
 *
 * - Поки дія йде, інша не запускається: подвійне натискання дію не повторює.
 * - Версія — того запису, який людина бачила, коли вирішила (`seen`): картка під відкритим діалогом
 *   могла перечитатись, і тоді сервер відповість 409, а не виконає дію над чужими змінами.
 * - Успіх — оголошення для скрінрідера й перечитування ресурсу; новий документ (`amend`, `reverse`)
 *   — `onCreated`.
 * - 403 — сервер дії не дає. Причину з позначки `current` (ADR-0037) кнопка тримає, доки не прийде
 *   новий запис; поруч із панеллю — видимий текст, бо підказки на дотик телефон не відкриває.
 * - 409 `conflict` — порівняння того, що бачила людина, з `current`; `retryConflict` повторює дію з
 *   новою версією.
 * - 422 `fieldErrors.reason` — у полі причини діалогу; без поля й інша помилка — текстом за кодом
 *   поруч. Відповідь із `current` чи 404 перечитує ресурс: картка не лишається застарілою.
 * - Відповідь, що прийшла після переходу на інший документ чи виходу зі сторінки, нічого не показує
 *   й нікуди не веде.
 */
import * as React from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useDataProvider, type Identifier, type RaRecord } from "ra-core"

import { useApiErrorMessage } from "@/registry/hooks/use-api-error-message"
import { useRecordDenialReason } from "@/registry/hooks/use-record-access"
import { announce } from "@/registry/lib/announce"
import { isApiError } from "@/registry/lib/api"
import type { ErpDataProvider } from "@/registry/lib/data-provider"
import {
  createsDocument,
  isDocumentAction,
} from "@/registry/lib/document-lifecycle"
import { useErpUiT } from "@/registry/lib/i18n"
import type { ModuleTransition } from "@/registry/lib/statuses"

/** Запис, над яким дія: статус для графа, версія для конфлікту, позначка заборон сервера. */
export interface TransitionRecord {
  readonly id: Identifier
  readonly version: number
  readonly status: string
  /** Стан документа (lib/document-lifecycle): дії кіта — лише зі свого стану. */
  readonly docStatus?: string
  readonly deniedActions?: Readonly<Record<string, string>>
}

/** Видимий текст поруч із панеллю: відмова сервера чи збій. */
export interface TransitionFeedback {
  readonly action: string
  readonly text: string
}

export interface TransitionConflict<R> {
  readonly transition: ModuleTransition
  readonly reason?: string
  /** Запис, який людина бачила, коли вирішила: картка тим часом могла перечитатись. */
  readonly seen: R
  readonly current: R
}

/** Чим скінчилась дія: діалог причини лишається відкритим лише з помилкою поля. */
export type TransitionOutcome =
  "done" | "failed" | { readonly reasonError: string }

export interface RunTransitionOptions<R> {
  readonly reason?: string
  /** Запис, на який людина дивилась, коли вирішила; за замовчуванням — поточний. */
  readonly seen?: R
  /** Діалог має поле причини: помилку поля показує він. */
  readonly inDialog?: boolean
}

type Failure =
  | { readonly kind: "reason"; readonly reasonError: string }
  | { readonly kind: "conflict"; readonly current: TransitionRecord }
  | { readonly kind: "refused"; readonly current: unknown }
  | {
      readonly kind: "failed"
      readonly error: unknown
      readonly reload: boolean
    }

const isTransitionRecord = (value: unknown): value is TransitionRecord =>
  typeof value === "object" &&
  value !== null &&
  "version" in value &&
  typeof value.version === "number" &&
  "id" in value

/** Що показати після помилки: поле причини, конфлікт, відмову чи збій. */
function classifyFailure(error: unknown, inDialog: boolean): Failure {
  if (!isApiError(error)) return { kind: "failed", error, reload: false }
  if (inDialog && error.fieldErrors?.reason)
    return { kind: "reason", reasonError: error.fieldErrors.reason }
  // 409 без запису (чужий бекенд) — звичайний збій: повтору нема з чим порівняти.
  if (error.code === "conflict" && isTransitionRecord(error.current))
    return { kind: "conflict", current: error.current }
  if (error.status === 403) return { kind: "refused", current: error.current }
  return {
    kind: "failed",
    error,
    reload: error.current !== undefined || error.status === 404,
  }
}

interface Refusals {
  /** Запис, на якому сервер відмовив: новий запис — свої позначки. */
  readonly base: object
  readonly reasons: Readonly<Record<string, string>>
}

/** Поточний запис і чи панель ще на сторінці — для відповідей, що приходять пізніше. */
function useLatest<R extends TransitionRecord>(record: R) {
  const latest = React.useRef({ record, mounted: true })
  React.useEffect(() => {
    latest.current = { record, mounted: true }
  })
  React.useEffect(
    () => () => {
      latest.current = { ...latest.current, mounted: false }
    },
    [],
  )
  return latest
}

/**
 * Що бачить людина після збою: текст під панеллю, відмови сервера, які кнопки тримають, доки запис
 * той самий, і конфлікт. Інший документ у тій самій панелі — без чужих повідомлень.
 */
function useTransitionMessages<R extends TransitionRecord>(
  record: R,
  reload: () => Promise<void>,
) {
  const t = useErpUiT()
  const errorText = useApiErrorMessage()
  const denialReason = useRecordDenialReason()
  const [feedback, setFeedback] = React.useState<TransitionFeedback | null>(
    null,
  )
  const [refusals, setRefusals] = React.useState<Refusals | null>(null)
  const [conflict, setConflict] = React.useState<TransitionConflict<R> | null>(
    null,
  )
  // Новий запис від сервера (колега змінив, інший документ) — старий текст про збій уже не про нього.
  const [shown, setShown] = React.useState(record)
  if (record.id !== shown.id || record.version !== shown.version) {
    setShown(record)
    setFeedback(null)
    if (record.id !== shown.id) setConflict(null)
  }
  const say = (transition: ModuleTransition, text: string) => {
    setFeedback({ action: transition.id, text })
  }
  /** `base` — запис на екрані, коли прийшла відмова: кнопка тримає причину, доки він той самий. */
  const refused = (
    transition: ModuleTransition,
    current: unknown,
    base: object,
  ) => {
    const reason =
      denialReason(current, transition.id) ?? t("apiErrors.forbidden")
    setRefusals((prev) => ({
      base,
      reasons: {
        ...(prev?.base === base ? prev.reasons : {}),
        [transition.id]: reason,
      },
    }))
    say(
      transition,
      t("documentActions.refused", { action: transition.label, reason }),
    )
  }
  return {
    feedback,
    conflict,
    clear: () => {
      setFeedback(null)
    },
    closeConflict: () => {
      setConflict(null)
    },
    refusalOf: (action: string) =>
      refusals?.base === record ? refusals.reasons[action] : undefined,
    show: (
      transition: ModuleTransition,
      failure: Failure,
      { seen, reason, base }: { seen: R; reason?: string; base: object },
    ) => {
      if (failure.kind === "conflict")
        // `current` — запис ресурсу за контрактом; версію перевірено в `classifyFailure`.
        setConflict({ transition, reason, seen, current: failure.current as R })
      if (failure.kind === "refused") refused(transition, failure.current, base)
      if (failure.kind === "failed")
        say(
          transition,
          t("documentActions.failed", {
            action: transition.label,
            message: errorText(failure.error),
          }),
        )
      // Свіжий запис несе позначку сервера: кнопка лишається неактивною й після перечитування.
      if (
        failure.kind === "refused" ||
        (failure.kind === "failed" && failure.reload)
      )
        void reload()
    },
  }
}

export function useRecordTransition<R extends TransitionRecord>({
  resource,
  record,
  onCreated,
}: {
  resource: string
  record: R
  onCreated?: (created: RaRecord, action: string) => void
}) {
  const dataProvider = useDataProvider<ErpDataProvider>()
  const queryClient = useQueryClient()
  const t = useErpUiT()
  const latest = useLatest(record)
  const reload = () => queryClient.invalidateQueries({ queryKey: [resource] })
  const messages = useTransitionMessages(record, reload)
  const [pending, setPending] = React.useState<string | null>(null)
  const inFlight = React.useRef(false)
  const isCurrent = (seen: R) =>
    latest.current.mounted && latest.current.record.id === seen.id

  const run = async (
    transition: ModuleTransition,
    { reason, seen = record, inDialog = false }: RunTransitionOptions<R> = {},
  ): Promise<TransitionOutcome> => {
    if (inFlight.current) return "failed"
    inFlight.current = true
    setPending(transition.id)
    messages.clear()
    try {
      const result = await dataProvider.runTransition(
        resource,
        seen.id,
        transition.id,
        { version: seen.version, ...(reason ? { reason } : {}) },
      )
      announce(
        isDocumentAction(transition.id)
          ? t(`documentActions.done.${transition.id}`)
          : t("documentActions.done.other", { action: transition.label }),
      )
      await reload()
      if (isCurrent(seen) && createsDocument(transition.id))
        onCreated?.(result, transition.id)
      return "done"
    } catch (error) {
      const failure = classifyFailure(error, inDialog)
      if (failure.kind === "reason") return { reasonError: failure.reasonError }
      if (isCurrent(seen))
        messages.show(transition, failure, {
          seen,
          reason,
          base: latest.current.record,
        })
      return "failed"
    } finally {
      inFlight.current = false
      setPending(null)
    }
  }

  const { conflict } = messages
  return {
    pending,
    feedback: messages.feedback,
    conflict,
    /** Причина відмови сервера для дії, поки запис той самий. */
    refusalOf: messages.refusalOf,
    run,
    /** Повторити дію з конфлікту з версією, яку щойно показали. */
    retryConflict: async () => {
      if (!conflict) return
      messages.closeConflict()
      await run(conflict.transition, {
        reason: conflict.reason,
        seen: conflict.current,
      })
    },
    /** Закрити порівняння й показати поточну версію. */
    reloadAfterConflict: async () => {
      messages.closeConflict()
      await reload()
    },
  }
}
