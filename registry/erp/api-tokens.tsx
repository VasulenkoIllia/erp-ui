"use client"

import * as React from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { KeyRoundIcon, PlusIcon } from "lucide-react"
import { toast } from "sonner"

import {
  useAuthErrorText,
  useErpAuthProvider,
  useFieldError,
} from "@/registry/erp/auth-layout"
import { CopyButton } from "@/registry/erp/copy-button"
import { PageState, SectionSkeleton } from "@/registry/erp/page-state"
import { useReauth } from "@/registry/erp/reauth-dialog"
import {
  ACCOUNT_QUERY_KEYS,
  API_TOKEN_EXPIRY_DAYS,
  type ApiToken,
  type ApiTokenCreated,
  type ApiTokenScope,
} from "@/registry/lib/account"
import { useFormat } from "@/registry/lib/format"
import { useErpUiT } from "@/registry/lib/i18n"
import { Alert, AlertDescription } from "@/registry/ui/alert"
import { Badge } from "@/registry/ui/badge"
import { Button } from "@/registry/ui/button"
import { Checkbox } from "@/registry/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/registry/ui/dialog"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/registry/ui/field"
import { Input } from "@/registry/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/registry/ui/select"
import { Spinner } from "@/registry/ui/spinner"

/**
 * Персональні токени API (ADR-0012): для інтеграцій і скриптів (1С, банк, звіти). Токен діє від імені
 * користувача з обраними правами (не ширшими за його власні) і показується лише один раз.
 * Створення — після повторного підтвердження.
 */

type Expiry = (typeof API_TOKEN_EXPIRY_DAYS)[number]
const expiryKey = (days: Expiry) =>
  days === null ? "never" : (String(days) as `${NonNullable<Expiry>}`)

