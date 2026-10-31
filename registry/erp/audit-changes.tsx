import { useMemo } from "react"

import type { AuditEvent } from "@/registry/lib/audit"
import { useErpUiT } from "@/registry/lib/i18n"
import { diffAuditValues, type DiffPart } from "@/registry/lib/value-diff"

/**
 * Що змінилося в події журналу (ADR-0045): рядки «Було» і «Стало» одне під одним, змінені слова
 * виділено. Різницю видно не лише кольором: `del` закреслений, `ins` підкреслений, і так само в режимі
 * високого контрасту, де фон зникає.
 *
 *   <AuditChanges changes={event.changes} />
 */

type AuditChange = NonNullable<AuditEvent["changes"]>[number]

function DiffValue({
  parts,
  mark: Mark,
}: {
  parts: readonly DiffPart[]
  mark: "del" | "ins"
}) {
  const markClass =
    Mark === "del"
      ? "rounded-sm bg-destructive-soft text-destructive-foreground line-through"
      : "rounded-sm bg-success-soft text-success-foreground underline"
  return (
    <dd className="min-w-0 break-words whitespace-pre-wrap">
      {parts.map((part, index) =>
        part.changed ? (
          <Mark key={index} className={markClass}>
            {part.text}
          </Mark>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </dd>
  )
}

function ChangeRow({ change }: { change: AuditChange }) {
  const t = useErpUiT()
  const { before, after } = useMemo(
    () =>
      diffAuditValues(change.from, change.to, (value) =>
        t(value ? "audit.yes" : "audit.no"),
      ),
    [change.from, change.to, t],
  )
  return (
    <li className="rounded-md border" data-slot="audit-change">
      <p className="border-b bg-muted/50 px-3 py-1.5 font-medium">
        {change.label ?? change.field}
      </p>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 px-3 py-2">
        <dt className="text-muted-foreground">{t("audit.before")}</dt>
        <DiffValue parts={before} mark="del" />
        <dt className="text-muted-foreground">{t("audit.after")}</dt>
        <DiffValue parts={after} mark="ins" />
      </dl>
    </li>
  )
}

export function AuditChanges({ changes }: { changes: readonly AuditChange[] }) {
  const t = useErpUiT()
  return (
    <ul
      className="space-y-2 text-sm"
      aria-label={t("audit.changes")}
      data-slot="audit-changes"
    >
      {changes.map((change) => (
        <ChangeRow key={change.field} change={change} />
      ))}
    </ul>
  )
}
