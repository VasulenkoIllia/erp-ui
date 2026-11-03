import { zodResolver } from "@hookform/resolvers/zod"
import { useAuthenticated, useGetList, useGetOne } from "ra-core"
import { useId, useMemo, useState } from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import type { DocumentLineItem } from "@/registry/erp/document-line-fields"
import { DocumentLinesEditor } from "@/registry/erp/document-lines-editor"
import {
  useDocumentLinesSchema,
  type DocumentLinesValues,
} from "@/registry/erp/document-lines-schema"
import { FormErrorSummary, UnsavedChangesGuard } from "@/registry/erp/form"
import { PageState, SectionSkeleton } from "@/registry/erp/page-state"
import { SaveBar } from "@/registry/erp/save-bar"
import { useCompanyId } from "@/registry/hooks/use-company"
import { errorStateKind } from "@/registry/lib/api"
import { companyScope } from "@/registry/lib/company-scope"
import type {
  DocumentLineTax,
  DocumentLineUnit,
} from "@/registry/lib/document-lines"
import { useErpUiT } from "@/registry/lib/i18n"
import type {
  DictionaryDefaults,
  Tax,
  Unit,
} from "@/registry/modules/A6-dictionaries/contract"
import { Checkbox } from "@/registry/ui/checkbox"
import { Field, FieldLabel } from "@/registry/ui/field"

import type { Product } from "@/data/products"

import { DocumentLinesVariants } from "./document-lines-variants"
import { PageHeader } from "./PageHeader"
import { Section } from "./Section"

const CURRENCY = "UAH"
const SAVE_DELAY_MS = 600
const DICTIONARY_SIZE = 100
const PRODUCTS = "products"

const usePageT = () =>
  useTranslation("demo", { keyPrefix: "documentLinesPage" }).t

const wait = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

interface DemoDictionaries {
  readonly units: readonly (DocumentLineUnit & { id: string })[]
  readonly taxes: readonly DocumentLineTax[]
  readonly defaults: DictionaryDefaults | undefined
}

/** Активні одиниці й ставки довідників A6 і типові значення компанії: те, що бере модуль документа. */
function useDictionaries() {
  const companyId = useCompanyId()
  const meta = companyScope(companyId)
  const list = {
    filter: { active: true },
    pagination: { page: 1, perPage: DICTIONARY_SIZE },
    sort: { field: "name", order: "ASC" as const },
    meta,
  }
  const units = useGetList<Unit>("units", list)
  const taxes = useGetList<Tax>("taxes", list)
  const defaults = useGetOne<DictionaryDefaults>("dictionary-defaults", {
    id: "current",
    meta,
  })
  const queries = [units, taxes, defaults]
  const data = useMemo<DemoDictionaries>(
    () => ({
      units: (units.data ?? []).map((unit) => ({
        id: unit.id,
        name: unit.shortName,
      })),
      taxes: (taxes.data ?? []).map(({ id, name, rate, included }) => ({
        id,
        name,
        rate,
        included,
      })),
      defaults: defaults.data,
    }),
    [units.data, taxes.data, defaults.data],
  )
  return {
    data,
    isPending: queries.some((query) => query.isPending),
    error: queries.find((query) => query.error)?.error ?? null,
    retry: () => {
      for (const query of queries) void query.refetch()
    },
  }
}

interface SampleNames {
  readonly product: string
  readonly service: string
  readonly delivery: string
}

/** Рядки на старті: товар із довідника, послуга годинами зі знижкою й рядок вільним текстом. */
function sampleValues(
  dictionaries: DemoDictionaries,
  names: SampleNames,
): DocumentLinesValues {
  const unit = (name: string) =>
    dictionaries.units.find((option) => option.name === name) ?? null
  const vat = dictionaries.taxes.find((tax) => tax.rate === 20) ?? null
  const line = {
    kind: "item" as const,
    itemId: null,
    unit: null,
    discountPercent: 0,
    discountAmount: 0,
    tax: vat,
  }
  return {
    lines: [
      {
        ...line,
        id: "sample-1",
        name: names.product,
        itemId: "product-1",
        quantity: "2",
        unit: unit("шт"),
        price: "4200",
      },
      {
        ...line,
        id: "sample-2",
        name: names.service,
        quantity: "1.5",
        unit: unit("год"),
        price: "900",
        discountPercent: 10,
      },
      {
        ...line,
        id: "sample-3",
        name: names.delivery,
        quantity: "1",
        price: "150",
        discountAmount: 5_000,
        tax: null,
      },
    ],
    discountPercent: 0,
    discountAmount: 0,
  }
}

