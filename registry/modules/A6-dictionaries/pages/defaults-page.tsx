import { useAuthenticated, useCanAccess } from "ra-core"
import { useMemo } from "react"
import { toast } from "sonner"
import { z } from "zod"

import { FormField } from "@/components/erp/form"
import { PageSkeleton, PageState } from "@/components/erp/page-state"
import type { RecordFormItem } from "@/components/erp/record-form"
import { RecordFormPage } from "@/components/erp/record-form-page"
import { RecordPicker } from "@/components/erp/record-picker"
import { ListReportHeader } from "@/components/templates/list-report"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useCardRecord } from "@/hooks/use-card-record"
import { useCompanyId } from "@/hooks/use-company"
import { useHasPermission } from "@/hooks/use-me"
import { usePageHeading } from "@/hooks/use-page-heading"
import { useRecordForm } from "@/hooks/use-record-form"
import { errorStateKind } from "@/lib/api"

import {
  DEFAULTS_ID,
  DICTIONARY_DEFAULTS,
  dictionaryDefaultsSchema,
  PAYMENT_TERMS,
  TAXES,
  UNITS,
  type DictionaryDefaults,
} from "../contract"
import { useDictionariesModule } from "../module-context"
import { useDictionariesT } from "../use-dictionaries-t"

/**
 * «Типові значення» (PF11, ADR-0047): що підставляється в нові документи. Одне налаштування на компанію,
 * форма на сторінці з липкою панеллю збереження. Вибір — лише з активних значень; вимкнення значення
 * сервер сам прибирає звідси. Довідник, якого немає в проекті (`page: false`), поля тут не має. Без
 * `dictionary-defaults:update` — поля для читання.
 */
interface DefaultsValues {
  taxId: string | null
  unitId: string | null
  paymentTermId: string | null
}

const toValues = (record: DictionaryDefaults): DefaultsValues => ({
  taxId: record.taxId,
  unitId: record.unitId,
  paymentTermId: record.paymentTermId,
})

const ACTIVE_ONLY = { active: true }

const schema = z.object({
  taxId: z.string().nullable(),
  unitId: z.string().nullable(),
  paymentTermId: z.string().nullable(),
})

interface NamedRecord {
  id: string
  name: string
}

const optionLabel = (record: NamedRecord) => record.name

export function DefaultsPage() {
  const t = useDictionariesT()
  const { isPending } = useAuthenticated()
  const access = useCanAccess({
    resource: DICTIONARY_DEFAULTS,
    action: "read",
  })
  const heading = usePageHeading(t("defaults.title"))
  return (
    <div className="space-y-6">
      <ListReportHeader
        title={t("defaults.title")}
        description={t("defaults.lead")}
        headingRef={heading}
      />
      {isPending || access.isPending ? (
        <PageSkeleton rows={4} />
      ) : access.canAccess ? (
        <DefaultsCard />
      ) : (
        <PageState kind="forbidden" />
      )}
    </div>
  )
}

function DefaultsCard() {
  const companyId = useCompanyId()
  const { record, isPending, pageError, failure, retry } =
    useCardRecord<DictionaryDefaults>(DICTIONARY_DEFAULTS, DEFAULTS_ID)
  if (record)
    return (
      <div className="space-y-4">
        {/* Значення є з кешу, а перечитати не вдалося: незбережене лишається, стан — над формою. */}
        {failure ? (
          <PageState
            kind={errorStateKind(failure)}
            className="min-h-40"
            onRetry={retry}
          />
        ) : null}
        {/* Інша компанія — нова форма: незбережені правки не переходять до неї. */}
        <DefaultsForm key={companyId} record={record} />
      </div>
    )
  if (isPending && !pageError) return <PageSkeleton rows={4} />
  return <PageState kind={errorStateKind(pageError)} onRetry={retry} />
}

function DefaultsForm({ record }: { record: DictionaryDefaults }) {
  const t = useDictionariesT()
  const { extension } = useDictionariesModule()
  const canUpdate = useHasPermission(DICTIONARY_DEFAULTS, "update")
  const state = useRecordForm<DefaultsValues, DictionaryDefaults>({
    resource: DICTIONARY_DEFAULTS,
    record,
    // Вимкнення значення на іншій сторінці міняє цей запис, а він приходить із кешу раніше за свіжий.
    followRecord: true,
    schema,
    defaultValues: toValues(record),
    recordSchema: dictionaryDefaultsSchema,
    toPayload: (values, keys) =>
      Object.fromEntries(keys.map((key) => [key, values[key]])),
    toValues,
    onSaved: () => {
      toast.success(t("defaults.saved"))
    },
  })
  const { control } = state.form
  const pickers = useMemo(() => {
    const all = [
      {
        id: "taxId",
        resource: TAXES,
        label: t("defaults.tax"),
        hidden: extension.taxes?.page === false,
      },
      {
        id: "unitId",
        resource: UNITS,
        label: t("defaults.unit"),
        hidden: extension.units?.page === false,
      },
      {
        id: "paymentTermId",
        resource: PAYMENT_TERMS,
        label: t("defaults.paymentTerm"),
        hidden: extension.paymentTerms?.page === false,
      },
    ] as const
    return all.filter((picker) => !picker.hidden)
  }, [t, extension])
  const items: RecordFormItem[] = pickers.map(({ id, resource, label }) => ({
    id,
    label,
    description: t("defaults.hint"),
    render: (props) => (
      <FormField
        {...props}
        control={control}
        name={id}
        render={({ field, control: aria }) => (
          <RecordPicker<NamedRecord>
            {...aria}
            ref={field.ref}
            resource={resource}
            label={label}
            optionLabel={optionLabel}
            filter={ACTIVE_ONLY}
            placeholder={t("defaults.notSet")}
            clearable
            readOnly={!canUpdate}
            value={field.value}
            onValueChange={(value) => {
              field.onChange(value)
            }}
            onBlur={field.onBlur}
          />
        )}
      />
    ),
  }))
  return (
    <div className="space-y-4">
      {canUpdate ? null : (
        <Alert>
          <AlertDescription>{t("defaults.readOnly")}</AlertDescription>
        </Alert>
      )}
      <RecordFormPage state={state} items={items} readOnly={!canUpdate} />
    </div>
  )
}
