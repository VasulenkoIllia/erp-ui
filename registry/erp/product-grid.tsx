import * as React from "react"

import { announce } from "@/registry/lib/announce"
import { useErpUiT } from "@/registry/lib/i18n"
import { ukPhotos } from "@/registry/lib/i18n-uk-photos"
import { cn } from "@/registry/lib/utils"
import { Skeleton } from "@/registry/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/registry/ui/table"

/**
 * Сітка карток товарів з фото (частина UI11, ADR-0101): результати пошуку, каталог, підбір.
 *
 * - Колонки — за шириною контейнера (`@container`, SPEC §9), від однієї на телефоні.
 * - До сотні карток без зайвих перемальовувань: картка перемальовується, лише коли змінився її запис чи
 *   `renderItem`; введення деінде на сторінці сітку не чіпає. Тож `renderItem` — стабільна функція
 *   (`useCallback`), а змінений запис — новий об'єкт лише цього запису.
 * - `ProductCard` — слоти: фото (`erp/photo-gallery`), рядок над назвою, назва, опис, ціни, позначки,
 *   варіанти (`ProductVariants`), дії.
 * - `ProductVariants` — згорнута таблиця варіантів: малюється, лише коли її відкрили (у товару їх буває
 *   сотня), колонки, порожні в усіх рядках, не показуються. Відкрита картка займає дві колонки сітки.
 */
export interface ProductGridProps<T> {
  readonly items: readonly T[]
  readonly getKey: (item: T) => React.Key
  /** Стабільна функція (`useCallback`): інакше перемальовуються всі картки. */
  readonly renderItem: (item: T, index: number) => React.ReactNode
  /** Назва списку для скрінрідера: «Результати пошуку». */
  readonly label: string
  /** Перше завантаження: замість карток — скелетони. */
  readonly loading?: boolean
  readonly skeletonCount?: number
  readonly className?: string
}

const DEFAULT_SKELETONS = 8

interface GridItemProps {
  item: unknown
  index: number
  renderItem: (item: unknown, index: number) => React.ReactNode
}

const GridItem = React.memo(function GridItem({
  item,
  index,
  renderItem,
}: GridItemProps) {
  return (
    // Відкриті варіанти: дві колонки, а фото — тієї ж висоти, що в одній.
    <li className="min-w-0 @min-[29rem]:has-[details[open]]:col-span-2 @min-[29rem]:has-[details[open]]:**:data-[slot=photo-gallery-frame]:aspect-[2]">
      {renderItem(item, index)}
    </li>
  )
})

function CardSkeleton() {
  return (
    <li className="flex flex-col gap-2 rounded-lg border p-3" aria-hidden>
      <Skeleton className="aspect-square w-full" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-1/2" />
    </li>
  )
}

const GRID_CLASS =
  "grid list-none grid-cols-[repeat(auto-fill,minmax(min(100%,14rem),1fr))] gap-4 p-0"

