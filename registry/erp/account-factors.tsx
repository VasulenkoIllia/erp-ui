import * as React from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { EllipsisVerticalIcon, KeyRoundIcon } from "lucide-react"
import { toast } from "sonner"

import {
  useAuthErrorText,
  useErpAuthProvider,
  useFieldError,
} from "@/registry/erp/auth-layout"
import { ConfirmDialog } from "@/registry/erp/confirm-dialog"
import {
  BackupCodesDialog,
  FACTOR_ICONS,
  useFactorSetup,
  type PhoneField,
} from "@/registry/erp/factor-setup"
import { PageState, SectionSkeleton } from "@/registry/erp/page-state"
import { PhoneInput } from "@/registry/erp/phone-input"
import { useReauth } from "@/registry/erp/reauth-dialog"
import {
  ACCOUNT_QUERY_KEYS,
  type Factor,
  type FactorEnrolled,
} from "@/registry/lib/account"
import { useFormat } from "@/registry/lib/format"
import { useErpUiT } from "@/registry/lib/i18n"
import { passkeysSupported } from "@/registry/lib/passkey"
import { validatePhone } from "@/registry/lib/phone"
import { Alert, AlertDescription, AlertTitle } from "@/registry/ui/alert"
import { Button } from "@/registry/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/registry/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/registry/ui/dropdown-menu"
import { Field, FieldError, FieldLabel } from "@/registry/ui/field"
import { Input } from "@/registry/ui/input"
import { Spinner } from "@/registry/ui/spinner"

/**
 * Способи підтвердження входу в налаштуваннях (PF01, ADR-0011): список факторів, налаштування
 * застосунку (QR), телефону, email і ключів доступу, перейменування й вимкнення, резервні коди.
 * Зміни — після повторного підтвердження (`useReauth`); перший фактор приносить резервні коди,
 * які показуємо один раз.
 */

/** Телефон у налаштуваннях — з маскою й перевіркою країн (LC12). */
const PHONE_FIELD: PhoneField = { Input: PhoneInput, validate: validatePhone }

type Open =
  | { kind: "rename"; factor: Factor }
  | { kind: "remove"; factor: Factor; last: boolean }
  | { kind: "regenerate" }

