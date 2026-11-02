import { zodResolver } from "@hookform/resolvers/zod"
import { useEffect } from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"

import { DocumentLinesEditor } from "@/registry/erp/document-lines-editor"
import {
  useDocumentLinesSchema,
  type DocumentLinesValues,
} from "@/registry/erp/document-lines-schema"
import type {
  DocumentLine,
  DocumentLineTax,
  SavedDocumentTotals,
} from "@/registry/lib/document-lines"
import { computeDocumentTotals } from "@/registry/lib/document-totals"
import { currencyDigits } from "@/registry/lib/format"

import { Section } from "./Section"

/**
 * Варіанти редактора без запитів: довідники — сталі варіанти, без вибору товару. Завантаження й помилку
 * довідників показує редактор вище зі сценаріями моків.
 */

const VAT_20: DocumentLineTax = {
  id: "vat-20",
  name: "ПДВ 20%",
  rate: 20,
  included: false,
}
const TAXES: readonly DocumentLineTax[] = [
  VAT_20,
  { id: "vat-7", name: "ПДВ 7%", rate: 7, included: false },
]
const UNITS = [
  { id: "pcs", name: "шт" },
  { id: "h", name: "год" },
] as const

const LINE: Omit<DocumentLine, "id" | "name"> = {
  itemId: null,
  quantity: "1",
  unit: UNITS[0],
  price: "100",
  discountPercent: 0,
  discountAmount: 0,
  tax: VAT_20,
}

const NO_DISCOUNT = { discountPercent: 0, discountAmount: 0 }

interface Variant {
  readonly id: "empty" | "errors" | "outOfRange" | "saved"
  readonly currency: string
  readonly values: DocumentLinesValues
  readonly readOnly?: boolean
  /** Показати помилки одразу, як після спроби зберегти. */
  readonly validate?: boolean
  readonly narrow?: boolean
}

function useVariants(): readonly Variant[] {
  const { t } = useTranslation("demo", { keyPrefix: "documentLinesPage" })
  return [
    {
      id: "empty",
      currency: "UAH",
      values: { lines: [], ...NO_DISCOUNT },
      narrow: true,
    },
    {
      id: "errors",
      currency: "UAH",
      validate: true,
      values: {
        lines: [
          { ...LINE, id: "errors-1", name: "", quantity: "0" },
          {
            ...LINE,
            id: "errors-2",
            name: t("sample.service"),
            discountAmount: 15_000,
          },
        ],
        discountPercent: 0,
        discountAmount: 50_000,
      },
    },
    {
      id: "outOfRange",
      currency: "UAH",
      validate: true,
      narrow: true,
      values: {
        lines: [
          {
            ...LINE,
            id: "range-1",
            name: t("sample.product"),
            quantity: "2",
            price: "90000000000000",
          },
        ],
        ...NO_DISCOUNT,
      },
    },
    {
      id: "saved",
      currency: "USD",
      readOnly: true,
      values: {
        lines: [
          {
            ...LINE,
            id: "saved-1",
            name: t("sample.product"),
            quantity: "3",
            price: "120",
            // Знімок ставки «у ціні», якої в довіднику вже немає: рядок показує її під своєю назвою.
            tax: { id: "vat-20-in", name: "ПДВ 20%", rate: 20, included: true },
          },
          {
            ...LINE,
            id: "saved-2",
            name: t("sample.service"),
            quantity: "2.5",
            unit: UNITS[1],
            price: "80",
            discountPercent: 5,
          },
        ],
        discountPercent: 10,
        discountAmount: 0,
      },
    },
  ]
}

/** Підсумки «сервера» збереженого документа: у демо їх рахує та сама функція. */
function savedTotalsOf({ currency, values }: Variant): SavedDocumentTotals {
  const totals = computeDocumentTotals(
    values.lines,
    currencyDigits(currency),
    values,
  )
  if (!totals) throw new Error("Варіант демо за межею суми")
  return totals
}

function VariantForm({ variant }: { variant: Variant }) {
  const schema = useDocumentLinesSchema(variant.currency)
  const form = useForm<DocumentLinesValues>({
    mode: "onTouched",
    resolver: zodResolver(schema),
    defaultValues: variant.values,
  })
  const { trigger } = form
  useEffect(() => {
    if (variant.validate) void trigger()
  }, [variant.validate, trigger])
  return (
    <form noValidate onSubmit={(event) => event.preventDefault()}>
      <DocumentLinesEditor
        form={form}
        currency={variant.currency}
        units={UNITS}
        taxes={TAXES}
        readOnly={variant.readOnly}
        savedTotals={variant.readOnly ? savedTotalsOf(variant) : undefined}
      />
    </form>
  )
}

export function DocumentLinesVariants() {
  const { t } = useTranslation("demo", { keyPrefix: "documentLinesPage" })
  const variants = useVariants()
  return (
    <Section title={t("variantsTitle")} description={t("variantsDescription")}>
      <div className="grid gap-6">
        {variants.map((variant) => (
          <figure
            key={variant.id}
            data-testid={`variant-${variant.id}`}
            className="space-y-3 rounded-lg border p-3"
          >
            <figcaption className="text-sm font-medium">
              {t(`variants.${variant.id}`)}
            </figcaption>
            <div className={variant.narrow ? "max-w-sm" : undefined}>
              <VariantForm variant={variant} />
            </div>
          </figure>
        ))}
      </div>
    </Section>
  )
}
