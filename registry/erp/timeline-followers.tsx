import * as React from "react"
import { BellIcon, BellOffIcon, UsersIcon, XIcon } from "lucide-react"
import { toast } from "sonner"

import { RecordPicker } from "@/registry/erp/record-picker"
import { useApiErrorMessage } from "@/registry/hooks/use-api-error-message"
import { useMe } from "@/registry/hooks/use-me"
import {
  useTimelineFollowers,
  type TimelineActions,
} from "@/registry/hooks/use-timeline"
import { announce } from "@/registry/lib/announce"
import { useErpUiT } from "@/registry/lib/i18n"
import type { TimelineTarget } from "@/registry/lib/timeline"
import { Button } from "@/registry/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/registry/ui/dialog"
import { Field, FieldLabel } from "@/registry/ui/field"
import { Spinner } from "@/registry/ui/spinner"

/**
 * Підписники запису (PF05, ADR-0053): «Стежити» й список людей у діалозі. Діалог, а не спливне вікно:
 * вибір колеги на телефоні відкривається шторкою, а вона закривала б спливне вікно. Хто саме отримує
 * сповіщення, вирішує сервер проекту.
 */
interface TeamMember {
  id: string
  name?: string
}

function FollowersDialog({
  followers,
  meId,
  actions,
  readOnly,
  onClose,
}: {
  followers: readonly { id: string; name: string }[]
  meId: string | undefined
  actions: TimelineActions
  readOnly: boolean
  onClose: () => void
}) {
  const t = useErpUiT()
  const errorText = useApiErrorMessage()
  const pickerId = React.useId()
  const run = (action: Promise<void>) => {
    action.catch((failure: unknown) => {
      toast.error(errorText(failure))
    })
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("timeline.followers.title")}</DialogTitle>
          <DialogDescription>
            {t("timeline.followers.description")}
          </DialogDescription>
        </DialogHeader>
        {followers.length ? (
          <ul className="divide-y rounded-lg border">
            {followers.map((person) => (
              <li
                key={person.id}
                className="flex min-h-11 items-center justify-between gap-2 px-3 py-1 text-sm"
              >
                <span className="min-w-0 break-words">
                  <bdi>{person.name}</bdi>
                  {person.id === meId
                    ? ` (${t("timeline.followers.you")})`
                    : null}
                </span>
                {readOnly ? null : (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("timeline.followers.remove", {
                      name: person.name,
                    })}
                    onClick={() => {
                      run(actions.unfollow(person.id))
                    }}
                  >
                    <XIcon aria-hidden />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t("timeline.followers.empty")}
          </p>
        )}
        {readOnly ? null : (
          <Field>
            <FieldLabel htmlFor={pickerId}>
              {t("timeline.followers.add")}
            </FieldLabel>
            <RecordPicker<TeamMember>
              id={pickerId}
              resource="users"
              label={t("timeline.followers.add")}
              optionLabel={(member) => member.name ?? member.id}
              value={null}
              onValueChange={(id) => {
                if (id) run(actions.follow(id))
              }}
            />
          </Field>
        )}
      </DialogContent>
    </Dialog>
  )
}

export function TimelineFollowers({
  target,
  actions,
  readOnly,
}: {
  target: TimelineTarget
  actions: TimelineActions
  readOnly: boolean
}) {
  const t = useErpUiT()
  const errorText = useApiErrorMessage()
  const { data: me } = useMe()
  const query = useTimelineFollowers(target)
  const [isOpen, setIsOpen] = React.useState(false)
  const [isBusy, setIsBusy] = React.useState(false)
  const followers = query.data ?? []
  const isFollowing = followers.some((person) => person.id === me?.id)

  const toggle = async () => {
    if (!me) return
    setIsBusy(true)
    try {
      await (isFollowing ? actions.unfollow(me.id) : actions.follow(me.id))
      announce(
        t(
          isFollowing
            ? "timeline.followers.unfollowed"
            : "timeline.followers.followed",
        ),
      )
    } catch (failure) {
      toast.error(errorText(failure))
    } finally {
      setIsBusy(false)
    }
  }

  if (query.isError && !query.data)
    return (
      <div role="alert" className="flex flex-wrap items-center gap-2 text-sm">
        <span>{t("timeline.followers.failed")}</span>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            void query.refetch()
          }}
        >
          {t("pageState.error.retry")}
        </Button>
      </div>
    )

  const Icon = isFollowing ? BellOffIcon : BellIcon
  return (
    <div data-slot="timeline-followers" className="flex flex-wrap gap-2">
      {readOnly || !me ? null : (
        <Button
          size="sm"
          variant="outline"
          disabled={isBusy || query.isPending}
          focusableWhenDisabled
          onClick={() => {
            void toggle()
          }}
        >
          {isBusy ? <Spinner aria-hidden /> : <Icon aria-hidden />}
          {t(
            isFollowing
              ? "timeline.followers.unfollow"
              : "timeline.followers.follow",
          )}
        </Button>
      )}
      <Button
        size="sm"
        variant="outline"
        disabled={query.isPending}
        focusableWhenDisabled
        onClick={() => {
          setIsOpen(true)
        }}
      >
        <UsersIcon aria-hidden />
        {t("timeline.followers.open", { count: followers.length })}
      </Button>
      {isOpen ? (
        <FollowersDialog
          followers={followers}
          meId={me?.id}
          actions={actions}
          readOnly={readOnly}
          onClose={() => {
            setIsOpen(false)
          }}
        />
      ) : null}
    </div>
  )
}
