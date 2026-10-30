/** Рядки майстра UI06 (ADR-0043) англійською — ті самі ключі, що в `i18n-uk-wizard.ts`. */
import type { ErpUiTranslation } from "@/registry/lib/i18n-uk"
import type { ukWizard } from "@/registry/lib/i18n-uk-wizard"

export const enWizard = {
  wizard: {
    stepsLabel: "Steps",
    stepOf: "Step {{current}} of {{total}}",
    stepDone: "done",
    stepInvalid: "has errors",
    optional: "Optional",
    next: "Next",
    back: "Back",
    skip: "Skip",
    edit: "Change",
    editStep: "Change: {{step}}",
    notSet: "Not set",
  },
} satisfies ErpUiTranslation<typeof ukWizard>
