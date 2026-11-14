import * as React from "react"
import type { LucideIcon } from "lucide-react"
import type { SortPayload } from "@/registry/lib/ra-core"

import type { RowSelection } from "@/registry/hooks/use-row-selection"
import { useErpUiT } from "@/registry/lib/i18n"
import type { ListFilter } from "@/registry/lib/list-state"
import { Button } from "@/registry/ui/button"

/**
 * Частина templates/list-report: подання списку (ADR-0091). Ставиться разом із шаблоном.
 *
 * - Ті самі записи — таблицею шаблону чи вмістом модуля (дошка, календар). Вкладки, фільтри, пошук,
 *   збережені види й вибір — спільні для всіх подань: вміст отримує той самий фільтр запиту, сортування
 *   й вибір, що й таблиця.
 * - Вибране подання — в адресі (`?layout=board`) і у збереженому виді; перше в списку — за
 *   замовчуванням. Перемикач — біля «Фільтри», після меню видів; з одним поданням його немає.
 * - Подання — список з ключами, як вкладки й колонки (ADR-0020).
 */

/** Що отримує вміст подання: той самий запит, що й таблиця, і вибір записів. */
export interface ListReportContentProps {
  /** Ресурс API (ADR-0002). */
  resource: string
  /** Назва вмісту для скрінрідера — `tableLabel` шаблону. */
  label: string
  /** Фільтр запиту: вкладка поверх фільтрів панелі й постійних параметрів (`fixedFilter`). */
  filter: ListFilter
  sort: SortPayload
  onSortChange: (sort: SortPayload) => void
  /** Пошук, фільтри чи вкладка не за замовчуванням: порожній результат — «нічого не знайдено». */
  isFiltered: boolean
  /** «Скинути фільтри» для стану «нічого не знайдено»: «Стандартний» вид, подання те саме. */
  onResetFilters: () => void
  /** Вибір записів; інший фільтр чи компанія — скидається (ADR-0018). */
  selection: RowSelection
}

/** Подання списку: таблиця шаблону (без `render`) чи вміст модуля — дошка, календар. */
export interface ListReportLayout {
  id: string
  /** Підпис кнопки в перемикачі. */
  label: string
  icon?: LucideIcon
  /**
   * Вміст замість таблиці; без нього — таблиця шаблону. Окремий компонент на подання: хуки в
   * `render` не залежать від того, яке подання було перед ним.
   */
  render?: (props: ListReportContentProps) => React.ReactNode
}

/** Кнопки подань: вибране натиснуте (`aria-pressed`), назва групи — «Подання списку». */
export function ListLayoutSwitch({
  layouts,
  value,
  onValueChange,
}: {
  layouts: readonly ListReportLayout[]
  value: string | undefined
  onValueChange: (layout: string) => void
}) {
  const t = useErpUiT()
  if (layouts.length < 2) return null
  return (
    <div
      role="group"
      aria-label={t("listLayouts.label")}
      data-slot="list-layout-switch"
      className="flex shrink-0 gap-1"
    >
      {layouts.map(({ id, label, icon: Icon }) => (
        <Button
          key={id}
          variant={id === value ? "secondary" : "ghost"}
          aria-pressed={id === value}
          onClick={() => {
            if (id !== value) onValueChange(id)
          }}
        >
          {Icon ? <Icon aria-hidden /> : null}
          {label}
        </Button>
      ))}
    </div>
  )
}

/** Вміст подання окремим компонентом: зміна подання — новий компонент зі своїми хуками. */
export function ListLayoutContent({
  render,
  ...props
}: ListReportContentProps & {
  render: NonNullable<ListReportLayout["render"]>
}) {
  return render(props)
}
