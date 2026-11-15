import { useAuthenticated, useGetList } from "@/registry/lib/ra-core"
import { z } from "zod"

import { DocumentDeleteAction } from "@/registry/erp/document-delete-action"
import {
  PageSkeleton,
  PageState,
  SectionSkeleton,
} from "@/registry/erp/page-state"
import { TrashView } from "@/registry/erp/trash-view"
import { useCompanyId } from "@/registry/hooks/use-company"
import { errorStateKind } from "@/registry/lib/api"
import { companyScope } from "@/registry/lib/company-scope"
import { useErpUiT } from "@/registry/lib/i18n"
import { ukTrash } from "@/registry/lib/i18n-uk-trash"

import type { Product } from "@/data/products"
import { useDemoTranslation } from "@/i18n"
import { ukTrashPage } from "@/i18n/pages"
import { NO_TRASH_RESOURCE, TRASH_CARD_SKU } from "@/mocks/resources"
import { ROUTES } from "@/router"

import { PageHeader } from "./PageHeader"
import { Section } from "./Section"

const PRODUCTS = "products"

/** Що кошик бере з рядка товару: назва й артикул. */
const productRowSchema = z.object({ name: z.string(), sku: z.string() })

/**
 * Кошик (PF16, ADR-0095): картка товару з «Видалити» без підтвердження і «Скасувати», кошик товарів зі
 * строками й відновленням, що впирається в зайнятий артикул, і бекенд без кошика.
 */
export function TrashPage() {
  const { t } = useDemoTranslation([ukTrashPage], { keyPrefix: "trashPage" })
  const kitT = useErpUiT(ukTrash)
  const { isPending } = useAuthenticated()
  return (
    <div className="space-y-6">
      <PageHeader title={kitT("trash.open")} lead={t("lead")} />
      {isPending ? (
        <PageSkeleton rows={6} />
      ) : (
        <>
          <Section title={t("cardTitle")} description={t("cardDescription")}>
            <ProductCard />
          </Section>
          <Section title={t("binTitle")} description={t("binDescription")}>
            <TrashView
              resource={PRODUCTS}
              schema={productRowSchema}
              rowLabel={(product) => product.name}
              rowDescription={(product) => t("sku", { sku: product.sku })}
            />
          </Section>
          <Section
            title={t("unsupportedTitle")}
            description={t("unsupportedDescription")}
          >
            <TrashView
              resource={NO_TRASH_RESOURCE}
              schema={productRowSchema}
              rowLabel={(product) => product.name}
            />
          </Section>
        </>
      )}
    </div>
  )
}

/** Товар компанії з «Видалити товар», як у шапці картки запису; у кошику — підказка. */
function ProductCard() {
  const { t } = useDemoTranslation([ukTrashPage], { keyPrefix: "trashPage" })
  const companyId = useCompanyId()
  const { data, isPending, error, refetch } = useGetList<Product>(PRODUCTS, {
    pagination: { page: 1, perPage: 1 },
    filter: { sku: TRASH_CARD_SKU },
    meta: companyScope(companyId),
  })
  if (isPending) return <SectionSkeleton rows={1} />
  if (error)
    return (
      <PageState
        kind={errorStateKind(error)}
        headingLevel={3}
        onRetry={() => void refetch()}
      />
    )
  const product = data[0]
  if (!product)
    return <p className="text-sm text-muted-foreground">{t("noProducts")}</p>
  return (
    <div className="@container rounded-lg border p-4">
      <div className="flex flex-col gap-3 @md:flex-row @md:items-center @md:justify-between">
        <div className="min-w-0">
          <p className="font-medium break-words">{product.name}</p>
          <p className="text-sm text-muted-foreground">
            {t("sku", { sku: product.sku })}
          </p>
        </div>
        <DocumentDeleteAction
          resource={PRODUCTS}
          document={product}
          listPath={ROUTES.trash}
          name={product.name}
          lockReason={undefined}
          texts={{
            button: t("delete.button"),
            denied: t("delete.denied"),
            done: t("delete.done"),
            title: t("delete.title"),
            description: t("delete.description"),
            confirm: t("delete.confirm"),
            trashed: t("delete.trashed"),
          }}
        />
      </div>
    </div>
  )
}
