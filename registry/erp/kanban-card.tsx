import * as React from "react"
import { EllipsisVerticalIcon, LockKeyholeIcon } from "lucide-react"

import { useErpUiT } from "@/registry/lib/i18n"
import { ukBoard } from "@/registry/lib/i18n-uk-board"
import { ukLists } from "@/registry/lib/i18n-uk-lists"
import { cn } from "@/registry/lib/utils"
import { Button } from "@/registry/ui/button"
import { Checkbox } from "@/registry/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/registry/ui/dropdown-menu"
import { Spinner } from "@/registry/ui/spinner"

/**
 * Картка дошки (erp/kanban, UI07, ADR-0100): прапорець вибору, вміст модуля, меню дій із «Перемістити
 * в…» і позначка «Редагує …». Ставиться разом з erp/kanban.
 *
 * - «Перемістити в…» — пункти-колонки, поточна позначена й неактивна; працює з клавіатури й без
 *   перетягування (SPEC §9, WCAG 2.5.7). Перенести не можна — замість колонок причина (SPEC §8.4).
 * - Поки йде перенесення — у кнопці меню спінер, картка `aria-busy`.
 */

export interface KanbanCardMove {
  columns: readonly { id: string; label: string }[]
  /** Колонка, де картка зараз. */
  current: string
  onMove: (column: string) => void
  /** Чому перенести не можна: немає права, запис забороняє, картку редагує інша людина. */
  disabledReason?: string
}

export interface KanbanCardProps {
  /** Назва картки: прапорець і меню дій («Дії: Угода 12»). */
  label: string
  children: React.ReactNode
  /** Вибір для масових дій: без `onSelectedChange` прапорця немає. */
  selected?: boolean
  onSelectedChange?: (selected: boolean) => void
  /** «Перемістити в…»; без нього меню немає. */
  move?: KanbanCardMove
  /** Хто зараз редагує картку (SPEC §8.1, стан 15). */
  lockedBy?: string
  /** Іде дія над карткою: перенесення. */
  busy?: boolean
  className?: string
}

export function KanbanCard({
  label,
  children,
  selected = false,
  onSelectedChange,
  move,
  lockedBy,
  busy = false,
  className,
}: KanbanCardProps) {
  const t = useErpUiT(ukBoard, ukLists)
  return (
    <div
      data-slot="kanban-card"
      aria-busy={busy}
      className={cn(
        "space-y-2 rounded-lg border bg-card p-3 text-card-foreground shadow-xs",
        selected && "border-primary ring-1 ring-primary",
        className,
      )}
    >
      <div className="flex items-start gap-2">
        {onSelectedChange ? (
          <Checkbox
            checked={selected}
            aria-label={t("selection.row", { label })}
            className="mt-0.5"
            onCheckedChange={(checked) => {
              onSelectedChange(checked)
            }}
          />
        ) : null}
        <div className="min-w-0 flex-1 space-y-1 text-sm break-words">
          {children}
        </div>
        {move ? <MoveMenu label={label} move={move} busy={busy} /> : null}
      </div>
      {lockedBy ? (
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <LockKeyholeIcon aria-hidden className="size-3.5" />
          {t("board.card.lockedBy", { name: lockedBy })}
        </p>
      ) : null}
    </div>
  )
}

function MoveMenu({
  label,
  move,
  busy,
}: {
  label: string
  move: KanbanCardMove
  busy: boolean
}) {
  const t = useErpUiT(ukBoard)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("board.card.actions", { label })}
            data-kanban-card-menu=""
            className="touch-target relative -my-1 -me-1"
          />
        }
      >
        {busy ? <Spinner aria-hidden /> : <EllipsisVerticalIcon aria-hidden />}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t("board.card.moveTo")}</DropdownMenuLabel>
          {move.disabledReason ? (
            // Причина — текст для читання, а не вимкнена дія: повний контраст (WCAG 1.4.3).
            <DropdownMenuItem
              disabled
              className="whitespace-normal text-muted-foreground data-disabled:opacity-100"
            >
              {move.disabledReason}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuRadioGroup value={move.current}>
              {move.columns.map((column) => (
                <DropdownMenuRadioItem
                  key={column.id}
                  value={column.id}
                  disabled={busy || column.id === move.current}
                  closeOnClick
                  onClick={() => {
                    if (column.id !== move.current) move.onMove(column.id)
                  }}
                >
                  {column.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
