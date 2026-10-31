import { useMemo } from "react"
import { z } from "zod"

import { FormField } from "@/components/erp/form"
import { FormSelect } from "@/components/erp/form-select"
import type { RecordFormItem } from "@/components/erp/record-form"
import type { StatusTone } from "@/lib/statuses"

import { TAG_TONES, TAGS, tagSchemaFor, type Tag } from "../contract"
import type { TagFormFieldId } from "../extension"
import { useDictionariesModule } from "../module-context"
import { useDictionariesT } from "../use-dictionaries-t"
import {
  DictionaryFormDialog,
  useDictionaryForm,
  useEntryShape,
  useNameItem,
} from "./dictionary-form"
import type { DictionaryFormProps } from "./dictionary-page"

/** Тег у діалозі (ADR-0047): назва й колір із токенів теми (SPEC §6.3), а не довільний. */
interface TagFormValues {
  name: string
  tone: StatusTone
  [extensionField: string]: unknown
}

const EMPTY: TagFormValues = { name: "", tone: "neutral" }

const fromEntry = (tag: Tag): TagFormValues => ({
  name: tag.name,
  tone: tag.tone,
})

export function TagFormDialog({
  entry,
  onClose,
  finalFocus,
}: DictionaryFormProps<Tag>) {
  const t = useDictionariesT()
  const { extension } = useDictionariesModule()
  const { name } = useEntryShape()
  const shape = useMemo(() => ({ name, tone: z.enum(TAG_TONES) }), [name])
  const recordSchema = useMemo(
    () => tagSchemaFor(extension.tags),
    [extension.tags],
  )
  const form = useDictionaryForm<TagFormValues, Tag, TagFormFieldId>({
    resource: TAGS,
    strings: "tags",
    entry,
    extension: extension.tags,
    recordSchema,
    shape,
    empty: EMPTY,
    fromEntry,
    onClose,
  })
  const { control } = form.state.form
  const tones = TAG_TONES.map((tone) => ({
    value: tone,
    label: t(`tags.tones.${tone}`),
  }))
  const items: (RecordFormItem & { id: TagFormFieldId })[] = [
    useNameItem(control),
    {
      id: "tone",
      label: t("tags.form.tone"),
      wide: true,
      text: (value) => t(`tags.tones.${value as StatusTone}`),
      render: (props) => (
        <FormField
          {...props}
          control={control}
          name="tone"
          render={({ field, control: aria }) => (
            <FormSelect
              {...aria}
              ref={field.ref}
              items={tones}
              value={field.value}
              onValueChange={field.onChange}
              onBlur={field.onBlur}
            />
          )}
        />
      ),
    },
  ]
  return (
    <DictionaryFormDialog
      form={form}
      strings="tags"
      entry={entry}
      items={items}
      onClose={onClose}
      finalFocus={finalFocus}
    />
  )
}
