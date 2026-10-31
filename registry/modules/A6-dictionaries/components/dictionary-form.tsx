import { useCallback, useMemo, type RefObject } from "react"
import type { Control, FieldValues } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { useExtensionForm } from "@/components/erp/extension-field-input"
import { FormField } from "@/components/erp/form"
import { KeyValueField } from "@/components/erp/key-value-field"
import {
  RecordFormDialog,
  type RecordFormItem,
} from "@/components/erp/record-form"
import { Input } from "@/components/ui/input"
import { useRecordForm } from "@/hooks/use-record-form"
import type { ExtensionField } from "@/lib/extension-fields"
import type { ExtensionFormChanges } from "@/lib/extension-form"
import { applyKeyedChanges } from "@/lib/extensions"
import { useErpUiT } from "@/lib/i18n"
import { keyValueSchema, keyValueText, type KeyValueRow } from "@/lib/key-value"

import { NAME_MAX, type DictionaryEntry } from "../contract"
import { useDictionariesT } from "../use-dictionaries-t"
import type { DictionaryStrings } from "./dictionary-page"

/**
 * Спільне форм довідників (ADR-0026, ADR-0047): схема полів, що є всюди, поля розширення, збереження
 * з тостом і закриттям, діалог. Самі поля дає форма свого довідника.
 */
export interface EntryFormValues extends FieldValues {
  name: string
}

/** Схеми полів, що повторюються у формах: тексти мовою інтерфейсу. */
export function useEntryShape() {
  const t = useDictionariesT()
  const kitT = useErpUiT()
  return useMemo(() => {
    const required = kitT("validation.required")
    return {
      name: z
        .string()
        .trim()
        .min(1, required)
        .max(NAME_MAX, t("common.form.tooLong", { max: NAME_MAX })),
      externalCodes: keyValueSchema({
        required,
        duplicate: kitT("keyValue.duplicate"),
        tooLong: kitT("keyValue.tooLong"),
      }),
    }
  }, [t, kitT])
}

interface DictionaryFormConfig<
  TValues extends EntryFormValues,
  TEntry extends DictionaryEntry,
  TField extends string,
> {
  readonly resource: string
  readonly strings: DictionaryStrings
  readonly entry?: TEntry
  readonly extension?: {
    readonly fields?: readonly ExtensionField[]
    readonly form?: ExtensionFormChanges<TField>
  }
  /** Схема запису контракту з полями розширення. */
  readonly recordSchema: z.ZodType<TEntry>
  /** Схема на кожне поле значень форми; стабільні між рендерами. */
  readonly shape: {
    readonly [K in keyof TValues]: z.ZodType<TValues[K], TValues[K]>
  }
  /** Значення нового запису без полів розширення. */
  readonly empty: TValues
  /** Запис → значення форми; стабільна між рендерами. */
  readonly fromEntry: (entry: TEntry) => TValues
  /** Значення форми → поля запиту, коли вони різняться (рядки «ключ–значення» → об'єкт). */
  readonly toRequest?: (values: TValues) => Record<string, unknown>
  readonly onClose: () => void
}

/** Форма значення довідника: `useRecordForm`, поля розширення, тост після збереження. */
export function useDictionaryForm<
  TValues extends EntryFormValues,
  TEntry extends DictionaryEntry,
  TField extends string,
>(config: DictionaryFormConfig<TValues, TEntry, TField>) {
  const t = useDictionariesT()
  const {
    resource,
    strings,
    entry,
    extension,
    recordSchema,
    shape,
    empty,
    fromEntry,
    toRequest,
    onClose,
  } = config
  const ext = useExtensionForm<TField>(extension?.fields, extension?.form)
  const toValues = useCallback(
    (record: TEntry): TValues => ({
      ...fromEntry(record),
      ...ext.values(record),
    }),
    [fromEntry, ext],
  )
  const schema = useMemo(
    () =>
      z.object({ ...shape, ...ext.shape }) as unknown as z.ZodType<
        TValues,
        TValues
      >,
    [shape, ext.shape],
  )
  const state = useRecordForm<TValues, TEntry>({
    resource,
    record: entry,
    schema,
    defaultValues: entry ? toValues(entry) : { ...empty, ...ext.values() },
    recordSchema,
    toPayload: (values, keys) => {
      const request: Record<string, unknown> = toRequest?.(values) ?? values
      return Object.fromEntries(keys.map((key) => [key, request[key]]))
    },
    toValues,
    onSaved: (saved) => {
      toast.success(
        t(entry ? `${strings}.form.saved` : `${strings}.form.created`, {
          name: saved.name,
        }),
      )
      onClose()
    },
    onUnchanged: onClose,
  })
  return { state, ext }
}

export function DictionaryFormDialog<
  TValues extends EntryFormValues,
  TEntry extends DictionaryEntry,
  TField extends string,
>({
  form,
  strings,
  entry,
  items,
  onClose,
  finalFocus,
}: {
  form: ReturnType<typeof useDictionaryForm<TValues, TEntry, TField>>
  strings: DictionaryStrings
  entry?: TEntry
  items: readonly (RecordFormItem & { id: TField })[]
  onClose: () => void
  finalFocus: RefObject<HTMLElement | null>
}) {
  const t = useDictionariesT()
  const kitT = useErpUiT()
  const { state, ext } = form
  return (
    <RecordFormDialog
      onClose={onClose}
      title={t(
        entry ? `${strings}.form.editTitle` : `${strings}.form.createTitle`,
      )}
      description={entry?.name}
      submitLabel={kitT(entry ? "recordForm.save" : "recordForm.create")}
      state={state}
      items={applyKeyedChanges(items, ext.items(state.form.control))}
      finalFocus={finalFocus}
    />
  )
}

/** Поле «Назва»: є в кожному довіднику. */
export function useNameItem<TValues extends EntryFormValues>(
  control: Control<TValues>,
): RecordFormItem & { id: "name" } {
  const t = useDictionariesT()
  return {
    id: "name",
    label: t("common.form.name"),
    wide: true,
    render: (props) => (
      <FormField
        {...props}
        control={control as unknown as Control<EntryFormValues>}
        name="name"
        render={({ field, control: aria }) => (
          <Input {...field} {...aria} autoComplete="off" />
        )}
      />
    ),
  }
}

interface WithExternalCodes extends EntryFormValues {
  externalCodes: KeyValueRow[]
}

/** Поле «Зовнішні коди»: коди значення в інших системах (вікторина кроку A6). */
export function useExternalCodesItem<TValues extends WithExternalCodes>(
  control: Control<TValues>,
): RecordFormItem & { id: "externalCodes" } {
  const t = useDictionariesT()
  return {
    id: "externalCodes",
    label: t("common.form.externalCodes"),
    description: t("common.form.externalCodesHint"),
    wide: true,
    text: (value) => keyValueText(value as KeyValueRow[]),
    render: ({ label, description, className }) => (
      <KeyValueField
        control={control as unknown as Control<WithExternalCodes>}
        name="externalCodes"
        label={label}
        description={description}
        keyLabel={t("common.form.externalSystem")}
        valueLabel={t("common.form.externalCode")}
        addLabel={t("common.form.externalAdd")}
        empty={t("common.form.externalEmpty")}
        className={className}
      />
    ),
  }
}
