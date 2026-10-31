import type { AuditExtension } from "@/registry/modules/A5-audit"

/**
 * Розширення модуля A5 «Аудит та історія» під клієнта (ADR-0020, ADR-0025) — так виглядає файл проекту
 * `src/extensions/A5-audit.ts`: назва дії проекту мовами, важливіша за назву від сервера.
 */
export const auditExtension: AuditExtension = {
  journal: {
    actionLabels: {
      "contracts.created": { uk: "Новий договір", en: "New contract" },
    },
  },
}
