/**
 * Усі рядки кіта erp-ui українською — простір імен `erp-ui` (SPEC §11): база й рядки функцій разом. У
 * застосунку вони не вантажаться разом (ADR-0094): база (`i18n-uk-base`) — на старті, рядки функції — з її
 * чанком, бо компонент функції передає свій файл у `useErpUiT(частина)`. Цей файл — для типів ключів і
 * тестів. Англійський переклад — `i18n-en.ts` з тими самими ключами; паритет перевіряє тест.
 * Множина — ключі `_one/_few/_many/_other` (i18next + Intl.PluralRules).
 */
import { ukAccess } from "@/registry/lib/i18n-uk-access"
import { ukAudit } from "@/registry/lib/i18n-uk-audit"
import { ukBase } from "@/registry/lib/i18n-uk-base"
import { ukCompany } from "@/registry/lib/i18n-uk-company"
import { ukDevPanel } from "@/registry/lib/i18n-uk-dev-panel"
import { ukDocuments } from "@/registry/lib/i18n-uk-documents"
import { ukDocumentGenerator } from "@/registry/lib/i18n-uk-document-generator"
import { ukDocumentLines } from "@/registry/lib/i18n-uk-document-lines"
import { ukModules } from "@/registry/lib/i18n-uk-modules"
import { ukNumbering } from "@/registry/lib/i18n-uk-numbering"
import { ukParty } from "@/registry/lib/i18n-uk-party"
import { ukPeriodLock } from "@/registry/lib/i18n-uk-period-lock"
import { ukPrint } from "@/registry/lib/i18n-uk-print"
import { ukProfile } from "@/registry/lib/i18n-uk-profile"
import { ukImport } from "@/registry/lib/i18n-uk-import"
import { ukLists } from "@/registry/lib/i18n-uk-lists"
import { ukRecords } from "@/registry/lib/i18n-uk-records"
import { ukRoles } from "@/registry/lib/i18n-uk-roles"
import { ukSecurity } from "@/registry/lib/i18n-uk-security"
import { ukShortcuts } from "@/registry/lib/i18n-uk-shortcuts"
import { ukSignIn } from "@/registry/lib/i18n-uk-sign-in"
import { ukPush } from "@/registry/lib/i18n-uk-push"
import { ukRealtime } from "@/registry/lib/i18n-uk-realtime"
import { ukRichText } from "@/registry/lib/i18n-uk-rich-text"
import { ukTimeline } from "@/registry/lib/i18n-uk-timeline"
import { ukSetup } from "@/registry/lib/i18n-uk-setup"
import { ukWebhooks } from "@/registry/lib/i18n-uk-webhooks"
import { ukWizard } from "@/registry/lib/i18n-uk-wizard"

export const uk = {
  ...ukBase,
  // Розділи, що діляться між базою й частинами: зливаємо глибше, інакше частина затерла б базу.
  auth: { ...ukBase.auth, ...ukSignIn.auth, ...ukSecurity.auth },
  documentGenerator: {
    ...ukBase.documentGenerator,
    ...ukDocumentGenerator.documentGenerator,
  },
  ...ukProfile,
  ...ukAccess,
  ...ukRoles,
  ...ukAudit,
  ...ukWebhooks,
  ...ukCompany,
  ...ukModules,
  ...ukDevPanel,
  ...ukLists,
  ...ukRecords,
  ...ukShortcuts,
  ...ukSetup,
  ...ukPush,
  ...ukRealtime,
  ...ukRichText,
  ...ukTimeline,
  ...ukWizard,
  ...ukImport,
  ...ukDocuments,
  ...ukDocumentLines,
  ...ukNumbering,
  ...ukPrint,
  ...ukParty,
  ...ukPeriodLock,
}

export type ErpUiMessages = typeof uk

type ExtraPluralForm = "zero" | "one" | "two" | "few" | "many"

/**
 * Форма перекладу іншою мовою: ті самі ключі, а форми множини, крім `_other`, необов'язкові —
 * кожна мова має свої (en: one/other). Які саме потрібні — перевіряє тест паритету.
 */
export type ErpUiTranslation<T = ErpUiMessages> = {
  [
    K in keyof T as K extends `${string}_${ExtraPluralForm}` ? never : K
  ]: T[K] extends string ? string : ErpUiTranslation<T[K]>
} & {
  [
    K in keyof T as K extends `${string}_${ExtraPluralForm}` ? K : never
  ]?: string
}
