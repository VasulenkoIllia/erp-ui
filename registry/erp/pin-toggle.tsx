import * as React from "react"
import { PinIcon } from "lucide-react"
import type { Identifier } from "ra-core"

import { usePin } from "@/registry/hooks/use-pin"
import type { DataTableColumn } from "@/registry/lib/data-table-core"
import { useErpUiT } from "@/registry/lib/i18n"
import { isPinned, type PinnableRecord } from "@/registry/lib/pins"
import { cn } from "@/registry/lib/utils"
import { Button } from "@/registry/ui/button"

/**
 * Закріплення запису вгорі списку (SPEC §7 List Report; ADR-0024, lib/pins): кнопка-перемикач
 * (`aria-pressed`) у рядку списку чи в шапці картки й колонка для List Report.
 *
 * - Закріплення особисте: інші користувачі його не бачать. Закріплені стоять першим блоком списку
 *   в порядку закріплення; порядок дає сервер.
 * - Назва кнопки не змінюється зі станом (W3C APG Button): стан — `aria-pressed` і заповнена шпилька.
 * - Після зміни запис перечитується й стає на нове місце. Якщо кнопка мала фокус, фокус іде за
 *   записом — на його кнопку на новому місці (сторінка прокручується до неї лише після клавіатури:
 *   клік мишею не кидає сторінку вгору); запису не видно (інша сторінка, поза вікном прокрутки) —
 *   грід лишає фокус на тому самому місці (hooks/use-grid-keyboard). Нова кнопка — це новий
 *   компонент: рядок таблиці й картка монтують вміст за id запису (erp/data-table-cells, -cards).
 */

/** Ключ колонки закріплення: розширення модуля ховає чи переставляє її за ним (ADR-0020). */
export const PIN_COLUMN_ID = "pin"
const PIN_COLUMN_REM = 2.75
/** Скільки після відповіді й перечитування нова кнопка того самого запису ще може забрати фокус. */
const REFOCUS_MS = 1000

/**
 * Кнопка запису, що мала фокус під час зміни: нова кнопка того самого запису забирає фокус. Поки
 * запит і перечитування йдуть — без межі часу (повільний сервер), після них — ще `REFOCUS_MS` на
 * рендер; невдача скасовує. Один на застосунок, як і фокус.
 */
let refocus: { key: string; until: number; scroll: boolean } | null = null

/** Фокус із клавіатури (`:focus-visible`); середовище без цього селектора — ні. */
function hasVisibleFocus(element: Element): boolean {
  try {
    return element.matches(":focus-visible")
  } catch {
    return false
  }
}

export interface PinToggleProps {
  /** Ресурс API: `organizations`. */
  resource: string
  record: { id: Identifier } & PinnableRecord
  /** Назва запису: у назві кнопки в рядку й в оголошенні після зміни. */
  name: string
  /** `icon` — у рядку списку (назва кнопки — з назвою запису), `button` — у шапці картки, з підписом. */
  variant?: "icon" | "button"
  className?: string
}

export function PinToggle({
  resource,
  record,
  name,
  variant = "icon",
  className,
}: PinToggleProps) {
  const t = useErpUiT()
  const pin = usePin(resource, record, name)
  const ref = React.useRef<HTMLButtonElement>(null)
  // Не `\u0000`: CLI shadcn при встановленні пише його справжнім NUL, і git бачить файл двійковим.
  const key = JSON.stringify([resource, String(record.id)])
  const saved = isPinned(record)

  // `saved` — і для кнопки, яку React лише переставив: перестановка теж забирає фокус.
  React.useLayoutEffect(() => {
    const token = refocus
    if (token?.key !== key || Date.now() > token.until) return
    const active = document.activeElement
    if (active && active !== document.body) return
    refocus = null
    ref.current?.focus({ preventScroll: !token.scroll })
  }, [key, saved])

  const withText = variant === "button"
  const shape = withText
    ? ({
        variant: pin.pinned ? "secondary" : "outline",
        size: "default",
      } as const)
    : ({ variant: "ghost", size: "icon-sm" } as const)
  return (
    <Button
      ref={ref}
      type="button"
      {...shape}
      aria-pressed={pin.pinned}
      aria-label={withText ? undefined : t("pins.pin", { name })}
      aria-busy={pin.isPending || undefined}
      data-slot="pin-toggle"
      className={cn(pin.isPending && "opacity-70", className)}
      onClick={() => {
        const button = ref.current
        if (pin.isPending || !button) return
        if (document.activeElement === button)
          refocus = {
            key,
            until: Number.POSITIVE_INFINITY,
            scroll: hasVisibleFocus(button),
          }
        void pin.toggle().then((done) => {
          if (refocus?.key !== key) return
          if (done) refocus.until = Date.now() + REFOCUS_MS
          else refocus = null
        })
      }}
    >
      <PinIcon
        aria-hidden
        fill={pin.pinned ? "currentColor" : "none"}
        className={pin.pinned ? "text-primary" : "text-muted-foreground"}
      />
      {withText ? t("pins.action") : null}
    </Button>
  )
}

/**
 * Колонка закріплення для List Report: перша, липка разом із назвою, на телефоні — дія картки.
 * Модуль ставить її у свій список колонок, тож розширення проекту може її сховати (бекенд без
 * закріплення, ADR-0021) чи переставити за ключем `pin`. `name` — назва запису для кнопки
 * («Закріпити вгорі: ТОВ «Ромашка»»); стабільна між рендерами, як і колонки.
 */
export function usePinColumn<T extends { id: Identifier } & PinnableRecord>({
  resource,
  name,
}: {
  resource: string
  name: (row: T) => string
}): DataTableColumn<T> {
  const t = useErpUiT()
  const header = t("pins.column")
  return React.useMemo(
    () => ({
      id: PIN_COLUMN_ID,
      header,
      headerHidden: true,
      cell: (row: T) => (
        <PinToggle resource={resource} record={row} name={name(row)} />
      ),
      minWidth: PIN_COLUMN_REM,
      grow: 0,
      sticky: true,
      card: "actions",
    }),
    [header, resource, name],
  )
}
