/**
 * Ресурси модуля без React (ADR-0085, ADR-0093): назва ресурсу API, підпис і дії прав. Їх беруть
 * `resources.ts` модулів, а з ними контракти, моки й сервер на TypeScript; `lib/module` реекспортує
 * типи звідси.
 */
import type { LocalizedText } from "@/registry/lib/localized-text"

/** Ресурс модуля: права, журнал аудиту, токени API, сценарії моків. */
export interface ModuleResource {
  readonly name: string
  readonly label: LocalizedText
  /** Дії прав (`<ресурс>:<дія>`); без них прав немає: людина бачить лише своє. */
  readonly actions?: readonly string[]
}

/** Ресурс із правами. */
export type ModuleResourceWithActions = ModuleResource & {
  readonly actions: readonly string[]
}
