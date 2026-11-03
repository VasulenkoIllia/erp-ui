import { zodResolver } from "@hookform/resolvers/zod"
import { useId, useMemo, useState } from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { useSearchParams } from "react-router"
import { toast } from "sonner"

import type { DocumentLineItem } from "@/registry/erp/document-line-fields"
import { DocumentLinesEditor } from "@/registry/erp/document-lines-editor"
import {
  useDocumentLinesSchema,
  type DocumentLinesValues,
} from "@/registry/erp/document-lines-schema"
import { FormErrorSummary, UnsavedChangesGuard } from "@/registry/erp/form"
import { SaveBar } from "@/registry/erp/save-bar"
import { useErpUiT } from "@/registry/lib/i18n"
import { Checkbox } from "@/registry/ui/checkbox"
import { Field, FieldLabel } from "@/registry/ui/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/registry/ui/select"

import type { Product } from "@/data/products"

import {
  DOCUMENT_SIZES,
  DOCUMENT_TAXES,
  DOCUMENT_UNITS,
  documentLines,
  documentSizeOf,
  type DocumentSize,
} from "./document-form-model"
import { PageHeader } from "./PageHeader"
import { Section } from "./Section"

const CURRENCY = "UAH"
const SAVE_DELAY_MS = 600
const DEFAULT_SIZE: DocumentSize = 500
const SIZE_PARAM = "lines"

const usePageT = () =>
  useTranslation("demo", { keyPrefix: "documentFormPage" }).t

const wait = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

/** Новий рядок: ПДВ 20 % і штуки, як типові значення довідників компанії. */
const newLine = () => ({
  tax: DOCUMENT_TAXES.find((tax) => tax.rate === 20) ?? null,
  unit: DOCUMENT_UNITS.find((unit) => unit.id === "pcs") ?? null,
})

function DocumentForm({
  size,
  readOnly,
}: {
  size: DocumentSize
  readOnly: boolean
}) {
  const t = usePageT()
  const kitT = useErpUiT()
  const schema = useDocumentLinesSchema(CURRENCY)
  const form = useForm<DocumentLinesValues>({
    mode: "onTouched",
    shouldFocusError: false,
    resolver: zodResolver(schema),
    defaultValues: {
      lines: documentLines(size, {
        section: (index) => t("section", { index }),
        note: t("note"),
      }),
      discountPercent: 0,
      discountAmount: 0,
    },
  })
  const { isDirty, isSubmitting, errors, submitCount } = form.formState
  const item = useMemo<DocumentLineItem<Product>>(
    () => ({
      resource: "products",
      optionLabel: (product) => product.name,
      optionDescription: (product) => product.sku,
      filter: { active: true },
      toLine: (product) => ({
        name: product.name,
        price: String(product.price),
      }),
    }),
    [],
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
      data-testid="document-form"
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
        units={DOCUMENT_UNITS}
        taxes={DOCUMENT_TAXES}
        item={item}
        newLine={newLine}
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

/** Розмір документа й режим: нова форма на кожну зміну, як відкрити інший документ. */
function Options({
  size,
  readOnly,
  onSize,
  onReadOnly,
}: {
  size: DocumentSize
  readOnly: boolean
  onSize: (size: DocumentSize) => void
  onReadOnly: (readOnly: boolean) => void
}) {
  const t = usePageT()
  const sizeId = useId()
  const readOnlyId = useId()
  const items = DOCUMENT_SIZES.map((value) => ({
    value,
    label: t("size", { count: value }),
  }))
  return (
    <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
      <Field className="w-56">
        <FieldLabel htmlFor={sizeId}>{t("sizeLabel")}</FieldLabel>
        <Select
          items={items}
          value={size}
          onValueChange={(value: DocumentSize | null) => {
            if (value) onSize(value)
          }}
        >
          <SelectTrigger id={sizeId} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {items.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field orientation="horizontal" className="w-auto">
        <Checkbox
          aria-labelledby={readOnlyId}
          checked={readOnly}
          onCheckedChange={onReadOnly}
        />
        <FieldLabel id={readOnlyId} className="font-normal">
          {t("readOnly")}
        </FieldLabel>
      </Field>
    </div>
  )
}

/**
 * Великий документ (UI05b, ADR-0060): форма на всю сторінку з `erp/save-bar`, розділи й нотатки, від
 * 100 рядків лише видимі рядки. Перевірка `pnpm perf` міряє тут відгук на введення, вставку й порядок.
 */
export function DocumentFormPage() {
  const { t } = useTranslation()
  const pageT = usePageT()
  const [searchParams, setSearchParams] = useSearchParams()
  const size = documentSizeOf(searchParams.get(SIZE_PARAM)) ?? DEFAULT_SIZE
  const [readOnly, setReadOnly] = useState(false)
  return (
    <div className="space-y-6">
      <PageHeader title={t("app.pages.documentForm")} lead={pageT("lead")} />
      <Section title={pageT("optionsTitle")}>
        <Options
          size={size}
          readOnly={readOnly}
          onSize={(next) => {
            setSearchParams({ [SIZE_PARAM]: String(next) })
          }}
          onReadOnly={setReadOnly}
        />
      </Section>
      <DocumentForm
        key={`${String(size)}-${String(readOnly)}`}
        size={size}
        readOnly={readOnly}
      />
    </div>
  )
}
