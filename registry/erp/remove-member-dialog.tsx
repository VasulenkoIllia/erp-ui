import { toast } from "sonner"

import {
  isReauthCancelled,
  useErpAuthProvider,
} from "@/registry/erp/auth-layout"
import { ConfirmDialog } from "@/registry/erp/confirm-dialog"
import { useReauth } from "@/registry/erp/reauth-dialog"
import type { AccessTarget } from "@/registry/erp/user-access-data"
import { useApiErrorMessage } from "@/registry/hooks/use-api-error-message"
import { useCompanyId } from "@/registry/hooks/use-company"
import { useMe } from "@/registry/hooks/use-me"
import { isApiError } from "@/registry/lib/api"
import { isReauthRequired } from "@/registry/lib/auth"
import { useErpUiT } from "@/registry/lib/i18n"

/**
 * Підтвердження «Вилучити з компанії» (ADR-0041): назва компанії в заголовку, бо адміністратор може
 * працювати в кількох, і один текст для всіх: дія не каже, чи є в людини інші компанії. Поки запит
 * летить, діалог не закривається: скасувати незворотну дію вже не можна.
 * `onRemoved` — людини в компанії вже немає, зокрема її щойно вилучив інший адміністратор (404).
 * `onStale` — сервер відмовив через зміни, яких екран не бачив (403, 409): доступ перечитати.
 */
export function RemoveMemberDialog({
  target,
  onClose,
  onRemoved,
  onStale,
}: {
  target: AccessTarget
  onClose: () => void
  onRemoved: () => void
  onStale: () => void
}) {
  const t = useErpUiT()
  const provider = useErpAuthProvider()
  const apiMessage = useApiErrorMessage()
  const { guard, dialog: reauthDialog } = useReauth()
  const { data: me } = useMe()
  const companyId = useCompanyId()
  const company = me?.companies.find((item) => item.id === companyId)?.name

  return (
    <ConfirmDialog
      open
      title={
        company
          ? t("userAccess.removeTitleIn", { name: target.name, company })
          : t("userAccess.removeTitle", { name: target.name })
      }
      description={t("userAccess.removeDescription")}
      confirmLabel={t("userAccess.removeFromCompany")}
      destructive
      lockWhileBusy
      onClose={onClose}
      onConfirm={() =>
        // Двома аргументами: збій у колбеку після успіху — не збій вилучення.
        guard(() => provider.admin.removeFromCompany(target.id)).then(
          () => {
            toast.success(t("userAccess.removed", { name: target.name }))
            onRemoved()
          },
          (failure: unknown) => {
            if (isApiError(failure) && failure.code === "not_found") {
              toast.info(t("userAccess.removedAlready", { name: target.name }))
              onRemoved()
              return
            }
            toast.error(
              isReauthCancelled(failure)
                ? t("auth.reauth.cancelled")
                : apiMessage(failure),
            )
            if (
              isApiError(failure) &&
              !isReauthRequired(failure) &&
              (failure.status === 403 || failure.status === 409)
            )
              onStale()
          },
        )
      }
    >
      {reauthDialog}
    </ConfirmDialog>
  )
}
