/**
 * Closed period strings in English (PF13, ADR-0069). Ukrainian — lib/i18n-uk-period-lock.
 */
import type { ErpUiTranslation } from "@/registry/lib/i18n-uk"
import type { ukPeriodLock } from "@/registry/lib/i18n-uk-period-lock"

export const enPeriodLock = {
  periodLock: {
    title: "Closed periods",
    description:
      "Documents dated in a closed period can't be created or changed. A mistake in such a document is corrected by a reversal dated today.",
    statusClosed: "Closed through {{date}}.",
    statusOpen: "No periods are closed.",
    readOnly:
      "Only someone with the right to set closed periods can change them.",
    unsupported: "This app's server doesn't keep closed periods.",
    lockedThrough: "Closed through",
    lockedThroughHint:
      "The last closed day. Leave empty if no periods are closed. Today stays open.",
    closeMonth: "Close {{month}}",
    reason: "Reason for reopening",
    reasonHint:
      "You are reopening a closed period: the reason goes to the audit log.",
    saved: "Closed period saved",
    future: "Only past days can be closed: today stays open",
    dateHint: "The period through {{date}} is closed: choose a later date",
    dateHintException:
      "The period through {{date}} is closed, you have an exception until {{until}}",
    banner: {
      title: "Period closed through {{date}}",
      locked:
        "The document date {{date}} is in a closed period: the document can't be changed, submitted or cancelled.",
      exception:
        "You have an exception until {{until}}. Reason: {{reason}}. Every change goes to the audit log.",
      error:
        "We couldn't check the closed period. The server still won't let anyone change a document in a closed period.",
      retry: "Try again",
    },
    years: {
      title: "Company years",
      description: "The company's financial year starts on {{date}}.",
      listLabel: "Financial years",
      range: "{{from}} to {{to}}",
      closed: "Closed",
      partly: "Closed through {{date}}",
      open: "Open",
      current: "Current year, not over yet",
      close: "Close {{year}}",
      closeTitle: "Close {{year}}?",
      closeDescription:
        "Documents dated through {{date}} will no longer change. You can reopen the period with a reason.",
      done: "{{year}} closed",
    },
    exceptions: {
      title: "Exceptions",
      description:
        "Temporary permission for one person to change documents in a closed period, for {{days}} days at most. The reason and every change go to the audit log.",
      listLabel: "Active exceptions",
      empty: "No active exceptions.",
      grant: "Grant an exception",
      grantTitle: "New exception",
      grantDescription:
        "The person will be able to change documents in a closed period until the time you set.",
      user: "To",
      userMissing: "A person in the company",
      duration: "For how long",
      durations: {
        hour: "For an hour",
        day: "Until the end of the day",
        date: "Until a date",
      },
      untilDate: "Until the end of",
      untilDateHint: "No later than {{date}}",
      reason: "Reason",
      reasonHint:
        "Goes to the audit log together with every change made under the exception",
      until: "Until {{until}}",
      grantedBy: "Granted by {{name}}, {{at}}",
      granted: "{{name}} has an exception until {{until}}",
      revoke: "Revoke",
      revokeLabel: "Revoke the exception for {{name}}",
      revoked: "The exception for {{name}} is revoked",
      noCreate: "Only someone with the right to exceptions can grant them",
      noDelete: "Only someone with the right to exceptions can revoke them",
      errors: {
        duplicate:
          "This person already has an active exception: revoke it to grant a new one",
        not_found: "This person isn't in the company",
        past: "This time has already passed",
        too_far: "No more than {{days}} days ahead",
        invalid: "Enter a date",
      },
    },
  },
} satisfies ErpUiTranslation<typeof ukPeriodLock>