function LinesForm({
  dictionaries,
  readOnly,
}: {
  dictionaries: DemoDictionaries
  readOnly: boolean
}) {
  const t = usePageT()
  const kitT = useErpUiT()
  const schema = useDocumentLinesSchema(CURRENCY)
  const form = useForm<DocumentLinesValues>({
    mode: "onTouched",
    shouldFocusError: false,
    resolver: zodResolver(schema),
    defaultValues: sampleValues(dictionaries, {
      product: t("sample.product"),
      service: t("sample.service"),
      delivery: t("sample.delivery"),
    }),
  })
  const { isDirty, isSubmitting, errors, submitCount } = form.formState
  const { units, taxes, defaults } = dictionaries
  const item = useMemo<DocumentLineItem<Product>>(
    () => ({
      resource: PRODUCTS,
      optionLabel: (product) => product.name,
      optionDescription: (product) => product.sku,
      filter: { active: true },
      toLine: (product) => ({
        name: product.name,
        price: String(product.price),
        unit:
          units.find(
            (unit) =>
              unit.name === (product.category === "service" ? "год" : "шт"),
          ) ?? null,
      }),
    }),
    [units],
  )
  const save = form.handleSubmit(async (values) => {
    if (!isDirty) {
      toast.info(kitT("forms.noChanges"))
      return
    }
    await wait(SAVE_DELAY_MS)
    form.reset(values)
    toast.success(t("saved"))
  })
  return (
    <form
      noValidate
      data-testid="lines-form"
      className="grid gap-6"
      onSubmit={(event) => void save(event)}
    >
      <UnsavedChangesGuard when={isDirty} />
      <FormErrorSummary
        errors={errors}
        labels={{
          lines: kitT("documentLines.label"),
          discountPercent: kitT("documentLines.totals.documentDiscount"),
          discountAmount: kitT("documentLines.totals.documentDiscount"),
        }}
        submitCount={submitCount}
      />
      <DocumentLinesEditor
        form={form}
        currency={CURRENCY}
        units={units}
        taxes={taxes}
        item={item}
        newLine={() => ({
          tax: taxes.find((tax) => tax.id === defaults?.taxId) ?? null,
          unit: units.find((unit) => unit.id === defaults?.unitId) ?? null,
        })}
        readOnly={readOnly}
      />
      {readOnly ? null : (
        <SaveBar
          isDirty={isDirty}
          isSaving={isSubmitting}
          onDiscard={() => {
            form.reset()
          }}
        />
      )}
    </form>
  )
}

function Editor({ readOnly }: { readOnly: boolean }) {
  const { data, isPending, error, retry } = useDictionaries()
  if (isPending) return <SectionSkeleton />
  if (error)
    return (
      <PageState
        kind={errorStateKind(error)}
        headingLevel={3}
        onRetry={retry}
      />
    )
  // Новий режим — нова форма: рядки перемальовуються разом із кнопками.
  return (
    <LinesForm key={String(readOnly)} dictionaries={data} readOnly={readOnly} />
  )
}

function EditorSection() {
  const t = usePageT()
  const id = useId()
  const [readOnly, setReadOnly] = useState(false)
  // Довідники — після входу: без сесії запити лише дали б 401.
  const { isPending } = useAuthenticated()
  return (
    <Section title={t("editorTitle")} description={t("editorDescription")}>
      <Field orientation="horizontal">
        <Checkbox
          aria-labelledby={id}
          checked={readOnly}
          onCheckedChange={setReadOnly}
        />
        <FieldLabel id={id} className="font-normal">
          {t("readOnly")}
        </FieldLabel>
      </Field>
      {isPending ? <SectionSkeleton /> : <Editor readOnly={readOnly} />}
    </Section>
  )
}

/** Рядки документа (UI05a, ADR-0059): редактор на моках товарів і довідників A6, варіанти станів. */
export function DocumentLinesPage() {
  const { t } = useTranslation()
  return (
    <div className="space-y-6">
      <PageHeader
        title={t("app.pages.documentLines")}
        lead={t("documentLinesPage.lead")}
      />
      <EditorSection />
      <DocumentLinesVariants />
    </div>
  )
}
