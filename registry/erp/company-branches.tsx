import * as React from "react"
import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import {
  useAuthErrorText,
  useErpAuthProvider,
  useFieldError,
} from "@/registry/erp/auth-layout"
import {
  ProfileState,
  useRefreshCompany,
} from "@/registry/erp/company-profile-state"
import { PhoneInput } from "@/registry/erp/phone-input"
import { useCompanyProfile } from "@/registry/hooks/use-company-profile"
import { useHasPermission } from "@/registry/hooks/use-me"
import type { Branch } from "@/registry/lib/company"
import { useErpUiT } from "@/registry/lib/i18n"
import { formatPhone, validatePhone } from "@/registry/lib/phone"
import { Alert, AlertDescription } from "@/registry/ui/alert"
import { Button } from "@/registry/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/registry/ui/dialog"
import { Field, FieldError, FieldLabel } from "@/registry/ui/field"
import { Input } from "@/registry/ui/input"
import { Spinner } from "@/registry/ui/spinner"

type BranchInput = Omit<Branch, "id">

/**
 * Філії компанії: додати, змінити, видалити. `adding` відкриває форму нової філії ззовні (дія в палітрі
 * команд, ADR-0044); `onAddingChange(false)` — форму закрито.
 */
export function CompanyBranchesSection({
  adding = false,
  onAddingChange,
}: {
  adding?: boolean
  onAddingChange?: (adding: boolean) => void
} = {}) {
  const t = useErpUiT()
  const provider = useErpAuthProvider()
  const errorText = useAuthErrorText()
  const refresh = useRefreshCompany()
  const canEdit = useHasPermission("company", "update")
  const query = useCompanyProfile()
  const [editing, setEditing] = React.useState<Branch | "new" | null>(null)
  const [removing, setRemoving] = React.useState<Branch | null>(null)
  const [busy, setBusy] = React.useState(false)
  const isAdding = adding && canEdit
  const closeForm = () => {
    setEditing(null)
    onAddingChange?.(false)
  }

  return (
    <ProfileState query={query} rows={2}>
      {(profile) => (
        <div className="@container space-y-4" data-slot="company-branches">
          {profile.branches.length ? (
            <ul
              className="divide-y rounded-lg border"
              aria-label={t("companySettings.branchesTitle")}
            >
              {profile.branches.map((branch) => (
                <li
                  key={branch.id}
                  className="flex flex-col gap-3 p-3 @lg:flex-row @lg:items-center"
                >
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="text-sm font-medium">
                      {branch.code
                        ? `${branch.name} · ${branch.code}`
                        : branch.name}
                    </p>
                    {branch.address || branch.phone ? (
                      <p className="text-sm text-muted-foreground">
                        {[
                          branch.address,
                          branch.phone ? formatPhone(branch.phone) : "",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    ) : null}
                  </div>
                  {canEdit ? (
                    <div className="flex gap-2 @lg:shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        aria-label={t("companySettings.editBranchFor", {
                          name: branch.name,
                        })}
                        onClick={() => {
                          setEditing(branch)
                        }}
                      >
                        <PencilIcon aria-hidden />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={t("companySettings.removeBranchFor", {
                          name: branch.name,
                        })}
                        onClick={() => {
                          setRemoving(branch)
                        }}
                      >
                        <Trash2Icon aria-hidden />
                      </Button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t("companySettings.branchesEmpty")}
            </p>
          )}
          {canEdit ? (
            <Button
              variant="outline"
              onClick={() => {
                setEditing("new")
              }}
            >
              <PlusIcon aria-hidden />
              {t("companySettings.addBranch")}
            </Button>
          ) : null}

          {editing || isAdding ? (
            <BranchDialog
              branch={!editing || editing === "new" ? null : editing}
              onClose={closeForm}
              onSaved={() => {
                closeForm()
                toast.success(t("companySettings.branchSaved"))
                void refresh()
              }}
            />
          ) : null}

          <Dialog
            open={removing !== null}
            onOpenChange={(next) => {
              if (!next) setRemoving(null)
            }}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {t("companySettings.removeBranchTitle", {
                    name: removing?.name ?? "",
                  })}
                </DialogTitle>
                <DialogDescription>
                  {t("companySettings.removeBranchDescription")}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setRemoving(null)
                  }}
                >
                  {t("auth.account.cancel")}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={busy}
                  onClick={() => {
                    if (!removing) return
                    setBusy(true)
                    provider.company
                      .removeBranch(removing.id)
                      .then(async () => {
                        setRemoving(null)
                        await refresh()
                        toast.success(t("companySettings.branchRemoved"))
                      })
                      .catch((failure: unknown) => {
                        toast.error(errorText(failure))
                      })
                      .finally(() => {
                        setBusy(false)
                      })
                  }}
                >
                  {busy ? <Spinner aria-hidden /> : null}
                  {t("companySettings.remove")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}
    </ProfileState>
  )
}

function BranchDialog({
  branch,
  onClose,
  onSaved,
}: {
  branch: Branch | null
  onClose: () => void
  onSaved: () => void
}) {
  const t = useErpUiT()
  const provider = useErpAuthProvider()
  const errorText = useAuthErrorText()
  const fieldError = useFieldError()
  const ids = React.useId()
  const [values, setValues] = React.useState<Required<BranchInput>>({
    name: branch?.name ?? "",
    code: branch?.code ?? "",
    address: branch?.address ?? "",
    phone: branch?.phone ?? "",
  })
  const [nameError, setNameError] = React.useState<string>()
  const [phoneError, setPhoneError] = React.useState<string>()
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const set = (key: keyof BranchInput) => (value: string) => {
    setValues((current) => ({ ...current, [key]: value }))
  }

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
            const nameIssue = values.name.trim()
              ? undefined
              : t("auth.fieldErrors.required")
            const phoneIssue = values.phone ? validatePhone(values.phone) : null
            setNameError(nameIssue)
            setPhoneError(
              phoneIssue ? t(`validation.phone.${phoneIssue}`) : undefined,
            )
            if (nameIssue || phoneIssue) return
            const input: BranchInput = {
              name: values.name.trim(),
              code: values.code.trim(),
              address: values.address.trim(),
              phone: values.phone.trim(),
            }
            setBusy(true)
            setError(null)
            ;(branch
              ? provider.company.updateBranch(branch.id, input)
              : provider.company.createBranch(input)
            )
              .then(onSaved)
              .catch((failure: unknown) => {
                const message = fieldError(failure, "name")
                if (message) setNameError(message)
                else setError(errorText(failure))
              })
              .finally(() => {
                setBusy(false)
              })
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {branch
                ? t("companySettings.editBranchTitle")
                : t("companySettings.addBranchTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("companySettings.branchesDescription")}
            </DialogDescription>
          </DialogHeader>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <Field data-invalid={nameError ? true : undefined}>
            <FieldLabel htmlFor={`${ids}-name`}>
              {t("companySettings.branchName")}
            </FieldLabel>
            <Input
              id={`${ids}-name`}
              value={values.name}
              maxLength={100}
              autoComplete="off"
              aria-invalid={nameError ? true : undefined}
              aria-describedby={nameError ? `${ids}-name-error` : undefined}
              onChange={(event) => {
                set("name")(event.target.value)
              }}
            />
            {nameError ? (
              <FieldError id={`${ids}-name-error`}>{nameError}</FieldError>
            ) : null}
          </Field>
          <Field>
            <FieldLabel htmlFor={`${ids}-code`}>
              {t("companySettings.branchCode")}
            </FieldLabel>
            <Input
              id={`${ids}-code`}
              value={values.code}
              maxLength={20}
              autoComplete="off"
              onChange={(event) => {
                set("code")(event.target.value)
              }}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${ids}-address`}>
              {t("companySettings.branchAddress")}
            </FieldLabel>
            <Input
              id={`${ids}-address`}
              value={values.address}
              maxLength={300}
              autoComplete="off"
              onChange={(event) => {
                set("address")(event.target.value)
              }}
            />
          </Field>
          <Field data-invalid={phoneError ? true : undefined}>
            <FieldLabel htmlFor={`${ids}-phone`}>
              {t("companySettings.branchPhone")}
            </FieldLabel>
            <PhoneInput
              id={`${ids}-phone`}
              value={values.phone}
              aria-invalid={phoneError ? true : undefined}
              aria-describedby={phoneError ? `${ids}-phone-error` : undefined}
              onValueChange={set("phone")}
            />
            {phoneError ? (
              <FieldError id={`${ids}-phone-error`}>{phoneError}</FieldError>
            ) : null}
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t("auth.account.cancel")}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? <Spinner aria-hidden /> : null}
              {t("companySettings.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
