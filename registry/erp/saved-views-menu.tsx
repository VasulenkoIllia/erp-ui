import * as React from "react"
import { BookmarkIcon, ChevronDownIcon } from "lucide-react"
import { toast } from "sonner"

import { useUndoToast } from "@/registry/erp/confirm-dialog"
import { ErrorBoundary } from "@/registry/erp/error-boundary"
import { LoadingFallback } from "@/registry/erp/page-state"
import type { SavedViewNameValues } from "@/registry/erp/saved-view-dialog"
import { useApiErrorMessage } from "@/registry/hooks/use-api-error-message"
import {
  STANDARD_VIEW,
  type ListStateApi,
} from "@/registry/hooks/use-list-state"
import type { SavedViewsApi } from "@/registry/hooks/use-saved-views"
import { useErpUiT } from "@/registry/lib/i18n"
import { lazyWithPreload } from "@/registry/lib/lazy"
import type { SavedView } from "@/registry/lib/saved-views"
import { cn } from "@/registry/lib/utils"
import { Button } from "@/registry/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/registry/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/registry/ui/dropdown-menu"

/**
 * Особисті збережені види списку (UI03, PF11; ADR-0017): меню «Вид: …» біля фільтрів.
 *
 * - Вид запам'ятовує вкладку, фільтри, пошук і сортування (`ListStateApi.viewParams`); «змінено» —
 *   стан відрізняється від збереженого. Повторний вибір виду повертає його збережений стан.
 * - «Зберегти зміни у виді», «Зберегти як новий вид…», «Перейменувати…», «Відкривати за
 *   замовчуванням» (для «Стандартного» — зняти позначку з особистого виду).
 * - «Видалити вид» — без діалогу, з «Скасувати» в тості (SPEC §8.2, рівень 1): список лишається
 *   з поточними фільтрами, а «Скасувати» створює вид знову.
 * - Види вантажаться окремим запитом (`useSavedViews`, hooks/use-saved-views); поки його немає чи
 *   він не вдався, меню це показує, а список працює («Стандартний»).
 */

// Форма назви тягне react-hook-form: окремим чанком, коли наводять на меню (ADR-0009).
const SavedViewNameForm = lazyWithPreload(() =>
  import("./saved-view-dialog").then((m) => m.SavedViewNameForm),
)
const preloadForm = () => {
  void SavedViewNameForm.preload()
}

export interface SavedViewsMenuProps {
  /** Ресурс списку, для якого створюються види: `invoices`. */
  resource: string
  views: SavedViewsApi
  list: ListStateApi
  className?: string
}

