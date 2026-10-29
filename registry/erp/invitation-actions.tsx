import * as React from "react"
import { toast } from "sonner"

import {
  useAuthErrorText,
  useErpAuthProvider,
} from "@/registry/erp/auth-layout"
import { DeniedAction } from "@/registry/erp/permission-gate"
import { useRolesCeiling } from "@/registry/erp/user-access-data"
import { isApiError } from "@/registry/lib/api"
import { useErpUiT } from "@/registry/lib/i18n"
import type { Invitation } from "@/registry/lib/invitations"
import { Button } from "@/registry/ui/button"
import { Spinner } from "@/registry/ui/spinner"

/** Що показати діям запрошення: причину відмови й чи ще перевіряємо (ADR-0035). */
export interface InvitationCeiling {
  /** Профіль чи каталог ролей ще вантажиться: дії неактивні, не міняються під пальцем. */
  checking: boolean
  /** Причина, коли ролі запрошення дають права понад свої; інакше `undefined`. */
  deniedReason: (invitation: Pick<Invitation, "roles">) => string | undefined
}

/**
 * «Стеля» повтору й відкликання (ADR-0035): запрошення з роллю, що дає права, яких немає в того,
 * хто діє, сервер не повторить і не відкличе (403). Рахуємо за каталогом ролей (`roles:read`), як
 * «стелю» доступу (ADR-0034); без каталогу — без причини, відмову сервера показує тост.
 */
export function useInvitationCeiling(): InvitationCeiling {
  const t = useErpUiT()
  const ceiling = useRolesCeiling()
  return {
    checking: ceiling.checking,
    deniedReason: ({ roles }) =>
      ceiling.exceeds(roles) ? t("invitations.beyondCeiling") : undefined,
  }
}

/**
 * «Надіслати ще раз» і «Відкликати» для одного запрошення (ADR-0014, ADR-0035). З `deniedReason`
 * обидві дії неактивні, у фокусі й з причиною в описі (SPEC §8.4); видимим текстом причину
 * показує рядок запрошення. `checking` — неактивні без причини, поки «стеля» невідома.
 */
export function InvitationActions({
  invitation,
  busy = false,
  checking = false,
  deniedReason,
  onResend,
  onRevoke,
}: {
  invitation: Pick<Invitation, "email">
  /** Повтор цього запрошення ще йде. */
  busy?: boolean
  checking?: boolean
  deniedReason?: string
  onResend: () => void
  onRevoke: () => void
}) {
  const t = useErpUiT()
  const resendLabel = t("invitations.resendFor", { email: invitation.email })
  const revokeLabel = t("invitations.revokeFor", { email: invitation.email })
  if (deniedReason)
    return (
      <>
        <DeniedAction reason={deniedReason} size="sm" aria-label={resendLabel}>
          {t("invitations.resend")}
        </DeniedAction>
        <DeniedAction
          reason={deniedReason}
          variant="ghost"
          size="sm"
          aria-label={revokeLabel}
        >
          {t("invitations.revoke")}
        </DeniedAction>
      </>
    )
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        disabled={busy || checking}
        // Під час запиту кнопка лишається у фокусі: клавіатура не втрачає місця в списку.
        focusableWhenDisabled={busy}
        aria-busy={busy || undefined}
        aria-label={resendLabel}
        onClick={onResend}
      >
        {busy ? <Spinner aria-hidden /> : null}
        {t("invitations.resend")}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        disabled={checking}
        aria-label={revokeLabel}
        onClick={onRevoke}
      >
        {t("invitations.revoke")}
      </Button>
    </>
  )
}

/**
 * Повтор і відкликання запрошень списку (ADR-0035): які повтори ще йдуть (кожне запрошення
 * окремо), що відкликаємо, відмови сервера. `refresh` — перечитати список; 404 і 409 — тост
 * «щойно змінилось» і свіжий список, 422 повтору — роль запрошення вже видалили.
 */
export function useInvitationActions(refresh: () => Promise<unknown>) {
  const t = useErpUiT()
  const provider = useErpAuthProvider()
  const errorText = useAuthErrorText()
  const [resending, setResending] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  )
  // Що відкликаємо: запрошення лишається й під час закриття діалогу, щоб заголовок не блимав.
  const [revoking, setRevoking] = React.useState<Invitation | null>(null)
  const [revokeOpen, setRevokeOpen] = React.useState(false)

  /** Відмова сервера; запрошення змінилось чи зникло — проміс свіжого списку, інакше `null`. */
  const failed = (failure: unknown): Promise<unknown> | null => {
    if (
      isApiError(failure) &&
      (failure.status === 404 || failure.status === 409)
    ) {
      toast.info(t("invitations.changed"))
      return refresh()
    }
    // Полів, біля яких показати 422 повтору, тут немає: роль запрошення вже видалили.
    toast.error(
      isApiError(failure) && failure.status === 422
        ? t("invitations.roleGone")
        : errorText(failure),
    )
    return null
  }
  const markResending = (id: string, on: boolean) => {
    setResending((current) => {
      const next = new Set(current)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }

  return {
    resending,
    revoking,
    revokeOpen,
    resend: (invitation: Pick<Invitation, "id">) => {
      if (resending.has(invitation.id)) return
      markResending(invitation.id, true)
      provider.invitations
        .resend(invitation.id)
        .then(() => {
          toast.success(t("invitations.resent"))
          return refresh()
        })
        .catch(failed)
        .finally(() => {
          markResending(invitation.id, false)
        })
    },
    askRevoke: (invitation: Invitation) => {
      setRevoking(invitation)
      setRevokeOpen(true)
    },
    closeRevoke: () => {
      setRevokeOpen(false)
    },
    /**
     * Діалог закривається лише після свіжого списку: інакше на повільній відповіді фокус
     * повернувся б на «Відкликати» рядка, який за мить зникне, і впав би на початок сторінки.
     */
    confirmRevoke: () => {
      if (!revoking) return
      return provider.invitations
        .revoke(revoking.id)
        .then(async () => {
          toast.success(t("invitations.revoked"))
          await refresh()
          setRevokeOpen(false)
        })
        .catch(async (failure: unknown) => {
          const changed = failed(failure)
          if (!changed) return
          await changed
          setRevokeOpen(false)
        })
    },
  }
}
