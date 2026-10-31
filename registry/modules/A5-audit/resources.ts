/**
 * Ресурс модуля A5 без схем: його бере точка входу (`index.ts`) для прав і панелі розробника, не
 * тягнучи zod і схеми контракту в перший екран застосунку.
 */
import type { LocalizedText } from "@/lib/auth"

/** Право `audit:read` і ресурс сценаріїв моків (`lib/mock-audit`). */
export const AUDIT = "audit"

export interface AuditResource {
  readonly name: string
  readonly label: LocalizedText
  readonly actions: readonly string[]
}

export const AUDIT_RESOURCES: readonly AuditResource[] = [
  {
    name: AUDIT,
    label: { uk: "Журнал аудиту", en: "Audit log" },
    actions: ["read"],
  },
]
