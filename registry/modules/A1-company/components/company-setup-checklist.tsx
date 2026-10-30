import { Link } from "react-router"

import { SetupChecklist } from "@/components/erp/setup-checklist"
import { buttonVariants } from "@/components/ui/button"
import { useHasPermission } from "@/hooks/use-me"

import { COMPANY } from "../contract"
import { useCompanyModule } from "../module-context"
import { useCompanyT } from "../use-company-t"
import { useCompanyState } from "./use-company-state"
import { useSetupItems, useSetupOptions } from "./use-setup-items"
import { useTeamProgress } from "./use-team-progress"

/**
 * Чек-лист «Почніть роботу» компанії (PF12, ADR-0044). Бачить лише той, хто може змінювати компанію:
 * решті тут немає що робити, тож і запитів для них немає.
 */
export function CompanySetupChecklist() {
  return useHasPermission(COMPANY, "update") ? <Checklist /> : null
}

function Checklist() {
  const t = useCompanyT()
  const { paths, preload } = useCompanyModule()
  const { hasWizard, showTeam } = useSetupOptions()
  const company = useCompanyState()
  const team = useTeamProgress(showTeam)
  const { profile } = company
  const items = useSetupItems(profile, team.hasTeam)
  const preloadSetup = () => {
    preload(paths.setup)
  }
  return (
    <SetupChecklist
      scope={profile?.id ?? "none"}
      items={items}
      description={t("setup.checklist.description")}
      isPending={company.isPending || team.isPending}
      // Лише коли даних немає: збій фонового оновлення не прибирає готовий чек-лист (SPEC §8.1).
      error={profile ? team.failure : company.failure}
      onRetry={() => {
        company.retry()
        team.retry()
      }}
      onPreload={preload}
      action={
        hasWizard ? (
          <Link
            to={paths.setup}
            onPointerEnter={preloadSetup}
            onFocus={preloadSetup}
            className={buttonVariants()}
          >
            {t("setup.checklist.startWizard")}
          </Link>
        ) : undefined
      }
    />
  )
}
