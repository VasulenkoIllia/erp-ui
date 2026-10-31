import { useGetList } from "ra-core"
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { ExportDialog } from "@/registry/erp/export-dialog"
import { FileDrop } from "@/registry/erp/file-drop"
import { ImportWizard } from "@/registry/erp/import-wizard"
import { useFormat } from "@/registry/lib/format"
import type { ExportColumn } from "@/registry/lib/exports"
import type { ImportTarget } from "@/registry/lib/import-rows"
import { Button } from "@/registry/ui/button"

import { PRODUCT_CATEGORIES, type Product } from "@/data/products"
import ukMessages from "@/i18n/uk.json"

import { PageHeader } from "./PageHeader"
import { Section } from "./Section"

const PRODUCTS = "products"
const SAMPLE_FILE = new File(["sku;name"], "товари.csv", { type: "text/csv" })
const SELECTED_IDS = ["product-1", "product-2"]

type ProductField = keyof typeof ukMessages.importExportPage.fields

/** Цілі імпорту й експорту на одних товарах: кожен тип поля, збіг за артикулом. */
function useProductDefinitions() {
  const { t } = useTranslation()
  return useMemo(() => {
    const label = (key: ProductField) => t(`importExportPage.fields.${key}`)
    const categories = PRODUCT_CATEGORIES.map((value) => ({
      value,
      label: t(`importExportPage.categories.${value}`),
    }))
    const target: ImportTarget = {
      resource: PRODUCTS,
      label: t("importExportPage.products"),
      matchField: "sku",
      fields: [
        {
          key: "sku",
          label: label("sku"),
          required: true,
          aliases: ["код", "code"],
          example: t("importExportPage.examples.sku"),
        },
        {
          key: "name",
          label: label("name"),
          required: true,
          example: t("importExportPage.examples.name"),
        },
        {
          key: "price",
          label: label("price"),
          required: true,
          type: "number",
          example: 1250.5,
        },
        { key: "stock", label: label("stock"), type: "integer", example: 10 },
        {
          key: "category",
          label: label("category"),
          type: "enum",
          options: categories,
          example: categories[0]?.label,
        },
        {
          key: "active",
          label: label("active"),
          type: "boolean",
          example: true,
        },
        {
          key: "released",
          label: label("released"),
          type: "date",
          example: "2026-10-31",
        },
      ],
    }
    const columns: ExportColumn<Product>[] = [
      { id: "sku", label: label("sku"), value: (row) => row.sku },
      { id: "name", label: label("name"), value: (row) => row.name },
      { id: "price", label: label("price"), value: (row) => row.price },
      {
        id: "stock",
        label: label("stock"),
        value: (row) => row.stock ?? null,
      },
      {
        id: "category",
        label: label("category"),
        value: (row) =>
          categories.find((item) => item.value === row.category)?.label ?? null,
      },
      {
        id: "active",
        label: label("active"),
        value: (row) => row.active ?? null,
        optional: true,
      },
      {
        id: "released",
        label: label("released"),
        value: (row) => (row.released ? new Date(row.released) : null),
        optional: true,
      },
    ]
    return { target, columns }
  }, [t])
}

/** PF07 і вибір файла UI11 (ADR-0049): стани поля, діалог експорту, майстер імпорту. */
export function ImportExportPage() {
  const { t } = useTranslation()
  const format = useFormat()
  const { target, columns } = useProductDefinitions()
  const [run, setRun] = useState(0)
  const [exporting, setExporting] = useState<"all" | "selected" | null>(null)
  const { total } = useGetList(PRODUCTS, {
    pagination: { page: 1, perPage: 1 },
  })
  return (
    <div className="space-y-6">
      <PageHeader
        title={t("importExportPage.title")}
        lead={t("importExportPage.description")}
      />
      <Section
        title={t("importExportPage.fileTitle")}
        description={t("importExportPage.fileDescription")}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <FileDrop
            label={t("importExportPage.fileEmpty")}
            file={null}
            onFileChange={() => undefined}
          />
          <FileDrop
            label={t("importExportPage.fileChosen")}
            file={SAMPLE_FILE}
            onFileChange={() => undefined}
          />
          <FileDrop
            label={t("importExportPage.fileError")}
            file={null}
            error={t("importExportPage.fileErrorText")}
            onFileChange={() => undefined}
          />
          <FileDrop
            label={t("importExportPage.fileDisabled")}
            file={null}
            disabled
            onFileChange={() => undefined}
          />
        </div>
      </Section>
      <Section
        title={t("importExportPage.exportTitle")}
        description={t("importExportPage.exportDescription")}
      >
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setExporting("all")
            }}
          >
            {t("importExportPage.exportAll")}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setExporting("selected")
            }}
          >
            {t("importExportPage.exportSelected")}
          </Button>
        </div>
        {exporting ? (
          <ExportDialog<Product>
            open
            onOpenChange={() => {
              setExporting(null)
            }}
            resource={PRODUCTS}
            title={target.label}
            fileName={PRODUCTS}
            columns={columns}
            selectedIds={exporting === "selected" ? SELECTED_IDS : undefined}
          />
        ) : null}
      </Section>
      <Section
        title={t("importExportPage.importTitle")}
        description={t("importExportPage.importDescription")}
      >
        <p className="mb-4 text-sm text-muted-foreground" data-testid="count">
          {t("importExportPage.count", { count: format.number(total ?? 0) })}
        </p>
        <ImportWizard
          key={run}
          target={target}
          onDone={() => {
            toast.success(t("importExportPage.imported"))
            setRun((current) => current + 1)
          }}
        />
      </Section>
    </div>
  )
}
