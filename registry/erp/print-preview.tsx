import * as React from "react"

import {
  PageState,
  useLoadingAnnouncement,
  type PageStateKind,
} from "@/registry/erp/page-state"
import { PrintButton } from "@/registry/erp/print-button"
import { useElementSize } from "@/registry/hooks/use-element-size"
import { useErpUiT } from "@/registry/lib/i18n"
import {
  A4_WIDTH_MM,
  mmToPx,
  PrintSheetContext,
  usePrintLanguage,
  usePrintTitle,
} from "@/registry/lib/print"
import { cn } from "@/registry/lib/utils"
import { Button } from "@/registry/ui/button"
import { Skeleton } from "@/registry/ui/skeleton"

/**
 * Перегляд друку (PF08, ADR-0062): аркуш A4 так, як його надрукує браузер, кнопка «Друкувати» й дії
 * сторінки. Друкується лише аркуш (`data-print-root`, `tokens/base.css`): поля дає `@page`, рядки
 * таблиць не розриваються між сторінками, а шапка таблиці повторюється на кожній.
 *
 * - Аркуш світлий і в темній темі, мова аркуша — мова документа (`language`, SPEC §11), а не
 *   інтерфейсу: блоки `erp/print-document` беруть її з контексту.
 * - На вузькому контейнері аркуш зменшено за шириною; «Справжній розмір» — без зменшення, з
 *   прокруткою в межах перегляду (збільшення сторінки браузером інакше аркуш лише зменшувало б).
 * - Стани (SPEC §8): `loading` — скелет аркуша й недоступна кнопка з поясненням; `error`, `offline`,
 *   `forbidden`, `not-found` — стан сторінки замість аркуша, без кнопки.
 *
 *   <PrintPreview title="Рахунок № 2026-0001" language={company.language} actions={<BackLink />}>
 *     <PrintCompanyHeader company={company} />
 *     …
 *   </PrintPreview>
 */
export type PrintPreviewState =
  "loading" | Exclude<PageStateKind, "empty" | "no-results">

export interface PrintPreviewProps {
  /** Назва документа: на час друку — заголовок сторінки, з нього браузер бере назву файла PDF. */
  title: string
  /** Мова документа (uk, en); за замовчуванням мова інтерфейсу. */
  language?: string | null
  /** Стан даних аркуша; немає — аркуш готовий. */
  state?: PrintPreviewState
  /** «Спробувати ще» для `error` і `offline`. */
  onRetry?: () => void
  /** Дії поруч із «Друкувати»: «Назад до документа» тощо. */
  actions?: React.ReactNode
  /** Вміст аркуша: блоки `erp/print-document` чи свої. */
  children: React.ReactNode
  className?: string
}

const SHEET_WIDTH_PX = mmToPx(A4_WIDTH_MM)

export function PrintPreview({
  title,
  language,
  state,
  onRetry,
  actions,
  children,
  className,
}: PrintPreviewProps) {
  const t = useErpUiT()
  const sheet = usePrintLanguage(language ?? undefined)
  usePrintTitle(state ? undefined : title)
  const [isActualSize, setActualSize] = React.useState(false)
  const isLoading = state === "loading" || (!state && sheet.isLoading)
  return (
    <section
      aria-label={t("print.preview")}
      data-slot="print-preview"
      className={cn("@container grid min-w-0 gap-4", className)}
    >
      <div className="flex flex-wrap items-center gap-2">
        {state && !isLoading ? null : (
          <PrintButton
            title={title}
            deniedReason={isLoading ? t("print.notReady") : undefined}
            className="w-full @md:w-auto"
          />
        )}
        {state ? null : (
          <Button
            type="button"
            variant="outline"
            aria-pressed={isActualSize}
            className="w-full @md:w-auto"
            onClick={() => {
              setActualSize((value) => !value)
            }}
          >
            {t("print.actualSize")}
          </Button>
        )}
        {actions}
      </div>
      {isLoading ? (
        <SheetSkeleton />
      ) : state ? (
        <PageState kind={state} onRetry={onRetry} />
      ) : (
        <PrintSheetContext value={sheet}>
          <Sheet language={sheet.language} isActualSize={isActualSize}>
            {children}
          </Sheet>
        </PrintSheetContext>
      )}
    </section>
  )
}

/**
 * Аркуш A4: за шириною контейнера (не більше справжнього розміру) чи справжнього розміру з прокруткою.
 * Міряється обгортка, а зменшується аркуш: розмір обгортки від масштабу не залежить.
 */
function Sheet({
  language,
  isActualSize,
  children,
}: {
  language: string
  isActualSize: boolean
  children: React.ReactNode
}) {
  const t = useErpUiT()
  const ref = React.useRef<HTMLDivElement>(null)
  const width = useElementSize(ref, "width")
  // Ширини ще немає (перший кадр) чи контейнер прихований — справжній розмір, а не нульовий масштаб.
  const scale = isActualSize || !width ? 1 : Math.min(1, width / SHEET_WIDTH_PX)
  return (
    <div
      ref={ref}
      data-slot="print-viewport"
      // Прокрутка аркуша справжнього розміру — з клавіатури теж (WCAG 2.1.1).
      // eslint-disable-next-line jsx-a11y-x/no-noninteractive-tabindex -- прокрутка з клавіатури
      tabIndex={isActualSize ? 0 : undefined}
      role={isActualSize ? "region" : undefined}
      aria-label={isActualSize ? t("print.sheetLabel") : undefined}
      className={cn("min-w-0", isActualSize && "overflow-x-auto pb-2")}
    >
      <div
        data-print-root=""
        data-slot="print-sheet"
        data-theme="light"
        lang={language}
        style={{ zoom: scale === 1 ? undefined : scale }}
        className="relative isolate mx-auto min-h-[297mm] w-[210mm] bg-card p-[12mm] text-[10pt] leading-snug text-card-foreground shadow-sm ring-1 ring-border"
      >
        {children}
      </div>
    </div>
  )
}

/** Завантаження: скелет у формі аркуша, після 1 с — «Завантажуємо аркуш» для скрінрідера. */
function SheetSkeleton() {
  const t = useErpUiT()
  useLoadingAnnouncement(t("print.loading"))
  return (
    <div
      data-slot="print-sheet-skeleton"
      role="status"
      aria-label={t("print.loading")}
      aria-busy
      className="mx-auto grid aspect-[210/297] w-full max-w-[210mm] content-start gap-4 rounded-sm bg-card p-[6%] ring-1 ring-border"
    >
      <div className="flex justify-between gap-4">
        <Skeleton className="h-10 w-1/4" />
        <Skeleton className="h-16 w-2/5" />
      </div>
      <Skeleton className="mx-auto h-6 w-1/2" />
      <Skeleton className="h-12 w-full" />
      {Array.from({ length: 6 }, (_, i) => (
        <Skeleton key={i} className="h-5 w-full" />
      ))}
      <Skeleton className="ms-auto h-16 w-1/3" />
    </div>
  )
}
