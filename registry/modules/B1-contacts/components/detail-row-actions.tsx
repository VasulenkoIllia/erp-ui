import { EllipsisVerticalIcon } from "lucide-react"
import { useRef } from "react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

/** Дія з рядком адреси чи рахунку; `trigger` — кнопка меню: туди повертається фокус після діалогу. */
export interface DetailRowAction {
  readonly id: string
  readonly label: string
  readonly destructive?: boolean
  /** Поки зберігається попередня дія: наступна з цією ж версією запису отримала б 409. */
  readonly disabled?: boolean
  readonly onSelect: (trigger: HTMLElement | null) => void
}

/**
 * Меню дій рядка (ADR-0028): «Змінити», «Зробити основним», «Видалити». Одна кнопка в рядку, а не
 * кілька: у гріді таблиці кожна — окрема зупинка клавіатури. Руйнівна дія — остання, за роздільником.
 */
export function DetailRowActions({
  label,
  actions,
}: {
  /** Назва кнопки: «Дії: вул. Хрещатик, 22». */
  label: string
  actions: readonly DetailRowAction[]
}) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const regular = actions.filter((action) => !action.destructive)
  const destructive = actions.filter((action) => action.destructive)
  const item = (action: DetailRowAction) => (
    <DropdownMenuItem
      key={action.id}
      variant={action.destructive ? "destructive" : "default"}
      disabled={action.disabled}
      onClick={() => {
        action.onSelect(triggerRef.current)
      }}
    >
      {action.label}
    </DropdownMenuItem>
  )
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            ref={triggerRef}
            variant="ghost"
            size="icon"
            aria-label={label}
          />
        }
      >
        <EllipsisVerticalIcon aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {regular.map(item)}
        {regular.length && destructive.length ? (
          <DropdownMenuSeparator />
        ) : null}
        {destructive.map(item)}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
