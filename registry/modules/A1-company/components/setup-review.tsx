import {
  WizardReview,
  type WizardReviewSection,
} from "@/components/templates/wizard"
import type { CompanyProfile } from "@/lib/company"
import { useErpUiT } from "@/lib/i18n"

import { useCompanyT } from "../use-company-t"

/** Огляд майстра: усе вже на сервері, тож показує збережений профіль, а не введене. */
export function SetupReview({
  profile,
  showLogo,
  showTeam,
  waitingCount,
  onEdit,
}: {
  profile: CompanyProfile
  showLogo: boolean
  showTeam: boolean
  /** Запрошення, що чекають; поки невідомо чи збій — «Не вказано», а не 0. */
  waitingCount: number | undefined
  onEdit: (stepId: string) => void
}) {
  const t = useCompanyT()
  const kitT = useErpUiT()
  const isLegal = profile.kind === "legal"
  const uploaded = (url: string | null) =>
    url ? t("setup.review.logoSet") : undefined
  const sections: WizardReviewSection[] = [
    {
      stepId: "requisites",
      title: t("setup.steps.requisites"),
      items: [
        { label: kitT("companySettings.name"), value: profile.name },
        { label: kitT("companySettings.legalName"), value: profile.legalName },
        {
          label: kitT("companySettings.kind"),
          value: kitT(`companySettings.kinds.${profile.kind}`),
        },
        {
          label: kitT(
            isLegal ? "companySettings.edrpou" : "companySettings.rnokpp",
          ),
          value: isLegal ? profile.edrpou : profile.rnokpp,
        },
        ...(profile.vatPayer
          ? [{ label: kitT("companySettings.vatIpn"), value: profile.vatIpn }]
          : []),
        { label: kitT("companySettings.iban"), value: profile.iban },
        { label: kitT("companySettings.bankName"), value: profile.bankName },
      ],
    },
    {
      stepId: "brand",
      title: t("setup.steps.brand"),
      items: [
        ...(showLogo
          ? [
              {
                label: t("setup.review.logo"),
                value: uploaded(profile.logoUrl),
              },
              {
                label: t("setup.review.stamp"),
                value: uploaded(profile.stampUrl),
              },
            ]
          : []),
        {
          label: t("setup.review.palette"),
          value: profile.palette
            ? kitT(`palettes.${profile.palette}`)
            : kitT("companySettings.paletteNone"),
        },
      ],
    },
    ...(showTeam
      ? [
          {
            stepId: "team",
            title: t("setup.steps.team"),
            items: [
              { label: t("setup.review.invitations"), value: waitingCount },
            ],
          },
        ]
      : []),
  ]
  return <WizardReview sections={sections} onEdit={onEdit} />
}
