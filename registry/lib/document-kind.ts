/**
 * Вид документа (ADR-0086): те, чим документ одного модуля відрізняється від іншого для спільних частин
 * сторінок, — ресурс, статуси з тоном і ключем підпису модуля, граф дій, дії зі своїм підписом і
 * підтвердженням, основний шлях смуги етапів. Модуль описує вид один раз (`QUOTE_KIND`, `INVOICE_KIND`,
 * `PAYMENT_KIND`) і додає своє: адреси сторінок і розширення документа. Модулі не імпортують один одного
 * (ADR-0070), тож спільне для документних модулів лежить тут, а не копіюється в кожен.
 *
 *   export const INVOICE_KIND: K2DocumentKind = { resource: INVOICES, statuses, transitions, … }
 *   const statuses = useDocumentStatuses(kind.statuses, t, kind.extensionOf(extension)?.statuses)
 *   const transitions = useDocumentTransitions(kind.transitions, kind, t, changes)
 */
import { useMemo } from "react"

import { isDocumentAction } from "@/registry/lib/document-lifecycle"
import { useErpUiT } from "@/registry/lib/i18n"
import {
  useResolvedStatuses,
  useResolvedTransitions,
  type ExtensionStatusChanges,
  type ExtensionTransitionChanges,
  type ModuleTransition,
  type ResolvedStatuses,
  type StatusTone,
  type StatusTransition,
  type TransitionConfirmText,
} from "@/registry/lib/statuses"

/** Статус документа модуля: тон і ключ підпису в рядках модуля. */
export interface DocumentStatusOption<Label extends string = string> {
  readonly id: string
  readonly tone: StatusTone
  readonly label: Label
}

/** Ключі рядків підтвердження дії модуля: `<префікс>.title`, `.description`, `.action`. */
export type DocumentConfirmKey<Confirm extends string> =
  `${Confirm}.${keyof TransitionConfirmText}`

export interface DocumentKind<
  Label extends string = string,
  Confirm extends string = string,
> {
  readonly resource: string
  readonly statuses: readonly DocumentStatusOption<Label>[]
  readonly transitions: readonly StatusTransition[]
  /** Дії зі своїм підписом модуля; решта — підписи кіта (`documentActions.<дія>`) чи `id` дії. */
  readonly actionLabels?: Readonly<Partial<Record<string, Label>>>
  /** Дії зі своїми текстами підтвердження: «Виставити рахунок?» замість «Провести документ?». */
  readonly confirms?: Readonly<Partial<Record<string, Confirm>>>
  /** Основний шлях для смуги етапів; решта статусів — бейджем. */
  readonly mainPath?: readonly string[]
}

/** Параметр адреси нової форми з документом, який копіюють: `…/new?copy=<id>` (ADR-0067). */
export const COPY_PARAM = "copy"

/** Адреса нової форми, заповненої документом `id` («Копіювати»). */
export const copyPath = (create: string) => (id: string) =>
  `${create}?${new URLSearchParams({ [COPY_PARAM]: id }).toString()}`

/**
 * Статуси документа мовою інтерфейсу зі статусами розширення проекту: `t` — переклад рядків модуля
 * (стабільний між рендерами, як хук з `createModuleT`).
 */
export function useDocumentStatuses<Label extends string, K extends string>(
  statuses: readonly DocumentStatusOption<Label>[],
  t: (key: NoInfer<Label>) => string,
  changes: ExtensionStatusChanges<K> | undefined,
): ResolvedStatuses {
  const labelled = useMemo(
    () =>
      statuses.map(({ id, tone, label }) => ({
        id: id as K,
        label: t(label),
        tone,
      })),
    [t, statuses],
  )
  return useResolvedStatuses(labelled, changes)
}

/**
 * Граф дій документа мовою інтерфейсу зі змінами розширення: дії модуля — своїм підписом і
 * підтвердженням з `texts` («Надіслати пропозицію?»), «Скасувати», «Сторнувати» й «Виправити» — підписи
 * кіта, решта — `id` дії. `transitions` — стабільний між рендерами масив.
 */
export function useDocumentTransitions<
  Label extends string,
  Confirm extends string,
  A extends string,
>(
  transitions: readonly StatusTransition[],
  texts: Pick<DocumentKind<Label, Confirm>, "actionLabels" | "confirms">,
  t: (key: NoInfer<Label | DocumentConfirmKey<Confirm>>) => string,
  changes: ExtensionTransitionChanges<A> | undefined,
): readonly ModuleTransition[] {
  const kitT = useErpUiT()
  const { actionLabels, confirms } = texts
  const labelled = useMemo(
    () =>
      transitions.map((transition) => {
        const label = actionLabels?.[transition.id]
        const confirm = confirms?.[transition.id]
        return {
          ...transition,
          id: transition.id as A,
          label: label
            ? t(label)
            : isDocumentAction(transition.id)
              ? kitT(`documentActions.${transition.id}`)
              : transition.id,
          confirm: confirm
            ? {
                title: t(`${confirm}.title`),
                description: t(`${confirm}.description`),
                action: t(`${confirm}.action`),
              }
            : undefined,
        }
      }),
    [t, kitT, transitions, actionLabels, confirms],
  )
  return useResolvedTransitions(labelled, changes)
}
