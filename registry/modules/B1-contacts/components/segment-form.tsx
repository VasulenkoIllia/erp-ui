import { useMemo, type RefObject } from "react"
import { toast } from "sonner"
import { z } from "zod"

import { FormField } from "@/components/erp/form"
import {
  RecordFormDialog,
  type RecordFormItem,
} from "@/components/erp/record-form"
import { Input } from "@/components/ui/input"
import { useRecordForm } from "@/hooks/use-record-form"
import { useErpUiT } from "@/lib/i18n"

import { SEGMENTS, segmentSchema, type Segment } from "../contract"
import { useContactsT } from "../use-contacts-t"

/**
 * Форма сегмента в діалозі (ADR-0026, ADR-0027): створення й зміна назви в довіднику сегментів.
 * Назва обов'язкова й не повторюється в компанії: таку саму сервер не приймає (422 `duplicate`),
 * помилка — біля поля.
 */

/** Довжина назви сегмента: мітка в списках і чип у фільтрі. */
const SEGMENT_NAME_MAX = 60

type SegmentFormValues = { name: string }

const toValues = (segment: Segment): SegmentFormValues => ({
  name: segment.name,
})

export interface SegmentFormDialogProps {
  /** Сегмент для зміни; без нього — створення. */
  readonly segment?: Segment
  readonly onClose: () => void
  readonly onSaved: (segment: Segment) => void
  /** Куди повернути фокус після закриття: «Створити сегмент» чи назва в списку. */
  readonly finalFocus?: RefObject<HTMLElement | null>
}

/** Діалог змонтований, лише поки відкритий: `{editing ? <SegmentFormDialog … /> : null}`. */
export function SegmentFormDialog({
  segment,
  onClose,
  onSaved,
  finalFocus,
}: SegmentFormDialogProps) {
  const t = useContactsT()
  const kitT = useErpUiT()
  const schema = useMemo(
    () =>
      z.object({
        name: z
          .string()
          .trim()
          .min(1, kitT("validation.required"))
          .max(
            SEGMENT_NAME_MAX,
            t("segments.form.tooLong", { max: SEGMENT_NAME_MAX }),
          ),
      }),
    [kitT, t],
  )
  const state = useRecordForm<SegmentFormValues, Segment>({
    resource: SEGMENTS,
    record: segment,
    schema,
    defaultValues: segment ? toValues(segment) : { name: "" },
    recordSchema: segmentSchema,
    toPayload: (values, keys) => (keys.includes("name") ? values : {}),
    toValues,
    onSaved: (saved) => {
      toast.success(
        t(segment ? "segments.form.saved" : "segments.form.created", {
          name: saved.name,
        }),
      )
      onSaved(saved)
    },
    onUnchanged: onClose,
  })
  const items: RecordFormItem[] = [
    {
      id: "name",
      label: t("segments.form.fields.name"),
      wide: true,
      render: (props) => (
        <FormField
          {...props}
          control={state.form.control}
          name="name"
          render={({ field, control: aria }) => (
            <Input {...field} {...aria} autoComplete="off" />
          )}
        />
      ),
    },
  ]
  return (
    <RecordFormDialog
      onClose={onClose}
      title={t(
        segment ? "segments.form.editTitle" : "segments.form.createTitle",
      )}
      description={segment?.name}
      submitLabel={kitT(segment ? "recordForm.save" : "recordForm.create")}
      state={state}
      items={items}
      finalFocus={finalFocus}
    />
  )
}
