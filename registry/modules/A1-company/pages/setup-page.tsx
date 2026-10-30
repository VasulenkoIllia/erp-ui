import { useState } from "react"
import { useAuthenticated } from "ra-core"
import { Navigate, useNavigate, useSearchParams } from "react-router"
import { toast } from "sonner"

import { InvitationsSection } from "@/components/erp/invitations-section"
import { PageSkeleton, PageState } from "@/components/erp/page-state"
import {
  fieldsOf,
  isRequisitesDone,
  requisiteKeys,
} from "@/components/erp/company-profile-values"
import { Wizard } from "@/components/templates/wizard"
import { useHasPermission, useMe } from "@/hooks/use-me"
import { usePageHeading } from "@/hooks/use-page-heading"
import { useWizard, type WizardStep } from "@/hooks/use-wizard"
import { errorStateKind } from "@/lib/api"
import type { CompanyProfile } from "@/lib/company"
import { useErpUiT } from "@/lib/i18n"
import {
  clearWizardProgress,
  loadWizardProgress,
  saveWizardProgress,
} from "@/lib/wizard-progress"

import { SetupBrandStep } from "../components/setup-brand-step"
import { SetupRequisitesStep } from "../components/setup-requisites-step"
import { SetupReview } from "../components/setup-review"
import {
  useCompanyState,
  type CompanyState,
} from "../components/use-company-state"
import { useSetupForm } from "../components/use-setup-form"
import {
  SETUP_STEP_PARAM,
  useSetupOptions,
} from "../components/use-setup-items"
import { useWaitingInvitations } from "../components/use-team-progress"
import { COMPANY } from "../contract"
import { useCompanyModule } from "../module-context"
import { useCompanyT } from "../use-company-t"

/**
 * Майстер першого запуску на шаблоні Wizard (SPEC §7, PF12, ADR-0044): реквізити, логотип і палітра,
 * колеги, огляд. Проект веде сюди після реєстрації (`afterSignUp`), а далі майстер запускають із
 * чек-листа. Можна пропустити будь-якої миті. Бачить лише той, хто може змінювати компанію: решту
 * сторінка мовчки веде далі, бо після реєстрації стан «Немає доступу» виглядав би збоєм.
 */
export function SetupPage() {
  const t = useCompanyT()
  const { afterSetup } = useCompanyModule()
  // Без сесії ra-core перенаправить на вхід і повернеться сюди після входу.
  const { isPending } = useAuthenticated()
  const me = useMe()
  const canEdit = useHasPermission(COMPANY, "update")
  const company = useCompanyState(!isPending && canEdit)
  const heading = usePageHeading(
    t("setup.title"),
    !isPending &&
      !me.isPending &&
      (!canEdit || !company.isPending || company.failure !== undefined),
  )
  if (isPending || me.isPending) return <PageSkeleton rows={6} />
  if (me.isError)
    return (
      <PageState
        kind={errorStateKind(me.error)}
        headingLevel={1}
        onRetry={() => {
          void me.refetch()
        }}
      />
    )
  if (!canEdit) return <Navigate to={afterSetup} replace />
  return <LoadedCompany company={company} heading={heading} />
}

function LoadedCompany({
  company,
  heading,
}: {
  company: CompanyState
  heading: React.Ref<HTMLHeadingElement>
}) {
  const { profile, failure, retry } = company
  if (profile)
    // Інша компанія — свій майстер: прогрес і введене не переходять до неї.
    return <SetupWizard key={profile.id} profile={profile} heading={heading} />
  return failure ? (
    <PageState
      kind={errorStateKind(failure)}
      headingLevel={1}
      onRetry={retry}
    />
  ) : (
    <PageSkeleton rows={6} />
  )
}

function SetupWizard({
  profile,
  heading,
}: {
  profile: CompanyProfile
  heading: React.Ref<HTMLHeadingElement>
}) {
  const t = useCompanyT()
  const kitT = useErpUiT()
  const { afterSetup } = useCompanyModule()
  const navigate = useNavigate()
  const userId = useMe().data?.id ?? "none"
  const { showLogo, showTeam } = useSetupOptions()
  const invitations = useWaitingInvitations(showTeam)
  const { form, save } = useSetupForm(profile)
  const [params] = useSearchParams()
  const progressKey = `company-setup:${profile.id}:${userId}`
  const [saved] = useState(() => loadWizardProgress(progressKey))
  const leave = () => {
    void navigate(afterSetup)
  }
  const steps: WizardStep[] = [
    {
      id: "requisites",
      label: t("setup.steps.requisites"),
      description: t("setup.steps.requisitesHint"),
      onNext: () => save(requisiteKeys(form.getValues())),
    },
    {
      id: "brand",
      label: t("setup.steps.brand"),
      description: t("setup.steps.brandHint"),
      optional: true,
      onNext: () => save(["palette"]),
      // Пропущений крок не несе далі вибір, який ніхто не зберіг.
      onSkip: () => {
        form.resetField("palette", {
          defaultValue: fieldsOf(profile).palette,
        })
      },
    },
    ...(showTeam
      ? [
          {
            id: "team",
            label: t("setup.steps.team"),
            description: t("setup.steps.teamHint"),
            optional: true,
          },
        ]
      : []),
    {
      id: "review",
      label: t("setup.steps.review"),
      description: t("setup.steps.reviewHint"),
    },
  ]
  // Пункт чек-листа веде на свій крок (`?step=team`); без нього — де людина зупинилась.
  const requested = params.get(SETUP_STEP_PARAM)
  const canStartAt = steps.slice(0, -1).some((step) => step.id === requested)
  const [initial] = useState(() =>
    requested && canStartAt
      ? { stepId: requested, reachedIndex: saved?.reachedIndex ?? 0 }
      : (saved ?? undefined),
  )
  const wizard = useWizard({
    steps,
    initial,
    onProgress: (progress) => {
      saveWizardProgress(progressKey, progress)
    },
    onFinish: () => {
      clearWizardProgress(progressKey)
      // З чек-листа можна прийти одразу на «Колеги», оминувши реквізити: не кажемо, що все готово.
      toast.success(
        t(
          isRequisitesDone(kitT, profile)
            ? "setup.finished"
            : "setup.finishedPartly",
        ),
      )
      leave()
    },
  })
  return (
    <Wizard
      wizard={wizard}
      title={t("setup.title")}
      description={t("setup.lead")}
      headingRef={heading}
      finishLabel={t("setup.finish")}
      onExit={leave}
      exitLabel={t("setup.exit")}
      dirty={form.formState.isDirty}
    >
      {wizard.step.id === "requisites" ? (
        <SetupRequisitesStep form={form} />
      ) : wizard.step.id === "brand" ? (
        <SetupBrandStep form={form} showLogo={showLogo} />
      ) : wizard.step.id === "team" ? (
        <InvitationsSection />
      ) : (
        <SetupReview
          profile={profile}
          showLogo={showLogo}
          showTeam={showTeam}
          waitingCount={invitations.count}
          onEdit={wizard.goTo}
        />
      )}
    </Wizard>
  )
}
