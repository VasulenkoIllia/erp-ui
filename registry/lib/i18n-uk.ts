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
import { ukRecurrence } from "@/registry/lib/i18n-uk-recurrence"
import { ukRichText } from "@/registry/lib/i18n-uk-rich-text"
import { ukTimeline } from "@/registry/lib/i18n-uk-timeline"
import { ukTrash } from "@/registry/lib/i18n-uk-trash"
import { ukBoard } from "@/registry/lib/i18n-uk-board"
import { ukPhotos } from "@/registry/lib/i18n-uk-photos"
import { ukSetup } from "@/registry/lib/i18n-uk-setup"
import { ukWebhooks } from "@/registry/lib/i18n-uk-webhooks"
import { ukWizard } from "@/registry/lib/i18n-uk-wizard"

export const uk = {
  ...ukBase,
  // Розділи, що діляться між базою й частинами: зливаємо на рівень глибше, інакше частина затерла б
  // базу. Розбіжність ловить тест `i18n-parts.test.tsx` (база й частини дають усі рядки без перекриття).
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
  ...ukTrash,
  ...ukBoard,
  ...ukPhotos,
  ...ukRecurrence,
}

export type ErpUiMessages = typeof uk

/**
 * Частини рядків за іменем експорту (`ukRoles` — файл `lib/i18n-uk-roles`): за ним `createI18n` у розробці називає
 * частину, якої бракує (ADR-0094). Службовий перелік кіта, не частина API для проекту; повноту стереже тест
 * `i18n-parts.test.tsx`.
 */
export const ukParts: Readonly<Record<string, object>> = {
  ukAccess,
  ukAudit,
  ukBoard,
  ukCompany,
  ukDevPanel,
  ukDocumentGenerator,
  ukDocumentLines,
  ukDocuments,
  ukImport,
  ukLists,
  ukModules,
  ukNumbering,
  ukParty,
  ukPeriodLock,
  ukPhotos,
  ukPrint,
  ukProfile,
  ukPush,
  ukRealtime,
  ukRecords,
  ukRecurrence,
  ukRichText,
  ukRoles,
  ukSecurity,
  ukSetup,
  ukShortcuts,
  ukSignIn,
  ukTimeline,
  ukTrash,
  ukWebhooks,
  ukWizard,
}

const PLURAL_SUFFIX = /_(?:zero|one|two|few|many|other)$/

/** Рядок `a.b.c` чи його форми множини (`c_one`…) є в дереві. */
function hasString(tree: object, key: string): boolean {
  const path = key.split(".")
  const last = path.pop() ?? ""
  let node: unknown = tree
  for (const segment of path)
    node =
      typeof node === "object" && node !== null
        ? (node as Record<string, unknown>)[segment]
        : undefined
  return (
    typeof node === "object" &&
    node !== null &&
    Object.keys(node).some(
      (k) => k === last || k.replace(PLURAL_SUFFIX, "") === last,
    )
  )
}

/**
 * Частина, де лежить рядок кіта, і її файл (`ukRoles` — `@/lib/i18n-uk-roles`), чи `undefined`, якщо такого ключа в
 * частинах немає. Для попередження розробки в `createI18n` (ADR-0094).
 */
export function kitStringPart(
  key: string,
): { name: string; file: string } | undefined {
  const name = Object.keys(ukParts).find((part) =>
    hasString(ukParts[part] ?? {}, key),
  )
  if (!name) return undefined
  const stem = name
    .replace(/^uk/, "")
    .replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)
  return { name, file: `@/lib/i18n-uk${stem}` }
}

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
