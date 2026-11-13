/**
 * Документ модуля K2 для спільних частин сторінок (ADR-0070, ADR-0072): рахунок (`invoice-kind.ts`) чи
 * кредит-нота (`credit-note-kind.ts`). Статуси, граф дій зі своїми підписами й підтвердженнями, етапи,
 * адреси, рядки картки й розширення проекту — звідси; поля шапки, колонки, форма й аркуш — свої в кожного.
 */
import type { DocumentKind } from "@/lib/document-kind"
import type {
  ExtensionStatusChanges,
  ExtensionTransitionChanges,
  StatusTone,
} from "@/lib/statuses"

import type { InvoiceStatus } from "./contract"
import type { InvoicesExtension } from "./extension"
import type { InvoicesPaths } from "./module-context"
import type { InvoicesKey } from "./use-invoices-t"

/** Префікс рядків картки документа: `invoice.*` чи `creditNote.*` (`i18n/uk.json`). */
export type K2DocumentKey = "invoice" | "creditNote"

/** Адреси сторінок документа від `basePath` фабрики. */
export interface K2DocumentPaths {
  readonly list: string
  readonly record: (id: string) => string
  readonly edit: (id: string) => string
  readonly print: (id: string) => string
}

/** Те, що спільні частини беруть із розширення документа проекту. */
export interface K2KindExtension {
  readonly statuses?: ExtensionStatusChanges<InvoiceStatus>
  readonly transitions?: ExtensionTransitionChanges
  readonly editLock?: boolean
}

/** Вид документа модуля (`lib/document-kind`): статуси з ключем підпису `<key>.statuses.<id>`. */
export interface K2DocumentKind extends DocumentKind<
  InvoicesKey,
  `${K2DocumentKey}.confirm.submit`
> {
  readonly key: K2DocumentKey
  readonly statuses: readonly {
    readonly id: InvoiceStatus
    readonly tone: StatusTone
    readonly label: InvoicesKey
  }[]
  readonly actionLabels: Readonly<Partial<Record<string, InvoicesKey>>>
  readonly confirms: Readonly<
    Partial<Record<string, `${K2DocumentKey}.confirm.submit`>>
  >
  readonly mainPath: readonly string[]
  pathsOf(paths: InvoicesPaths): K2DocumentPaths
  extensionOf(extension: InvoicesExtension): K2KindExtension | undefined
}

/** Тони статусів документа модуля: однакові в рахунку й кредит-ноті. */
export const DOCUMENT_TONES: Readonly<Record<InvoiceStatus, StatusTone>> = {
  draft: "neutral",
  issued: "info",
  paid: "success",
  cancelled: "destructive",
  reversed: "warning",
  reversal: "neutral",
}
