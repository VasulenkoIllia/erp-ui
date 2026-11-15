import type * as React from "react"
import type { LucideIcon } from "lucide-react"
import type { SortPayload } from "@/registry/lib/ra-core"

import type { RowSelection } from "@/registry/hooks/use-row-selection"
import { useErpUiT } from "@/registry/lib/i18n"
import { ukLists } from "@/registry/lib/i18n-uk-lists"
import type { ListFilter } from "@/registry/lib/list-state"
import { Button } from "@/registry/ui/button"

/**
 * Частина templates/list-report: подання списку (ADR-0091). Ставиться разом із шаблоном.
 *
 * - Ті самі записи — таблицею шаблону чи вмістом модуля (дошка, календар). Вкладки, фільтри, пошук і
 *   збережені види — спільні для всіх подань: вміст отримує той самий фільтр запиту й сортування, що й
 *   таблиця, і той самий вибір записів (інше подання, як і інша вкладка, вибір скидає).
 * - Вибране подання — в адресі (`?layout=board`) і у збереженому виді; перше в списку — за
 *   замовчуванням. Перемикач — біля «Фільтри», після меню видів; з одним поданням його немає.
 * - Подання — список з ключами, як вкладки й колонки; вміст — компонент модуля в слоті, як дії
 *   розширення (ADR-0020).
 */

/** Що отримує вміст подання: той самий запит, що й таблиця, вибір записів і масові дії. */
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
  /** Вибір записів; інший фільтр, подання чи компанія — скидається (ADR-0018). */
  selection: RowSelection
  /** Масові дії списку (`bulk`, з діями розширення) для панелі вибраного; без `bulk` — немає. */
  bulkActions?: (count: number) => React.ReactNode
}

/** Подання списку: таблиця шаблону (без `component`) чи вміст модуля — дошка, календар. */
export interface ListReportLayout {
  id: string
  /** Підпис кнопки в перемикачі. */
  label: string
  icon?: LucideIcon
  /** Вміст замість таблиці; без нього — таблиця шаблону. Сам вантажить записи й показує стани. */
  component?: React.ComponentType<ListReportContentProps>
}

/**
 * Вибране подання: смужка під підписом, як у вкладки (контраст `foreground` до тла ≥ 3:1, WCAG 1.4.11),
 * у режимі високого контрасту — рамка.
 */
const PRESSED_MARK =
  "after:absolute after:inset-x-2 after:bottom-1 after:h-0.5 after:rounded-full after:bg-foreground after:opacity-0 aria-pressed:after:opacity-100 forced-colors:aria-pressed:outline-2 forced-colors:aria-pressed:outline-solid"

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
  const t = useErpUiT(ukLists)
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
          className={PRESSED_MARK}
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
