import { ArrowDownIcon, ArrowUpIcon } from "lucide-react"

import { keepFieldFocus } from "@/registry/erp/form"
import { useErpUiT } from "@/registry/lib/i18n"
import { ACTION_ICONS } from "@/registry/lib/icons"
import { Button } from "@/registry/ui/button"

/** Кнопки рядка `erp/repeating-rows`: порядок і вилучення (UI42, ADR-0047). */
export interface RepeatingRowActionsProps {
  index: number
  count: number
  rowLabel: string
  canReorder: boolean
  canRemove: boolean
  isFirst: boolean
  onMove: (from: number, to: number) => void
  onRemove: (index: number) => void
}

export function RepeatingRowActions({
  index,
  count,
  rowLabel,
  canReorder,
  canRemove,
  isFirst,
  onMove,
  onRemove,
}: RepeatingRowActionsProps) {
  const t = useErpUiT()
  const Remove = ACTION_ICONS.delete
  return (
    <div className="flex shrink-0 flex-col gap-2 @lg:self-stretch">
      {/* Вирівнює кнопки першого рядка з полями, а не з їхніми підписами. */}
      {isFirst ? (
        <span
          aria-hidden
          className="invisible hidden text-sm leading-snug @lg:block"
        >
          &nbsp;
        </span>
      ) : null}
      <div className="flex justify-end gap-1">
        {canReorder ? (
          <>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              data-row-action="up"
              aria-label={t("repeatingRows.moveUp", { row: rowLabel })}
              disabled={index === 0}
              focusableWhenDisabled
              onMouseDown={keepFieldFocus}
              onClick={() => {
                onMove(index, index - 1)
              }}
            >
              <ArrowUpIcon aria-hidden />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              data-row-action="down"
              aria-label={t("repeatingRows.moveDown", { row: rowLabel })}
              disabled={index === count - 1}
              focusableWhenDisabled
              onMouseDown={keepFieldFocus}
              onClick={() => {
                onMove(index, index + 1)
              }}
            >
              <ArrowDownIcon aria-hidden />
            </Button>
          </>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          data-row-action="remove"
          aria-label={t("repeatingRows.remove", { row: rowLabel })}
          disabled={!canRemove}
          focusableWhenDisabled
          onMouseDown={keepFieldFocus}
          onKeyDown={(event) => {
            // Фокус іде на таку саму кнопку сусіднього рядка: утримана клавіша вилучила б їх усі.
            if (event.repeat) event.preventDefault()
          }}
          onClick={() => {
            onRemove(index)
          }}
        >
          <Remove aria-hidden />
        </Button>
      </div>
    </div>
  )
}
