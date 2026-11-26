import { useCallback, useMemo, useState } from "react"
import { CheckIcon } from "lucide-react"

import { PageState } from "@/registry/erp/page-state"
import { PhotoGallery } from "@/registry/erp/photo-gallery"
import {
  ProductCard,
  ProductGrid,
  ProductVariants,
  type VariantColumn,
} from "@/registry/erp/product-grid"
import { useFormat } from "@/registry/lib/format"
import { Badge } from "@/registry/ui/badge"
import { Button } from "@/registry/ui/button"
import { Checkbox } from "@/registry/ui/checkbox"
import { Label } from "@/registry/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/registry/ui/select"
import { useDemoTranslation } from "@/i18n"
import { ukPhotosPage } from "@/i18n/pages"

import {
  demoProducts,
  SAMPLE_COUNT,
  type DemoProduct,
  type DemoVariant,
} from "./photos-model"
import { Section } from "./Section"

const COUNTS = [SAMPLE_COUNT, 100] as const
const keyOf = (product: DemoProduct) => product.id

/** Місце в результатах у куті фото: число на екрані, підпис для скрінрідера. */
export function RankBadge({ rank }: { rank: number }) {
  const { t } = useDemoTranslation([ukPhotosPage], {
    keyPrefix: "photosPage.grid",
  })
  return (
    <span className="inline-block min-w-6 rounded-md bg-foreground/80 px-1.5 text-center text-xs leading-5 text-background">
      <span className="sr-only">{t("rank")}: </span>
      {rank}
    </span>
  )
}

function useVariantColumns(): VariantColumn<DemoVariant>[] {
  const { t } = useDemoTranslation([ukPhotosPage], {
    keyPrefix: "photosPage.grid.columns",
  })
  const format = useFormat()
  return useMemo(
    () => [
      { id: "sku", header: t("sku"), value: (row) => row.sku, keep: true },
      { id: "color", header: t("color"), value: (row) => row.color },
      { id: "size", header: t("size"), value: (row) => row.size },
      {
        id: "stock",
        header: t("stock"),
        value: (row) => (row.stock === null ? null : format.number(row.stock)),
        numeric: true,
      },
      { id: "arrival", header: t("arrival"), value: (row) => row.arrival },
      {
        id: "price",
        header: t("price"),
        value: (row) =>
          row.price === null ? null : format.price(String(row.price), "UAH"),
        numeric: true,
      },
    ],
    [t, format],
  )
}

/** Картка товару демо: оцінка й прив'язка — свій стан картки. */
function DemoCard({ product, rank }: { product: DemoProduct; rank: number }) {
  const { t } = useDemoTranslation([ukPhotosPage], {
    keyPrefix: "photosPage.grid",
  })
  const format = useFormat()
  const columns = useVariantColumns()
  const [grade, setGrade] = useState<"similar" | "notSimilar" | null>(null)
  const [linked, setLinked] = useState(false)
  const price = (value: number) => format.price(String(value), "UAH")
  return (
    <ProductCard
      photo={
        <PhotoGallery
          photos={product.photos}
          name={product.name}
          badge={<RankBadge rank={rank} />}
        />
      }
      eyebrow={`${product.supplier} · ${product.code}`}
      title={product.name}
      description={
        <>
          <p>{product.category}</p>
          <p>
            {product.stock === null
              ? t("noStock")
              : t("stock", { value: format.number(product.stock) })}
          </p>
        </>
      }
      prices={
        product.priceFrom === null || product.priceTo === null
          ? t("noPrice")
          : product.priceFrom === product.priceTo
            ? price(product.priceFrom)
            : t("price", {
                from: price(product.priceFrom),
                to: price(product.priceTo),
              })
      }
      badges={
        product.offers.length
          ? product.offers.map((offer) => (
              <Badge key={offer} variant="secondary">
                {t(`offers.${offer}`)}
              </Badge>
            ))
          : null
      }
      variants={
        <ProductVariants
          summary={t("variants", { count: product.variants.length })}
          label={t("variantsLabel", { name: product.name })}
          columns={columns}
          rows={product.variants}
          getRowId={(row) => row.sku}
        />
      }
      actions={
        <>
          <div
            role="group"
            aria-label={t("grade", { name: product.name })}
            className="flex gap-1"
          >
            {(["similar", "notSimilar"] as const).map((value) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={grade === value ? "default" : "outline"}
                aria-pressed={grade === value}
                onClick={() => {
                  setGrade(grade === value ? null : value)
                }}
              >
                {t(value)}
              </Button>
            ))}
          </div>
          <Button
            type="button"
            size="sm"
            variant={linked ? "secondary" : "ghost"}
            // Стала назва: стан каже aria-pressed, інакше скрінрідер чує «Прив'язано, натиснуто».
            aria-pressed={linked}
            onClick={() => {
              setLinked(!linked)
            }}
          >
            {linked ? <CheckIcon aria-hidden /> : null}
            {t("link")}
          </Button>
        </>
      }
    />
  )
}

/** Сітка: кількість карток, перше завантаження, порожній результат. */
export function PhotosGridSection() {
  const { t } = useDemoTranslation([ukPhotosPage], {
    keyPrefix: "photosPage.grid",
  })
  const [count, setCount] = useState<number>(SAMPLE_COUNT)
  const [isLoading, setIsLoading] = useState(false)
  const [isEmpty, setIsEmpty] = useState(false)
  const products = useMemo(() => demoProducts(count), [count])
  const renderItem = useCallback(
    (product: DemoProduct, index: number) => (
      <DemoCard product={product} rank={index + 1} />
    ),
    [],
  )
  return (
    <Section title={t("title")} description={t("description")}>
      <div className="flex flex-wrap items-center gap-4">
        <Select
          value={count}
          items={COUNTS.map((value) => ({ value, label: String(value) }))}
          onValueChange={(value) => {
            if (typeof value === "number") setCount(value)
          }}
        >
          <SelectTrigger aria-label={t("count")} className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {COUNTS.map((value) => (
              <SelectItem key={value} value={value}>
                {value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Label>
          <Checkbox checked={isLoading} onCheckedChange={setIsLoading} />
          {t("loading")}
        </Label>
        <Label>
          <Checkbox checked={isEmpty} onCheckedChange={setIsEmpty} />
          {t("empty")}
        </Label>
      </div>
      {isEmpty && !isLoading ? (
        <PageState
          kind="empty"
          compact
          title={t("emptyTitle")}
          description={t("emptyText")}
        />
      ) : (
        <ProductGrid
          items={products}
          getKey={keyOf}
          renderItem={renderItem}
          label={t("label")}
          loading={isLoading}
        />
      )}
    </Section>
  )
}
