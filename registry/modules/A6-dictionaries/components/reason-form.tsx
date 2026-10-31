import { useMemo } from "react"
import { z } from "zod"

import { BooleanFormField } from "@/components/erp/extension-field-input"
import { FormField } from "@/components/erp/form"
import { FormSelect } from "@/components/erp/form-select"
import type { RecordFormItem } from "@/components/erp/record-form"
import { useErpUiT } from "@/lib/i18n"

import { REASONS, reasonSchemaFor, type Reason } from "../contract"
import type { ReasonFormFieldId } from "../extension"
import { useDictionariesModule } from "../module-context"
import { useDictionariesT } from "../use-dictionaries-t"
import {
  DictionaryFormDialog,
  useDictionaryForm,
  useEntryShape,
  useNameItem,
} from "./dictionary-form"
import type { DictionaryFormProps } from "./dictionary-page"
import { useReasonKinds } from "./use-reason-kinds"

/** Причина в діалозі (ADR-0047): назва, де застосовується, чи потрібен коментар. */
interface ReasonFormValues {
  name: string
  kind: string
  commentRequired: boolean
  [extensionField: string]: unknown
}

const fromEntry = (reason: Reason): ReasonFormValues => ({
  name: reason.name,
  kind: reason.kind,
  commentRequired: reason.commentRequired,
})

export function ReasonFormDialog({
  entry,
  onClose,
  finalFocus,
}: DictionaryFormProps<Reason>) {
  const t = useDictionariesT()
  const kitT = useErpUiT()
  const { extension } = useDictionariesModule()
  const { options: kinds, byId } = useReasonKinds()
  const { name } = useEntryShape()
  const shape = useMemo(
    () => ({
      name,
      kind: z.string().min(1, kitT("validation.required")),
      commentRequired: z.boolean(),
    }),
    [name, kitT],
  )
  const recordSchema = useMemo(
    () => reasonSchemaFor(extension.reasons),
    [extension.reasons],
  )
  const empty = useMemo(
    (): ReasonFormValues => ({
      name: "",
      kind: kinds[0]?.id ?? "",
      commentRequired: false,
    }),
    [kinds],
  )
  const form = useDictionaryForm<ReasonFormValues, Reason, ReasonFormFieldId>({
    resource: REASONS,
    strings: "reasons",
    entry,
    extension: extension.reasons,
    recordSchema,
    shape,
    empty,
    fromEntry,
    onClose,
  })
  const { control } = form.state.form
  // Схований вид лишається у формі значення, яке його вже має.
  const shown = kinds.some((kind) => kind.id === entry?.kind)
  const options = [
    ...kinds.map((kind) => ({ value: kind.id, label: kind.label })),
    ...(entry && !shown
      ? [
          {
            value: entry.kind,
            label: byId.get(entry.kind)?.label ?? entry.kind,
          },
        ]
      : []),
  ]
  const items: (RecordFormItem & { id: ReasonFormFieldId })[] = [
    useNameItem(control),
    {
      id: "kind",
      label: t("reasons.form.kind"),
      wide: true,
      text: (value) => byId.get(String(value))?.label ?? String(value),
      render: (props) => (
        <FormField
          {...props}
          control={control}
          name="kind"
          render={({ field, control: aria }) => (
            <FormSelect
              {...aria}
              ref={field.ref}
              items={options}
              value={field.value}
              onValueChange={field.onChange}
              onBlur={field.onBlur}
            />
          )}
        />
      ),
    },
    {
      id: "commentRequired",
      label: t("reasons.form.commentRequired"),
      description: t("reasons.form.commentRequiredHint"),
      wide: true,
      render: ({ label, description, className }) => (
        <BooleanFormField
          control={control as never}
          name="commentRequired"
          label={label}
          description={description}
          className={className}
        />
      ),
    },
  ]
  return (
    <DictionaryFormDialog
      form={form}
      strings="reasons"
      entry={entry}
      items={items}
      onClose={onClose}
      finalFocus={finalFocus}
    />
  )
}