export function FactorsSection() {
  const t = useErpUiT()
  const provider = useErpAuthProvider()
  const queryClient = useQueryClient()
  const errorText = useAuthErrorText()
  const format = useFormat()
  const { guard, dialog: reauthDialog } = useReauth()
  const [open, setOpen] = React.useState<Open | null>(null)
  const [codes, setCodes] = React.useState<string[] | null>(null)
  const query = useQuery({
    queryKey: ACCOUNT_QUERY_KEYS.security,
    queryFn: () => provider.account.getSecurity(),
  })

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ACCOUNT_QUERY_KEYS.security })

  /** Фактор додано: оновити список, показати резервні коди, якщо прийшли. */
  const enrolled = (result: FactorEnrolled) => {
    void refresh()
    toast.success(t("auth.factors.enabled"))
    if (result.backupCodes) setCodes(result.backupCodes)
  }

  const fail = (failure: unknown) => {
    // Скасоване повторне підтвердження — не помилка, лише відмова від дії.
    if (failure) toast.error(errorText(failure))
  }

  const label = (factor: Factor) =>
    factor.name ?? t(`auth.factors.types.${factor.type}`)

  const setup = useFactorSetup({
    guard,
    phone: PHONE_FIELD,
    onEnrolled: enrolled,
    onError: fail,
    nested: reauthDialog,
  })

  if (query.isPending) return <SectionSkeleton rows={3} />
  if (query.isError)
    return (
      <PageState
        kind="error"
        className="min-h-40"
        onRetry={() => {
          void query.refetch()
        }}
      />
    )

  const security = query.data
  const present = new Set(security.factors.map((f) => f.type))
  const addable = security.available.filter(
    (type) =>
      (type === "passkey" ? passkeysSupported() : true) &&
      (type === "passkey" || !present.has(type)),
  )
  // Діалог відкрито — повторне підтвердження показуємо всередині нього (вкладений діалог).
  const nested = open ? reauthDialog : null
  const busy = setup.busy

  return (
    <div className="@container space-y-4" data-slot="factors-section">
      {security.factors.length === 0 ? (
        <Alert variant="warning" role="note">
          <AlertTitle>{t("auth.factors.off")}</AlertTitle>
          <AlertDescription>{t("auth.factors.offHint")}</AlertDescription>
        </Alert>
      ) : security.twoFactorRequired ? (
        <p className="text-sm text-muted-foreground">
          {t("auth.factors.required")}
        </p>
      ) : null}

      {security.factors.length ? (
        <ul
          className="divide-y rounded-lg border"
          aria-label={t("auth.factors.title")}
        >
          {security.factors.map((factor) => {
            const Icon = FACTOR_ICONS[factor.type]
            const name = label(factor)
            const renamable =
              factor.type === "passkey" || factor.type === "totp"
            return (
              <li key={factor.id} className="flex items-center gap-3 p-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  <Icon aria-hidden className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{name}</p>
                  <p className="text-sm text-muted-foreground">
                    {[
                      factor.name ? t(`auth.factors.types.${factor.type}`) : "",
                      factor.destination ?? "",
                      t("auth.factors.added", {
                        date: format.date(factor.createdAt, "medium"),
                      }),
                      factor.lastUsedAt
                        ? t("auth.factors.lastUsed", {
                            when: format.relative(factor.lastUsedAt),
                          })
                        : t("auth.factors.neverUsed"),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("auth.factors.actions", { name })}
                      />
                    }
                  >
                    <EllipsisVerticalIcon aria-hidden />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {renamable ? (
                      <DropdownMenuItem
                        onClick={() => {
                          setOpen({ kind: "rename", factor })
                        }}
                      >
                        {t("auth.factors.rename")}
                      </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => {
                        setOpen({
                          kind: "remove",
                          factor,
                          last: security.factors.length === 1,
                        })
                      }}
                    >
                      {t("auth.factors.remove")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            )
          })}
        </ul>
      ) : null}

      {security.backupCodes ? (
        <div className="flex flex-col gap-3 rounded-lg border p-3 @md:flex-row @md:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <KeyRoundIcon aria-hidden className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-medium">{t("auth.factors.backup.title")}</p>
              <p className="text-sm text-muted-foreground">
                {security.backupCodes.remaining
                  ? t("auth.factors.backup.remaining", {
                      count: security.backupCodes.remaining,
                      total: security.backupCodes.total,
                    })
                  : t("auth.factors.backup.none")}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            className="self-start @md:self-center"
            onClick={() => {
              setOpen({ kind: "regenerate" })
            }}
          >
            {t("auth.factors.backup.regenerate")}
          </Button>
        </div>
      ) : null}

      {addable.length ? (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">{t("auth.factors.addTitle")}</h3>
          <div className="flex flex-wrap gap-2">
            {addable.map((type) => {
              const Icon = FACTOR_ICONS[type]
              return (
                <Button
                  key={type}
                  variant="outline"
                  disabled={busy !== null}
                  onClick={() => {
                    setup.start(type)
                  }}
                >
                  {busy === type ? (
                    <Spinner aria-hidden />
                  ) : (
                    <Icon aria-hidden />
                  )}
                  {t(`auth.factors.add.${type}`)}
                </Button>
              )
            })}
          </div>
        </div>
      ) : null}

      {setup.dialogs}
      {open?.kind === "rename" ? (
        <RenameDialog
          factor={open.factor}
          name={label(open.factor)}
          onClose={() => {
            setOpen(null)
          }}
          onRenamed={() => {
            setOpen(null)
            void refresh()
            toast.success(t("auth.factors.renamed"))
          }}
        />
      ) : null}
      {open?.kind === "remove" ? (
        <ConfirmDialog
          open
          title={t("auth.factors.removeTitle", { name: label(open.factor) })}
          description={
            open.last
              ? t("auth.factors.removeLast")
              : t("auth.factors.removeDescription")
          }
          confirmLabel={t("auth.factors.remove")}
          destructive
          onClose={() => {
            setOpen(null)
          }}
          onConfirm={() => {
            const { factor } = open
            return guard(() => provider.account.removeFactor(factor.id)).then(
              () => {
                setOpen(null)
                void refresh()
                toast.success(t("auth.factors.removed"))
              },
              fail,
            )
          }}
        >
          {nested}
        </ConfirmDialog>
      ) : null}
      {open?.kind === "regenerate" ? (
        <ConfirmDialog
          open
          title={t("auth.factors.backup.regenerateTitle")}
          description={t("auth.factors.backup.regenerateDescription")}
          confirmLabel={t("auth.factors.backup.regenerate")}
          onClose={() => {
            setOpen(null)
          }}
          onConfirm={() =>
            guard(() => provider.account.regenerateBackupCodes()).then(
              (fresh) => {
                setOpen(null)
                void refresh()
                setCodes(fresh)
              },
              fail,
            )
          }
        >
          {nested}
        </ConfirmDialog>
      ) : null}
      <BackupCodesDialog
        codes={codes}
        onClose={() => {
          setCodes(null)
        }}
      />
      {open || setup.open ? null : reauthDialog}
    </div>
  )
}

function RenameDialog({
  factor,
  name: current,
  onClose,
  onRenamed,
}: {
  factor: Factor
  name: string
  onClose: () => void
  onRenamed: () => void
}) {
  const t = useErpUiT()
  const provider = useErpAuthProvider()
  const fieldError = useFieldError()
  const errorText = useAuthErrorText()
  const id = React.useId()
  const [name, setName] = React.useState(factor.name ?? "")
  const [nameError, setNameError] = React.useState<string>()
  const [busy, setBusy] = React.useState(false)

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent>
        <form
          className="grid gap-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            if (!name.trim()) {
              setNameError(t("auth.fieldErrors.required"))
              return
            }
            setBusy(true)
            provider.account
              .renameFactor(factor.id, name.trim())
              .then(onRenamed)
              .catch((failure: unknown) => {
                setNameError(fieldError(failure, "name") ?? errorText(failure))
              })
              .finally(() => {
                setBusy(false)
              })
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {t("auth.factors.renameTitle", { name: current })}
            </DialogTitle>
          </DialogHeader>
          <Field data-invalid={nameError ? true : undefined}>
            <FieldLabel htmlFor={`${id}-name`}>
              {t("auth.factors.nameLabel")}
            </FieldLabel>
            <Input
              id={`${id}-name`}
              value={name}
              maxLength={64}
              autoComplete="off"
              aria-invalid={nameError ? true : undefined}
              aria-describedby={nameError ? `${id}-error` : undefined}
              onChange={(event) => {
                setName(event.target.value)
              }}
            />
            {nameError ? (
              <FieldError id={`${id}-error`}>{nameError}</FieldError>
            ) : null}
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t("auth.account.cancel")}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? <Spinner aria-hidden /> : null}
              {t("auth.factors.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
