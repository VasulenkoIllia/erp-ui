import { useCanAccess } from "@/registry/lib/ra-core"
import { Link } from "react-router"

import { useKeepsInTrash } from "@/registry/hooks/use-trash"
import { useErpUiT } from "@/registry/lib/i18n"
import { ukTrash } from "@/registry/lib/i18n-uk-trash"
import { ACTION_ICONS } from "@/registry/lib/icons"
import { buttonVariants } from "@/registry/ui/button"

const TrashIcon = ACTION_ICONS.delete

/**
 * «Кошик» у шапці списку (PF16, ADR-0095): перехід на сторінку видалених записів ресурсу. Кнопки немає,
 * поки налаштування й права невідомі, коли сервер не переносить записи ресурсу в кошик чи людина не може
 * їх видаляти (`<ресурс>:delete`, з «Свої» — теж): відновлює той, хто видаляє.
 *
 *   actions: [{ id: "trash", node: <TrashLink resource={ORGANIZATIONS} to={paths.organizationsTrash} /> }, …]
 */
export function TrashLink({
  resource,
  to,
  preload,
}: {
  resource: string
  to: string
  /** Прогріти чанк сторінки кошика (`preload` хука модуля). */
  preload?: (pathname: string) => void
}) {
  const t = useErpUiT(ukTrash)
  const { keeps } = useKeepsInTrash(resource)
  const { canAccess, isPending } = useCanAccess({ resource, action: "delete" })
  if (!keeps || isPending || !canAccess) return null
  const warm = preload
    ? () => {
        preload(to)
      }
    : undefined
  return (
    <Link
      to={to}
      className={buttonVariants({ variant: "outline" })}
      onPointerEnter={warm}
      onFocus={warm}
    >
      <TrashIcon aria-hidden />
      {t("trash.open")}
    </Link>
  )
}
