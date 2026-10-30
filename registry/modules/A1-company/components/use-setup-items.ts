import { isRequisitesDone } from "@/components/erp/company-profile-values"
import type { SetupChecklistItem } from "@/components/erp/setup-checklist"
import { useHasPermission } from "@/hooks/use-me"
import type { CompanyProfile } from "@/lib/company"
import { useErpUiT } from "@/lib/i18n"
import { TAB_PARAM } from "@/lib/list-state"

import type { SetupItemId } from "../extension"
import { useCompanyModule } from "../module-context"
import { useCompanyT } from "../use-company-t"

/** Майстер відкривається на цьому кроці: `<paths.setup>?step=team`. */
export const SETUP_STEP_PARAM = "step"

/** Що пропонує майстер і чек-лист: без прихованого розширенням і без колег для того, хто не запрошує. */
export function useSetupOptions() {
  const { extension } = useCompanyModule()
  const hide: readonly SetupItemId[] = extension.setup?.hide ?? []
  const canInvite = useHasPermission("users", "create")
  const hasWizard = extension.setup?.page !== false
  return {
    hasWizard,
    showLogo: !hide.includes("logo"),
    // Пункт веде на крок майстра: без нього запросити звідси нікуди.
    showTeam: hasWizard && canInvite && !hide.includes("team"),
  }
}

export function useSetupItems(
  profile: CompanyProfile | undefined,
  hasTeam: boolean,
): readonly SetupChecklistItem[] {
  const t = useCompanyT()
  const kitT = useErpUiT()
  const { paths } = useCompanyModule()
  const { showLogo, showTeam } = useSetupOptions()
  if (!profile) return []
  return [
    {
      id: "requisites",
      label: t("setup.checklist.requisites"),
      description: t("setup.checklist.requisitesHint"),
      done: isRequisitesDone(kitT, profile),
      href: paths.company,
      actionLabel: t("setup.checklist.fill"),
    },
    ...(showLogo
      ? [
          {
            id: "logo",
            label: t("setup.checklist.logo"),
            description: t("setup.checklist.logoHint"),
            done: Boolean(profile.logoUrl),
            href: `${paths.company}?${TAB_PARAM}=images`,
            actionLabel: t("setup.checklist.upload"),
            optional: true,
          },
        ]
      : []),
    ...(showTeam
      ? [
          {
            id: "team",
            label: t("setup.checklist.team"),
            description: t("setup.checklist.teamHint"),
            done: hasTeam,
            href: `${paths.setup}?${SETUP_STEP_PARAM}=team`,
            actionLabel: t("setup.checklist.invite"),
            optional: true,
          },
        ]
      : []),
  ]
}