function ProductGridImpl<T>({
  items,
  getKey,
  renderItem,
  label,
  loading = false,
  skeletonCount = DEFAULT_SKELETONS,
  className,
}: ProductGridProps<T>) {
  const t = useErpUiT(ukPhotos)
  const render = renderItem as (item: unknown, index: number) => React.ReactNode
  // Новий role="status" разом зі скелетонами часто мовчить: озвучує спільний регіон (lib/announce).
  // Скасування прибирає «Завантаження» з регіону, коли картки прийшли.
  React.useEffect(
    () => (loading ? announce(t("photos.grid.loading")) : undefined),
    [loading, t],
  )
  return (
    <div className={cn("@container", className)} data-slot="product-grid">
      {loading ? (
        <ul aria-label={label} aria-busy className={GRID_CLASS}>
          {Array.from({ length: skeletonCount }, (_, index) => (
            <CardSkeleton key={index} />
          ))}
        </ul>
      ) : (
        // role="list": Safari без нього не читає список із list-style: none.
        // eslint-disable-next-line jsx-a11y-x/no-redundant-roles -- див. коментар вище
        <ul role="list" aria-label={label} className={GRID_CLASS}>
          {items.map((item, index) => (
            <GridItem
              key={getKey(item)}
              item={item}
              index={index}
              renderItem={render}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

/** Сітка карток; `React.memo` з тими самими типами, що в `ProductGridImpl`. */
export const ProductGrid = React.memo(ProductGridImpl) as typeof ProductGridImpl

export interface ProductCardProps {
  /** Назва товару — заголовок картки. */
  readonly title: React.ReactNode
  /** Рівень заголовка: 3, коли над сіткою є h2. */
  readonly headingLevel?: 2 | 3 | 4
  /** Фото: зазвичай `PhotoGallery`. */
  readonly photo?: React.ReactNode
  /** Рядок над назвою: постачальник, код, посилання на сторінку. */
  readonly eyebrow?: React.ReactNode
  /** Рядки опису під назвою: категорія, збіг, наявність. */
  readonly description?: React.ReactNode
  readonly prices?: React.ReactNode
  readonly badges?: React.ReactNode
  /** Згорнута таблиця варіантів: `ProductVariants`. */
  readonly variants?: React.ReactNode
  /** Дії картки: оцінка, прив'язки. */
  readonly actions?: React.ReactNode
  readonly children?: React.ReactNode
  readonly className?: string
}

export function ProductCard({
  title,
  headingLevel = 3,
  photo,
  eyebrow,
  description,
  prices,
  badges,
  variants,
  actions,
  children,
  className,
}: ProductCardProps) {
  const titleId = React.useId()
  const Heading = `h${String(headingLevel)}` as "h2" | "h3" | "h4"
  return (
    <article
      aria-labelledby={titleId}
      data-slot="product-card"
      className={cn(
        "flex h-full min-w-0 flex-col gap-2 rounded-lg border bg-card p-3 text-sm text-card-foreground",
        className,
      )}
    >
      {photo}
      {eyebrow ? (
        <div className="text-xs text-muted-foreground">{eyebrow}</div>
      ) : null}
      <Heading id={titleId} className="text-base font-medium break-words">
        {title}
      </Heading>
      {description ? (
        <div className="space-y-1 text-muted-foreground">{description}</div>
      ) : null}
      {prices ? <div className="font-medium tabular-nums">{prices}</div> : null}
      {badges ? <div className="flex flex-wrap gap-1">{badges}</div> : null}
      {children}
      {variants}
      {actions ? (
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
          {actions}
        </div>
      ) : null}
    </article>
  )
}

export interface VariantColumn<T> {
  readonly id: string
  readonly header: string
  readonly value: (row: T) => React.ReactNode
  /** Число: праворуч, однакова ширина цифр. */
  readonly numeric?: boolean
  /** Показувати, навіть коли в усіх рядках порожньо. */
  readonly keep?: boolean
}

export interface ProductVariantsProps<T> {
  /** Підпис згорнутої таблиці: «12 варіантів: білий, чорний…». */
  readonly summary: React.ReactNode
  readonly columns: readonly VariantColumn<T>[]
  readonly rows: readonly T[]
  readonly getRowId: (row: T) => string
  /** Назва таблиці для скрінрідера. */
  readonly label: string
}

const isEmptyValue = (value: React.ReactNode) =>
  value === null || value === undefined || value === "" || value === false

function VariantTable<T>({
  columns,
  rows,
  getRowId,
  label,
}: Omit<ProductVariantsProps<T>, "summary">) {
  const shown = columns.filter(
    (column) =>
      column.keep || rows.some((row) => !isEmptyValue(column.value(row))),
  )
  return (
    <Table label={label} aria-label={label}>
      <TableHeader>
        <TableRow>
          {shown.map((column) => (
            <TableHead
              key={column.id}
              className={cn(column.numeric && "text-right")}
            >
              {column.header}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={getRowId(row)}>
            {shown.map((column) => (
              <TableCell
                key={column.id}
                className={cn(column.numeric && "text-right tabular-nums")}
              >
                {column.value(row)}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

export function ProductVariants<T>({
  summary,
  ...table
}: ProductVariantsProps<T>) {
  const [isOpen, setIsOpen] = React.useState(false)
  return (
    <details
      data-slot="product-variants"
      className="group/variants min-w-0 rounded-md border"
      onToggle={(event) => {
        setIsOpen(event.currentTarget.open)
      }}
    >
      <summary className="min-h-touch cursor-pointer rounded-md px-2 py-1.5 outline-none select-none focus-visible:ring-2 focus-visible:ring-ring">
        {summary}
      </summary>
      {isOpen ? (
        <div className="border-t">
          <VariantTable {...table} />
        </div>
      ) : null}
    </details>
  )
}
