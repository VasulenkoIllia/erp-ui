import { useMemo } from "react"

import { applyKeyedChanges } from "@/lib/extensions"
import { useLanguage } from "@/lib/i18n"
import type { ImportTarget } from "@/lib/import-rows"

import { useImportExportModule } from "./module-context"
import { localizeTarget, MODULE_TARGETS } from "./targets"

/** Цілі модуля зі змінами розширення проекту, мовою інтерфейсу. */
export function useImportExportTargets(): readonly ImportTarget[] {
  const { extension } = useImportExportModule()
  const { language } = useLanguage()
  return useMemo(
    () =>
      applyKeyedChanges(MODULE_TARGETS, extension.targets).map((target) =>
        localizeTarget(target, language),
      ),
    [extension.targets, language],
  )
}
