/** Рядки реального часу (PF19, ADR-0051) англійською — ті самі ключі, що в lib/i18n-uk-realtime. */
import type { ukRealtime } from "@/registry/lib/i18n-uk-realtime"

export const enRealtime: typeof ukRealtime = {
  editLock: {
    notice:
      "{{name}} is editing this record. You can view it until they finish.",
    reason: "{{name}} is editing this record",
    lost: "{{name}} is now editing this record. Your changes are safe: you will see a comparison when you save.",
  },
}
