import { useQuery, useQueryClient } from "@tanstack/react-query"
import * as React from "react"
import { toast } from "sonner"

import {
  useAuthErrorText,
  useErpAuthProvider,
} from "@/registry/erp/auth-layout"
import { PageState, SectionSkeleton } from "@/registry/erp/page-state"
import { useMe } from "@/registry/hooks/use-me"
import { isApiError } from "@/registry/lib/api"
import { useErpUiT } from "@/registry/lib/i18n"
import {
  devicePushState,
  disableDevicePush,
  enableDevicePush,
  sendDevicePushTest,
  type DevicePushState,
} from "@/registry/lib/push-device"
import type { PushApi } from "@/registry/lib/web-push"
import { Alert, AlertDescription, AlertTitle } from "@/registry/ui/alert"
import { Button } from "@/registry/ui/button"
import { Spinner } from "@/registry/ui/spinner"

const STATE_KEY = ["erp-ui", "push-device"] as const

type Action = "enable" | "disable" | "test"

/** Бекенд без адрес push не має ключа: кнопка лише показала б помилку, тож блоку немає. */
async function sectionState(
  push: PushApi,
): Promise<DevicePushState | "unavailable"> {
  const isMissing = await push.publicKey().then(
    () => false,
    (error: unknown) => isApiError(error) && error.status === 404,
  )
  return isMissing ? "unavailable" : devicePushState()
}

/**
 * Web push на цьому пристрої (ADR-0046, PF19): увімкнути, вимкнути, надіслати перевірку. Стан
 * залежить від браузера, а не від налаштувань людини: «Чи показувати» вибирають у таблиці каналів,
 * «чи може цей пристрій» видно тут. Під час «Увійти як…» пристрій адміністратора не стає пристроєм
 * цієї людини, тож кнопок немає.
 */
export function PushDeviceSection() {
  const t = useErpUiT()
  const provider = useErpAuthProvider()
  const queryClient = useQueryClient()
  const errorText = useAuthErrorText()
  const me = useMe().data
  const [running, setRunning] = React.useState<Action | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const titleId = React.useId()
  const push = provider.inbox.push
  // Дозвіл міг змінитись у налаштуваннях браузера: щоразу свіжий стан. Стан читаємо з браузера, тож
  // без мережі запит не стає на паузу, інакше скелетон лишився б назавжди.
  const query = useQuery({
    queryKey: STATE_KEY,
    queryFn: () => sectionState(push),
    staleTime: 0,
    networkMode: "always",
  })

  if (query.isPending) return <SectionSkeleton rows={1} />
  if (query.isError)
    return (
      <PageState
        kind="error"
        className="min-h-32"
        onRetry={() => {
          void query.refetch()
        }}
      />
    )
  const state = query.data
  if (state === "unavailable") return null
  const userId = me?.impersonator ? undefined : me?.id

  const run = (action: Action, work: () => Promise<unknown>) => {
    setRunning(action)
    setError(null)
    work()
      .catch((failure: unknown) => {
        setError(isApiError(failure) ? errorText(failure) : t("push.failed"))
      })
      .finally(() => {
        setRunning(null)
        // І після збою: дія могла дійти до половини.
        void queryClient.invalidateQueries({ queryKey: STATE_KEY })
      })
  }

  const button = (
    action: Action,
    label: string,
    work: () => Promise<unknown>,
  ) => (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={running !== null}
      focusableWhenDisabled
      aria-busy={running === action}
      onClick={() => {
        run(action, work)
      }}
    >
      {running === action ? <Spinner aria-hidden /> : null}
      {label}
    </Button>
  )

  return (
    <Alert data-slot="push-device" role="group" aria-labelledby={titleId}>
      <AlertTitle id={titleId}>{t("push.title")}</AlertTitle>
      <AlertDescription className="space-y-2">
        <p role="status">{t(`push.${state}`)}</p>
        {me?.impersonator ? <p>{t("push.impersonated")}</p> : null}
        {userId && (state === "off" || state === "on") ? (
          <div className="flex flex-wrap gap-2">
            {/* Той самий вузол міняє підпис: фокус лишається на кнопці після дії. */}
            {state === "on"
              ? button("disable", t("push.disable"), () =>
                  disableDevicePush(push),
                )
              : button("enable", t("push.enable"), () =>
                  enableDevicePush(push, userId).then((next) => {
                    // Вікно дозволу закрили: без слова кнопка здавалась би мертвою.
                    if (next === "off") setError(t("push.notGranted"))
                  }),
                )}
            {state === "on"
              ? button("test", t("push.test"), () =>
                  sendDevicePushTest(push).then(() => {
                    toast.success(t("push.testSent"))
                  }),
                )
              : null}
          </div>
        ) : null}
        {error ? (
          <p role="alert" className="text-destructive-foreground">
            {error}
          </p>
        ) : null}
      </AlertDescription>
    </Alert>
  )
}
