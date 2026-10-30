/** Рядки чек-листа «Почніть роботу» (PF12, ADR-0044) англійською — ті самі ключі, що в `i18n-uk-setup.ts`. */
import type { ErpUiTranslation } from "@/registry/lib/i18n-uk"
import type { ukSetup } from "@/registry/lib/i18n-uk-setup"

export const enSetup = {
  setup: {
    title: "Get started",
    progress: "{{done}} of {{total}} done",
    progressLabel: "How much is done",
    done: "Done",
    notNeeded: "Not needed",
    dismissFor: "Not needed: {{item}}",
    restore: "Bring back",
    restoreFor: "Bring back: {{item}}",
    finished: "All set",
  },
} satisfies ErpUiTranslation<typeof ukSetup>
