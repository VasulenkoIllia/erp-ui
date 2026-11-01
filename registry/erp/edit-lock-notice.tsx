import { PencilLineIcon } from "lucide-react"

import type { EditLockHolder } from "@/registry/lib/edit-lock"
import { useErpUiT } from "@/registry/lib/i18n"
import { Alert, AlertDescription } from "@/registry/ui/alert"

/**
 * «Редагує [ім'я]» (SPEC §8.2, ADR-0051): смуга на картці чи у формі, поки запис редагує інша людина.
 * Картка лишається режимом перегляду: дані видно й можна копіювати, а кнопку «Редагувати» застосунок
 * показує неактивною з цією ж причиною (`editLockReason`). Текст живий: скрінрідер прочитає зміну.
 */
export function EditLockNotice({ holder }: { holder: EditLockHolder | null }) {
  const t = useErpUiT()
  return (
    <div role="status" data-slot="edit-lock-notice">
      {holder ? (
        <Alert>
          <PencilLineIcon aria-hidden />
          <AlertDescription>
            {t("editLock.notice", { name: holder.name })}
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  )
}
