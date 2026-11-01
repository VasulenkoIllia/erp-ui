import { PencilLineIcon } from "lucide-react"

import type { EditLockHolder } from "@/registry/lib/edit-lock"
import { useErpUiT } from "@/registry/lib/i18n"
import { Alert, AlertDescription } from "@/registry/ui/alert"

/**
 * «Редагує [ім'я]» (SPEC §8.2, ADR-0051): смуга на картці, поки запис редагує інша людина. Картка
 * лишається режимом перегляду: дані видно й можна копіювати, а кнопку «Редагувати» застосунок показує
 * неактивною з причиною `lock.reason`.
 *
 * Живий текст для скрінрідера — окремий прихований абзац: область має існувати до зміни, а порожня
 * смуга забрала б відступ між блоками картки. Видима смуга тому прихована від дерева доступності.
 */
export function EditLockNotice({ holder }: { holder: EditLockHolder | null }) {
  const t = useErpUiT()
  const text = holder ? t("editLock.notice", { name: holder.name }) : ""
  return (
    <>
      <p role="status" className="sr-only">
        {text}
      </p>
      {holder ? (
        <Alert role={undefined} aria-hidden data-slot="edit-lock-notice">
          <PencilLineIcon aria-hidden />
          <AlertDescription>{text}</AlertDescription>
        </Alert>
      ) : null}
    </>
  )
}