export function ApiTokensSection() {
  const t = useErpUiT()
  const provider = useErpAuthProvider()
  const queryClient = useQueryClient()
  const errorText = useAuthErrorText()
  const format = useFormat()
  const { guard, dialog: reauthDialog } = useReauth()
  const [creating, setCreating] = React.useState(false)
  const [created, setCreated] = React.useState<ApiTokenCreated | null>(null)
  const [revoking, setRevoking] = React.useState<ApiToken | null>(null)
  // Момент показу списку: прострочені токени позначаються відносно нього.
  const [now] = React.useState(() => Date.now())
  const query = useQuery({
    queryKey: ACCOUNT_QUERY_KEYS.apiTokens,
    queryFn: () => provider.account.getApiTokens(),
  })
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ACCOUNT_QUERY_KEYS.apiTokens })

  if (query.isPending) return <SectionSkeleton rows={2} />
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

  const { tokens, scopes } = query.data
  const scopeLabel = (id: string) => {
    const scope = scopes.find((item) => item.id === id)
    return scope ? `${scope.group}: ${scope.label}` : id
  }

  return (
    <div className="@container space-y-4" data-slot="api-tokens-section">
      {tokens.length ? (
        <ul
          className="divide-y rounded-lg border"
          aria-label={t("apiTokens.title")}
        >
          {tokens.map((token) => {
            const expired =
              token.expiresAt !== null && Date.parse(token.expiresAt) < now
            return (
              <li
                key={token.id}
                className="flex flex-col gap-3 p-3 @md:flex-row @md:items-center"
              >
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <KeyRoundIcon aria-hidden className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {token.name}
                      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                        {token.prefix}
                      </code>
                      {expired ? (
                        <Badge variant="warning">
                          {t("apiTokens.expired")}
                        </Badge>
                      ) : null}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {[
                        t("apiTokens.created", {
                          date: format.date(token.createdAt, "medium"),
                        }),
                        token.expiresAt
                          ? t("apiTokens.expires", {
                              date: format.date(token.expiresAt, "medium"),
                            })
                          : t("apiTokens.noExpiry"),
                        token.lastUsedAt
                          ? t("apiTokens.lastUsed", {
                              when: format.relative(token.lastUsedAt),
                            })
                          : t("apiTokens.neverUsed"),
                      ].join(" · ")}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {token.scopes.map(scopeLabel).join(", ")}
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="self-start @md:self-center"
                  aria-label={t("apiTokens.revokeFor", { name: token.name })}
                  onClick={() => {
                    setRevoking(token)
                  }}
                >
                  {t("apiTokens.revoke")}
                </Button>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{t("apiTokens.empty")}</p>
      )}
      <Button
        variant="outline"
        disabled={!scopes.length}
        onClick={() => {
          setCreating(true)
        }}
      >
        <PlusIcon aria-hidden />
        {t("apiTokens.create")}
      </Button>

      {creating ? (
        <CreateTokenDialog
          scopes={scopes}
          create={(data) => guard(() => provider.account.createApiToken(data))}
          onClose={() => {
            setCreating(false)
          }}
          onCreated={(result) => {
            setCreating(false)
            setCreated(result)
            void refresh()
          }}
        >
          {reauthDialog}
        </CreateTokenDialog>
      ) : (
        reauthDialog
      )}

      <Dialog
        open={created !== null}
        onOpenChange={(next) => {
          if (!next) setCreated(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("apiTokens.createdTitle")}</DialogTitle>
            <DialogDescription>
              {t("apiTokens.createdDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <p className="text-sm font-medium">{t("apiTokens.tokenLabel")}</p>
            <div className="flex items-center gap-2">
              <code
                data-slot="api-token-value"
                className="min-w-0 flex-1 rounded-md bg-muted px-2 py-1.5 font-mono text-sm break-all"
              >
                {created?.token}
              </code>
              <CopyButton
                value={created?.token ?? ""}
                label={t("apiTokens.copy")}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              onClick={() => {
                setCreated(null)
              }}
            >
              {t("apiTokens.done")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={revoking !== null}
        onOpenChange={(next) => {
          if (!next) setRevoking(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("apiTokens.revokeTitle", { name: revoking?.name ?? "" })}
            </DialogTitle>
            <DialogDescription>
              {t("apiTokens.revokeDescription")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setRevoking(null)
              }}
            >
              {t("auth.account.cancel")}
            </Button>
            <RevokeButton
              onRevoke={() => {
                if (!revoking) return Promise.resolve()
                return provider.account.revokeApiToken(revoking.id).then(
                  () => {
                    setRevoking(null)
                    toast.success(t("apiTokens.revoked"))
                    return refresh()
                  },
                  (failure: unknown) => {
                    toast.error(errorText(failure))
                  },
                )
              }}
            />
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function RevokeButton({ onRevoke }: { onRevoke: () => Promise<unknown> }) {
  const t = useErpUiT()
  const [busy, setBusy] = React.useState(false)
  return (
    <Button
      type="button"
      variant="destructive"
      disabled={busy}
      onClick={() => {
        setBusy(true)
        void onRevoke().finally(() => {
          setBusy(false)
        })
      }}
    >
      {busy ? <Spinner aria-hidden /> : null}
      {t("apiTokens.revoke")}
    </Button>
  )
}

function CreateTokenDialog({
  scopes,
  create,
  onClose,
  onCreated,
  children,
}: {
  scopes: ApiTokenScope[]
  create: (data: {
    name: string
    scopes: string[]
    expiresInDays: number | null
  }) => Promise<ApiTokenCreated>
  onClose: () => void
  onCreated: (result: ApiTokenCreated) => void
  children?: React.ReactNode
}) {
  const t = useErpUiT()
  const fieldError = useFieldError()
  const errorText = useAuthErrorText()
  const ids = React.useId()
  const [name, setName] = React.useState("")
  const [expiry, setExpiry] = React.useState<Expiry>(90)
  const [selected, setSelected] = React.useState<string[]>([])
  const [fields, setFields] = React.useState<{
    name?: string
    scopes?: string
  }>({})
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const groups = [...new Set(scopes.map((scope) => scope.group))]
  const expiryItems = API_TOKEN_EXPIRY_DAYS.map((days) => ({
    value: expiryKey(days),
    label: t(`apiTokens.expiry.${expiryKey(days)}`),
  }))

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <form
          className="grid gap-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            const local: typeof fields = {}
            if (!name.trim()) local.name = t("auth.fieldErrors.required")
            if (!selected.length) local.scopes = t("apiTokens.scopesRequired")
            setFields(local)
            if (Object.keys(local).length) return
            setBusy(true)
            setError(null)
            create({
              name: name.trim(),
              scopes: selected,
              expiresInDays: expiry,
            })
              .then(onCreated)
              .catch((failure: unknown) => {
                const message = fieldError(failure, "name")
                if (message) setFields({ name: message })
                else if (failure) setError(errorText(failure))
              })
              .finally(() => {
                setBusy(false)
              })
          }}
        >
          <DialogHeader>
            <DialogTitle>{t("apiTokens.createTitle")}</DialogTitle>
            <DialogDescription>{t("apiTokens.description")}</DialogDescription>
          </DialogHeader>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <Field data-invalid={fields.name ? true : undefined}>
            <FieldLabel htmlFor={`${ids}-name`}>
              {t("apiTokens.nameLabel")}
            </FieldLabel>
            <Input
              id={`${ids}-name`}
              value={name}
              maxLength={64}
              autoComplete="off"
              aria-invalid={fields.name ? true : undefined}
              aria-describedby={`${ids}-name-hint${fields.name ? ` ${ids}-name-error` : ""}`}
              onChange={(event) => {
                setName(event.target.value)
              }}
            />
            <FieldDescription id={`${ids}-name-hint`}>
              {t("apiTokens.nameHint")}
            </FieldDescription>
            {fields.name ? (
              <FieldError id={`${ids}-name-error`}>{fields.name}</FieldError>
            ) : null}
          </Field>
          <Field>
            <FieldLabel htmlFor={`${ids}-expiry`}>
              {t("apiTokens.expiryLabel")}
            </FieldLabel>
            <Select
              items={expiryItems}
              value={expiryKey(expiry)}
              onValueChange={(value: string | null) => {
                setExpiry(
                  value === "never" || !value
                    ? null
                    : (Number(value) as Expiry),
                )
              }}
            >
              <SelectTrigger id={`${ids}-expiry`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {expiryItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <FieldSet
            data-invalid={fields.scopes ? true : undefined}
            aria-describedby={`${ids}-scopes-hint${fields.scopes ? ` ${ids}-scopes-error` : ""}`}
          >
            <FieldLegend variant="label">
              {t("apiTokens.scopesLabel")}
            </FieldLegend>
            <FieldDescription id={`${ids}-scopes-hint`}>
              {t("apiTokens.scopesHint")}
            </FieldDescription>
            <div className="grid gap-3 sm:grid-cols-2">
              {groups.map((group, index) => (
                <div
                  key={group}
                  role="group"
                  aria-labelledby={`${ids}-group-${String(index)}`}
                  className="space-y-2"
                >
                  <p
                    id={`${ids}-group-${String(index)}`}
                    className="text-sm font-medium"
                  >
                    {group}
                  </p>
                  {scopes
                    .filter((scope) => scope.group === group)
                    .map((scope) => {
                      const checkboxId = `${ids}-${scope.id}`
                      return (
                        <Field key={scope.id} orientation="horizontal">
                          <Checkbox
                            id={checkboxId}
                            checked={selected.includes(scope.id)}
                            onCheckedChange={(checked) => {
                              setSelected((current) =>
                                checked
                                  ? [...current, scope.id]
                                  : current.filter((id) => id !== scope.id),
                              )
                              setFields((current) => ({
                                ...current,
                                scopes: undefined,
                              }))
                            }}
                          />
                          <FieldLabel
                            htmlFor={checkboxId}
                            className="font-normal"
                          >
                            {scope.label}
                          </FieldLabel>
                        </Field>
                      )
                    })}
                </div>
              ))}
            </div>
            {fields.scopes ? (
              <FieldError id={`${ids}-scopes-error`}>
                {fields.scopes}
              </FieldError>
            ) : null}
          </FieldSet>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t("auth.account.cancel")}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? <Spinner aria-hidden /> : null}
              {t("apiTokens.create")}
            </Button>
          </DialogFooter>
        </form>
        {children}
      </DialogContent>
    </Dialog>
  )
}
