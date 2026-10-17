import {
  CopyableValue,
  type CopyableKind,
} from "@/components/erp/copyable-value"

export interface Requisite {
  readonly id: string
  readonly label: string
  readonly value: string
  readonly kind: CopyableKind
  /** Показ для людини, коли інакше, ніж зберігається (телефон). */
  readonly display?: string
}

/**
 * Реквізити з «Копіювати» (UI43): показ для людини, у буфер — як зберігається. Підпис над значенням
 * у вузькому контейнері, ліворуч — у ширшому (`@container`).
 */
export function RequisiteList({ items }: { items: readonly Requisite[] }) {
  return (
    <div className="@container">
      <dl className="grid gap-x-6 gap-y-3 @xl:grid-cols-[max-content_1fr]">
        {items.map((item) => (
          <div key={item.id} className="contents">
            <dt className="text-sm text-muted-foreground @xl:pt-1">
              {item.label}
            </dt>
            <dd className="-mt-2 min-w-0 @xl:mt-0">
              <CopyableValue
                label={item.label}
                value={item.value}
                kind={item.kind}
                display={item.display}
              />
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
