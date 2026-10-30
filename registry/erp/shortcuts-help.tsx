import * as React from "react"

import { ErrorBoundary } from "@/registry/erp/error-boundary"
import { LoadingFallback } from "@/registry/erp/page-state"
import { useErpUiT } from "@/registry/lib/i18n"
import { lazyWithPreload } from "@/registry/lib/lazy"
import type { ProjectShortcut } from "@/registry/lib/shortcuts"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/registry/ui/dialog"

/**
 * Довідка гарячих клавіш (0.5e, критерій 16, ADR-0042): перелік з реєстру lib/shortcuts, перемикач
 * клавіші «?» (WCAG 2.1.4). Відкривається клавішею `useShortcut(SHORTCUTS.help, …)` і командою
 * палітри: без неї людина, що вимкнула «?», не змогла б повернути клавішу.
 *
 * - Перелік і перемикач (erp/shortcuts-help-list) — окремий чанк: у перший екран не входять.
 * - Фокус одразу на вікні, а не на перемикачі внизу: стрілки й PageDown одразу прокручують перелік,
 *   а вікно не стрибає до кінця.
 * - «Закрити» — одна кнопка в липкому футері: на телефоні перелік вищий за екран, а хрестик угорі
 *   прокручувався б разом із ним.
 */
const ShortcutsHelpList = lazyWithPreload(() =>
  import("./shortcuts-help-list").then((m) => m.ShortcutsHelpList),
)

export function ShortcutsHelp({
  open,
  onOpenChange,
  extra,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Клавіші проекту: окрема група наприкінці довідки. */
  extra?: readonly ProjectShortcut[]
}) {
  const t = useErpUiT()
  const popup = React.useRef<HTMLDivElement>(null)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        ref={popup}
        initialFocus={popup}
        showCloseButton={false}
        // flex, а не grid: у комірці сітки `sticky` футера не має куди рухатись.
        className="flex scroll-pb-24 flex-col focus-visible:ring-2 focus-visible:ring-ring sm:max-w-2xl"
      >
        <DialogHeader>
          <DialogTitle>{t("shortcuts.title")}</DialogTitle>
          <DialogDescription>{t("shortcuts.description")}</DialogDescription>
        </DialogHeader>
        <ErrorBoundary headingLevel={3} className="min-h-0 border-0">
          <React.Suspense fallback={<LoadingFallback className="h-24" />}>
            <ShortcutsHelpList extra={extra} />
          </React.Suspense>
        </ErrorBoundary>
        {/* `-bottom-4` дорівнює `p-4` діалогу: `sticky` зупиняється над відступом контейнера. */}
        <DialogFooter showCloseButton className="sticky -bottom-4 bg-popover" />
      </DialogContent>
    </Dialog>
  )
}
