import { use, useMemo } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { PageState } from "@/registry/erp/page-state"
import { ShortcutKeys } from "@/registry/erp/shortcut-keys"
import { ShortcutsHelpList } from "@/registry/erp/shortcuts-help-list"
import { usePaletteActions } from "@/registry/hooks/use-palette-actions"
import { SHORTCUTS, type ProjectShortcut } from "@/registry/lib/shortcuts"
import { Button } from "@/registry/ui/button"
import { Spinner } from "@/registry/ui/spinner"

import { OpenHelpContext } from "@/help-context"

import { PageHeader } from "./PageHeader"
import { Section } from "./Section"

/** Довідка гарячих клавіш (ADR-0042): діалог, перелік у широкому й вузькому контейнері, стани. */
export function ShortcutsPage() {
  const { t } = useTranslation()
  const openHelp = use(OpenHelpContext)
  const projectKeys = useMemo<ProjectShortcut[]>(
    () => [
      {
        id: "create-invoice",
        label: t("shortcutsPage.projectKey"),
        keys: [{ key: "i", mod: true }],
      },
    ],
    [t],
  )
  usePaletteActions({
    title: t("shortcutsPage.actionsGroup"),
    actions: [
      {
        id: "demo-allowed",
        label: t("shortcutsPage.actionAllowed"),
        onSelect: () => {
          toast.success(t("shortcutsPage.actionDone"))
        },
      },
      {
        id: "demo-denied",
        label: t("shortcutsPage.actionDenied"),
        deniedReason: t("shortcutsPage.actionReason"),
        onSelect: () => undefined,
      },
    ],
  })
  return (
    <div className="space-y-6">
      <PageHeader
        title={t("app.pages.shortcuts")}
        lead={t("shortcutsPage.lead")}
      />
      <Section
        title={t("shortcutsPage.helpTitle")}
        description={t("shortcutsPage.helpDescription")}
      >
        <Button
          variant="outline"
          onClick={() => {
            openHelp(projectKeys)
          }}
        >
          {t("shortcutsPage.open")}
        </Button>
      </Section>
      <Section
        title={t("shortcutsPage.actionsTitle")}
        description={t("shortcutsPage.actionsDescription")}
      >
        <ShortcutKeys shortcut={SHORTCUTS.palette} />
      </Section>
      <Section
        title={t("shortcutsPage.listTitle")}
        description={t("shortcutsPage.listDescription")}
      >
        <ShortcutsHelpList extra={projectKeys} />
      </Section>
      <Section
        title={t("shortcutsPage.narrowTitle")}
        description={t("shortcutsPage.narrowDescription")}
      >
        <div className="max-w-xs rounded-lg border p-3">
          <ShortcutsHelpList />
        </div>
      </Section>
      <Section
        title={t("shortcutsPage.statesTitle")}
        description={t("shortcutsPage.statesDescription")}
      >
        <div className="grid gap-4 @lg:grid-cols-2">
          <div className="rounded-lg border p-3">
            <p className="mb-2 font-medium">{t("shortcutsPage.loading")}</p>
            {/* Лише вигляд: справжній LoadingFallback ще й оголосив би завантаження скрінрідеру. */}
            <div className="flex h-24 items-center justify-center">
              <Spinner aria-hidden className="size-6" />
            </div>
          </div>
          <div className="min-w-0 rounded-lg border p-3">
            <p className="mb-2 font-medium">{t("shortcutsPage.failed")}</p>
            <PageState
              kind="error"
              headingLevel={3}
              onRetry={() => {
                toast(t("shortcutsPage.retried"))
              }}
              className="min-h-0 border-0"
            />
          </div>
        </div>
      </Section>
    </div>
  )
}
