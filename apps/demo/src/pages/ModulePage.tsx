import { Link } from "react-router"

import { PageState } from "@/registry/erp/page-state"
import { useErpUiT } from "@/registry/lib/i18n"
import { ukModules } from "@/registry/lib/i18n-uk-modules"
import { MODULE_ICONS, type ModuleId } from "@/registry/lib/icons"
import { cn } from "@/registry/lib/utils"
import { buttonVariants } from "@/registry/ui/button"

import { ROUTES } from "@/router"
import { useDemoTranslation } from "@/i18n"
import { ukModulePage } from "@/i18n/pages"

import { PageHeader } from "./PageHeader"

/** Заглушка модуля прикладу ERP: показує, як оболонка веде до розділу без даних. */
export function ModulePage({ moduleId }: { moduleId: ModuleId }) {
  const { t } = useDemoTranslation([ukModulePage], { keyPrefix: "modulePage" })
  const kitT = useErpUiT(ukModules)
  const name = kitT(`modules.${moduleId}`)
  return (
    <div className="space-y-6">
      <PageHeader title={name} lead={t("lead", { id: moduleId })} />
      <PageState
        kind="empty"
        icon={MODULE_ICONS[moduleId]}
        title={name}
        description={t("description")}
        action={
          <Link
            to={ROUTES.states}
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            {t("states")}
          </Link>
        }
      />
    </div>
  )
}