export function SavedViewsMenu({
  resource,
  views,
  list,
  className,
}: SavedViewsMenuProps) {
  const t = useErpUiT()
  const actions = useViewActions(resource, views, list)
  const [dialog, setDialog] = React.useState<"create" | "rename" | null>(null)
  const active = list.activeView
  const preferred = views.views?.find((view) => view.isDefault)
  const name = active?.name ?? t("savedViews.standard")
  const choose = (view: SavedView | null) => () => {
    list.applyView(view)
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="outline"
              className={cn(
                // На вузькому — повна назва: кнопка переноситься на свій рядок і тягнеться (grow, не
                // flex-1: нульова базова ширина не дала б їй перенестись).
                "max-w-48 min-w-0 @max-2xl:max-w-none @max-2xl:grow",
                className,
              )}
              onPointerEnter={preloadForm}
              onFocus={preloadForm}
            />
          }
        >
          <BookmarkIcon aria-hidden />
          <span className="sr-only">{`${t("savedViews.label")}: `}</span>
          <span className="truncate">{name}</span>
          {list.isModified ? (
            <span className="text-muted-foreground">{`(${t("savedViews.modified")})`}</span>
          ) : null}
          <ChevronDownIcon aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuGroup>
            <DropdownMenuLabel>{t("savedViews.menu")}</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={active?.id ?? STANDARD_VIEW}>
              <DropdownMenuRadioItem
                value={STANDARD_VIEW}
                closeOnClick
                onClick={choose(null)}
              >
                <ViewLabel
                  name={t("savedViews.standard")}
                  isDefault={!preferred}
                />
              </DropdownMenuRadioItem>
              {views.views?.map((view) => (
                <DropdownMenuRadioItem
                  key={view.id}
                  value={view.id}
                  closeOnClick
                  onClick={choose(view)}
                >
                  <ViewLabel name={view.name} isDefault={view.isDefault} />
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            {views.isPending ? (
              <DropdownMenuItem disabled>
                {t("savedViews.loading")}
              </DropdownMenuItem>
            ) : null}
            {views.error ? (
              <DropdownMenuItem closeOnClick={false} onClick={views.refetch}>
                {`${t("savedViews.loadFailed")}. ${t("savedViews.retry")}`}
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            {active && list.isModified ? (
              <DropdownMenuItem onClick={actions.saveChanges}>
                {t("savedViews.save")}
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem
              onClick={() => {
                setDialog("create")
              }}
            >
              {t("savedViews.saveAs")}
            </DropdownMenuItem>
            {active ? (
              <DropdownMenuItem
                onClick={() => {
                  setDialog("rename")
                }}
              >
                {t("savedViews.rename")}
              </DropdownMenuItem>
            ) : null}
            {(active ? !active.isDefault : preferred) ? (
              <DropdownMenuItem onClick={actions.makeDefault}>
                {t("savedViews.makeDefault")}
              </DropdownMenuItem>
            ) : null}
            {active ? (
              <DropdownMenuItem variant="destructive" onClick={actions.remove}>
                {t("savedViews.delete")}
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <ViewNameDialog
        mode={dialog}
        initialName={dialog === "rename" ? (active?.name ?? "") : ""}
        onOpenChange={(open) => {
          if (!open) setDialog(null)
        }}
        onSubmit={dialog === "rename" ? actions.rename : actions.create}
      />
    </>
  )
}

/** Діалог назви: поки анімовано закривається, видно ту саму форму; нове відкриття — нова форма. */
function ViewNameDialog({
  mode,
  initialName,
  onOpenChange,
  onSubmit,
}: {
  mode: "create" | "rename" | null
  initialName: string
  onOpenChange: (open: boolean) => void
  onSubmit: (values: SavedViewNameValues) => Promise<void>
}) {
  const t = useErpUiT()
  const [shown, setShown] = React.useState({
    mode: mode ?? "create",
    initialName,
    opening: 0,
  })
  const [wasOpen, setWasOpen] = React.useState(false)
  if ((mode !== null) !== wasOpen) {
    setWasOpen(mode !== null)
    if (mode) setShown({ mode, initialName, opening: shown.opening + 1 })
  }
  const title =
    shown.mode === "create"
      ? t("savedViews.dialog.createTitle")
      : t("savedViews.dialog.renameTitle")
  return (
    <Dialog open={mode !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* Заголовок — не в лінивій формі: назва діалогу є й тоді, коли її чанк не завантажився. */}
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {shown.mode === "create" ? (
            <DialogDescription>
              {t("savedViews.dialog.createDescription")}
            </DialogDescription>
          ) : null}
        </DialogHeader>
        <ErrorBoundary className="min-h-0 border-0">
          <React.Suspense fallback={<LoadingFallback className="h-24" />}>
            <SavedViewNameForm
              key={shown.opening}
              mode={shown.mode}
              initialName={shown.initialName}
              onSubmit={async (values) => {
                await onSubmit(values)
                onOpenChange(false)
              }}
              onCancel={() => {
                onOpenChange(false)
              }}
            />
          </React.Suspense>
        </ErrorBoundary>
      </DialogContent>
    </Dialog>
  )
}

function ViewLabel({ name, isDefault }: { name: string; isDefault: boolean }) {
  const t = useErpUiT()
  return (
    <span className="flex min-w-0 flex-1 items-baseline gap-2">
      <span className="truncate">{name}</span>
      {isDefault ? (
        <span className="ms-auto shrink-0 text-xs text-muted-foreground">
          {t("savedViews.byDefault")}
        </span>
      ) : null}
    </span>
  )
}

/** Дії меню: збереження, вид за замовчуванням, видалення зі «Скасувати». */
function useViewActions(
  resource: string,
  views: SavedViewsApi,
  list: ListStateApi,
) {
  const t = useErpUiT()
  const errorText = useApiErrorMessage()
  const undoToast = useUndoToast()
  const active = list.activeView
  // Список видів після помилки перечитує useSavedViews: наступна спроба — з новою версією.
  const fail =
    (key: "failed" | "deleteFailed" = "failed") =>
    (error: unknown) => {
      toast.error(t(`savedViews.${key}`, { message: errorText(error) }))
    }
  return {
    create: async (input: { name: string; isDefault: boolean }) => {
      const view = await views.create({
        resource,
        ...input,
        params: list.viewParams,
      })
      list.applyView(view)
      toast.success(t("savedViews.created", { name: view.name }))
    },
    rename: async ({ name }: { name: string }) => {
      if (!active) return
      const view = await views.update(active, { name })
      toast.success(t("savedViews.renamed", { name: view.name }))
    },
    saveChanges: () => {
      if (!active) return
      views.update(active, { params: list.viewParams }).then((view) => {
        toast.success(t("savedViews.updated", { name: view.name }))
      }, fail())
    },
    makeDefault: () => {
      const preferred = views.views?.find((view) => view.isDefault)
      const target = active ?? preferred
      if (!target) return
      views.update(target, { isDefault: Boolean(active) }).then(() => {
        toast.success(
          t("savedViews.defaultSet", {
            name: active?.name ?? t("savedViews.standard"),
          }),
        )
      }, fail())
    },
    remove: () => {
      if (!active) return
      views.remove(active).then(() => {
        // Стан і адреса — на момент відповіді: людина могла змінити фільтри чи піти зі сторінки.
        list.detachView(active.id)
        undoToast(t("savedViews.deleted", { name: active.name }), () => {
          // Вид повертається таким, яким його збережено; список лишається, як є зараз.
          const { resource: owner, name, params, isDefault } = active
          views
            .create({ resource: owner, name, params, isDefault })
            .then((view) => {
              list.attachView(view)
              toast.success(t("savedViews.restored", { name: view.name }))
            }, fail())
        })
      }, fail("deleteFailed"))
    },
  }
}
