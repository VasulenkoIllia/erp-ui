import * as React from "react"

import { ErrorBoundary } from "@/registry/erp/error-boundary"
import { localizedText } from "@/registry/lib/auth"
import type { DocumentLine } from "@/registry/lib/document-lines"
import {
  extensionFieldText,
  type ExtensionField,
  type FieldTextContext,
} from "@/registry/lib/extension-fields"
import {
  applyKeyedChanges,
  extensionValue,
  mapKeyedChanges,
  type Keyed,
  type KeyedChanges,
} from "@/registry/lib/extensions"
import { formatDate, formatNumber } from "@/registry/lib/format"
import { usePrintSheet } from "@/registry/lib/print"
import { RecordLabel } from "@/registry/lib/record-label"

/**
 * Блоки аркуша документа зі змінами розширення (PF08, ADR-0062, ADR-0086): модуль описує аркуш
 * списком блоків із ключами (шапка компанії, назва, сторони, поля розширення, рядки, підсумки,
 * підписи), розширення додає свій блок, ховає чи переставляє блок модуля.
 *
 * - Блок проекту — компонент у слоті: запис і ресурс; мова, локаль і рядки кіта аркуша —
 *   `usePrintSheet()`. Збій блока прибирає лише його, а не аркуш.
 * - Поля розширення на аркуші (`PrintExtensionFields`) і в рядках (`useSheetLineDetails`) — мовою
 *   документа: числа й дати локаллю аркуша, «Так»/«Ні» — рядками кіта аркуша, варіант — підписом цієї
 *   мови, запис із довідника — підписом із сервера. Порожнє значення не друкується.
 */

/** Що отримує блок проекту на аркуші: запис і ресурс API. */
export interface SheetSlotProps<T> {
  readonly record: T
  readonly resource: string
}

/** Блок аркуша з компонентом проекту. */
export interface ExtensionSheetBlock<T> extends Keyed {
  readonly component: React.ComponentType<SheetSlotProps<T>>
}

/** Блок аркуша модуля. */
export interface SheetBlock extends Keyed {
  readonly node: React.ReactNode
}

const hideFailed = () => null

/** Блоки модуля зі змінами розширення; без змін — ті самі. */
export function useSheetBlocks<T, K extends string>(
  blocks: readonly (SheetBlock & { id: K })[],
  {
    record,
    resource,
    changes,
  }: {
    record: T
    resource: string
    changes: KeyedChanges<ExtensionSheetBlock<T>, K> | undefined
  },
): readonly SheetBlock[] {
  return applyKeyedChanges<SheetBlock & { id: K }, SheetBlock>(
    blocks,
    mapKeyedChanges(changes, ({ id, component: Slot }) => ({
      id,
      node: (
        <ErrorBoundary fallback={hideFailed}>
          <Slot record={record} resource={resource} />
        </ErrorBoundary>
      ),
    })),
  )
}

/** Блоки аркуша по порядку: кожен — свій елемент сітки аркуша. */
export function PrintSheetBlocks({
  blocks,
}: {
  blocks: readonly SheetBlock[]
}) {
  return blocks.map((block) => (
    <React.Fragment key={block.id}>{block.node}</React.Fragment>
  ))
}

/** Текст значення поля розширення мовою аркуша. */
function useSheetFieldText(): FieldTextContext {
  const { t, language, locale } = usePrintSheet()
  return React.useMemo(
    () => ({
      number: (value) => formatNumber(value, locale),
      date: (value) => formatDate(value, "date", locale),
      t,
      label: (text) => localizedText(text, language) ?? "",
    }),
    [t, language, locale],
  )
}

interface SheetFieldEntry {
  readonly id: string
  readonly label: string
  readonly value: React.ReactNode
}

/** Підписи й значення полів з ключами `shown` мовою аркуша; порожні й невідомі ключі пропускає. */
function useSheetEntries(
  all: readonly ExtensionField[] | undefined,
  shown: readonly Keyed[] | undefined,
) {
  const context = useSheetFieldText()
  return React.useCallback(
    (record: unknown): SheetFieldEntry[] =>
      (shown ?? []).flatMap(({ id }) => {
        const field = all?.find((candidate) => candidate.id === id)
        if (!field) return []
        const raw = extensionValue(record, id)
        const text = extensionFieldText(field, raw, context)
        if (text === null) return []
        const value =
          field.type === "record" ? (
            <RecordLabel
              resource={field.resource}
              id={text}
              labelField={field.labelField}
            />
          ) : (
            text
          )
        return [{ id, label: context.label(field.label), value }]
      }),
    [all, shown, context],
  )
}

/**
 * Поля розширення документа на аркуші рядками «Договір: № 15/2026». `shown` — ключі з `print.fields`
 * розширення в їхньому порядку; нічого показати — блоку немає.
 */
export function PrintExtensionFields({
  record,
  fields,
  shown,
}: {
  record: unknown
  /** Усі поля розширення документа (`fields`). */
  fields: readonly ExtensionField[] | undefined
  shown: readonly Keyed[] | undefined
}) {
  const entries = useSheetEntries(fields, shown)(record)
  if (!entries.length) return null
  return (
    <dl data-slot="print-extension-fields" className="grid gap-0.5">
      {entries.map((entry) => (
        <div key={entry.id}>
          <dt className="inline font-medium">{entry.label}: </dt>
          <dd className="inline">{entry.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/**
 * Поля розширення рядка під назвою на аркуші (`PrintDocumentLines.lineDetails`): «УКТЗЕД: 8471 30 00 00»
 * дрібнішим шрифтом; без полів рядка — `undefined`, і таблиця та сама.
 */
export function useSheetLineDetails(
  lineFields: readonly ExtensionField[] | undefined,
): ((line: DocumentLine) => React.ReactNode) | undefined {
  const entries = useSheetEntries(lineFields, lineFields)
  if (!lineFields?.length) return undefined
  return (line) => {
    const shown = entries(line)
    if (!shown.length) return null
    return (
      <span className="block text-[8pt] text-muted-foreground">
        {shown.map((entry, index) => (
          <React.Fragment key={entry.id}>
            {index > 0 ? "; " : null}
            {entry.label}: {entry.value}
          </React.Fragment>
        ))}
      </span>
    )
  }
}
