import * as React from "react"
import { Building2Icon, ImageIcon, Trash2Icon, UploadIcon } from "lucide-react"
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
import { useCompanyProfile } from "@/registry/hooks/use-company-profile"
import { useHasPermission } from "@/registry/hooks/use-me"
import { isApiError } from "@/registry/lib/api"
import {
  COMPANY_IMAGE_MAX_BYTES,
  COMPANY_IMAGE_TYPES,
  type CompanyImage,
  type CompanyProfile,
} from "@/registry/lib/company"
import { useErpUiT } from "@/registry/lib/i18n"
import { Button } from "@/registry/ui/button"
import { FieldError } from "@/registry/ui/field"
import { Spinner } from "@/registry/ui/spinner"

/** Логотип і печатка з підписом: завантажити, замінити, видалити (без обрізання). */
export function CompanyImages() {
  const query = useCompanyProfile()
  return (
    <ProfileState query={query} rows={2}>
      {(profile) => (
        <div className="@container" data-slot="company-images">
          <div className="grid gap-6 @lg:grid-cols-2">
            <ImageField kind="logo" profile={profile} />
            <ImageField kind="stamp" profile={profile} />
          </div>
        </div>
      )}
    </ProfileState>
  )
}

function ImageField({
  kind,
  profile,
}: {
  kind: CompanyImage
  profile: CompanyProfile
}) {
  const t = useErpUiT()
  const provider = useErpAuthProvider()
  const errorText = useAuthErrorText()
  const fieldError = useFieldError()
  const refresh = useRefreshCompany()
  const canEdit = useHasPermission("company", "update")
  const ids = React.useId()
  const input = React.useRef<HTMLInputElement>(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string>()
  const url = kind === "logo" ? profile.logoUrl : profile.stampUrl
  const what = t(`companySettings.${kind}`)

  const run = (action: () => Promise<unknown>, done: string) => {
    setBusy(true)
    setError(undefined)
    action()
      .then(async () => {
        await refresh()
        toast.success(done)
      })
      .catch((failure: unknown) => {
        const code = isApiError(failure) ? failure.fieldErrors?.file : undefined
        if (code === "type") setError(t("companySettings.fileType"))
        else if (code === "tooLarge") setError(t("companySettings.fileSize"))
        else if (code) setError(fieldError(failure, "file") ?? undefined)
        else toast.error(errorText(failure))
      })
      .finally(() => {
        setBusy(false)
      })
  }

  return (
    <div className="space-y-3" data-invalid={error ? true : undefined}>
      <div className="space-y-1">
        <p className="text-sm font-medium" id={`${ids}-label`}>
          {what}
        </p>
        <p className="text-sm text-muted-foreground" id={`${ids}-hint`}>
          {t(`companySettings.${kind}Hint`)}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted">
          {url ? (
            <img
              src={url}
              alt={t("companySettings.imageOf", { what, name: profile.name })}
              className="size-full object-contain p-2"
            />
          ) : kind === "logo" ? (
            <Building2Icon
              aria-hidden
              className="size-8 text-muted-foreground"
            />
          ) : (
            <ImageIcon aria-hidden className="size-8 text-muted-foreground" />
          )}
        </div>
        {canEdit ? (
          <div className="flex flex-wrap gap-2">
            <input
              ref={input}
              type="file"
              accept={COMPANY_IMAGE_TYPES.join(",")}
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ""
                if (!file) return
                if (
                  !(COMPANY_IMAGE_TYPES as readonly string[]).includes(
                    file.type,
                  )
                ) {
                  setError(t("companySettings.fileType"))
                  return
                }
                if (file.size > COMPANY_IMAGE_MAX_BYTES) {
                  setError(t("companySettings.fileSize"))
                  return
                }
                run(
                  () => provider.company.uploadImage(kind, file),
                  t("companySettings.uploaded"),
                )
              }}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              aria-label={
                url
                  ? t("companySettings.replaceFor", { what })
                  : t("companySettings.uploadFor", { what })
              }
              aria-describedby={`${ids}-hint${error ? ` ${ids}-error` : ""}`}
              onClick={() => {
                input.current?.click()
              }}
            >
              {busy ? <Spinner aria-hidden /> : <UploadIcon aria-hidden />}
              {url ? t("companySettings.replace") : t("companySettings.upload")}
            </Button>
            {url ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                aria-label={t("companySettings.removeFor", { what })}
                onClick={() => {
                  run(
                    () => provider.company.removeImage(kind),
                    t("companySettings.removed"),
                  )
                }}
              >
                <Trash2Icon aria-hidden />
                {t("companySettings.remove")}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      {error ? (
        <FieldError id={`${ids}-error`} role="alert">
          {error}
        </FieldError>
      ) : null}
    </div>
  )
}
