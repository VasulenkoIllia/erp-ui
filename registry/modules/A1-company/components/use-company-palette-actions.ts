import { useHasPermission } from "@/hooks/use-me"
import {
  usePaletteActions,
  useSectionActions,
} from "@/hooks/use-palette-actions"
import type { CompanyProfile } from "@/lib/company"
import { ACTION_ICONS } from "@/lib/icons"

import { COMPANY } from "../contract"
import { useCompanyT } from "../use-company-t"

/** Дії відкритої картки компанії в палітрі команд (ADR-0044): нова філія й перехід на вкладки. */
export function useCompanyPaletteActions(
  profile: CompanyProfile | undefined,
  sections: readonly { id: string; title: string }[],
  onOpenSection: (sectionId: string) => void,
  onAddBranch: () => void,
) {
  const t = useCompanyT()
  const canEdit = useHasPermission(COMPANY, "update")
  const sectionActions = useSectionActions(sections, onOpenSection)
  // Проект міг сховати вкладку філій: тоді й дії немає, бо формі ніде відкритись.
  const hasBranches = sections.some((section) => section.id === "branches")
  usePaletteActions(
    profile
      ? {
          title: profile.name,
          actions: [
            ...(hasBranches
              ? [
                  {
                    id: "add-branch",
                    label: t("company.palette.addBranch"),
                    icon: ACTION_ICONS.create,
                    deniedReason: canEdit
                      ? undefined
                      : t("company.palette.denied"),
                    onSelect: onAddBranch,
                  },
                ]
              : []),
            ...sectionActions,
          ],
        }
      : null,
  )
}
