import * as React from "react"

import { AuditLog } from "@/registry/erp/audit-log"
import type { AuditTarget } from "@/registry/lib/audit"
import { useErpUiT } from "@/registry/lib/i18n"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/registry/ui/sheet"

/**
 * Шухляда історії запису (ADR-0045): усі зміни одного запису, подробиці відкриті, змінені слова
 * виділено. Стани, сторінки й права — від `AuditLog`.
 *
 *   <RecordHistory target={{ type: "invoices", id, name }} />  // блок «Історія» на картці
 *
 *   const history = useRecordHistorySheet()                    // своя кнопка, рядок журналу
 *   <AuditLog onRecordHistory={history.open} />{history.sheet}
 */

/** Подій на сторінку в шухляді: вона ширша й довша за блок на картці. */
const SHEET_PER_PAGE = 20
/** Подій у блоці на картці. */
const CARD_PER_PAGE = 10

export interface RecordHistoryOptions {
  /** Назви дій проекту: { "invoices.paid": "Оплата рахунку" }. */
  actionLabels?: Record<string, string>
}

export function useRecordHistorySheet({
  actionLabels,
}: RecordHistoryOptions = {}) {
  const t = useErpUiT()
  // Запис лишається й після закриття: панель виїжджає зі своїм умістом, а не порожньою.
  const [target, setTarget] = React.useState<AuditTarget | null>(null)
  const [isOpen, setIsOpen] = React.useState(false)
  const open = React.useCallback((record: AuditTarget) => {
    setTarget(record)
    setIsOpen(true)
  }, [])
  const sheet = (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetContent className="data-[side=right]:w-full data-[side=right]:sm:max-w-xl">
        {target ? (
          <>
            <SheetHeader className="pe-12">
              <SheetTitle>{t("audit.recordHistory")}</SheetTitle>
              {target.name ? (
                <SheetDescription>{target.name}</SheetDescription>
              ) : null}
            </SheetHeader>
            {/* Прокручується список, а не панель: кнопка закриття лишається на місці. */}
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
              <AuditLog
                filter={{ targetType: target.type, targetId: target.id }}
                actionLabels={actionLabels}
                perPage={SHEET_PER_PAGE}
                filters={false}
                exportable={false}
                expanded
              />
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  )
  return { open, sheet }
}

/** Блок «Історія» на картці запису: останні події й кнопка «Уся історія». */
export function RecordHistory({
  target,
  actionLabels,
}: RecordHistoryOptions & { target: AuditTarget }) {
  const history = useRecordHistorySheet({ actionLabels })
  return (
    <>
      <AuditLog
        filter={{ targetType: target.type, targetId: target.id }}
        actionLabels={actionLabels}
        perPage={CARD_PER_PAGE}
        filters={false}
        exportable={false}
        onAllHistory={() => {
          history.open(target)
        }}
      />
      {history.sheet}
    </>
  )
}
