import { createModuleContext, type ModuleContextValue } from "@/lib/module"

import type { ImportExportExtension } from "./extension"

/** Адреси сторінок модуля від `basePath` фабрики. */
export interface ImportExportPaths {
  readonly targets: string
  readonly history: string
  /** Майстер імпорту, шаблон маршруту: адресу цілі дає `importRunPath`. */
  readonly run: string
}

export function importExportPaths(basePath: string): ImportExportPaths {
  const base = basePath.replace(/\/+$/, "")
  return {
    targets: `${base}/import-export`,
    history: `${base}/import-history`,
    run: `${base}/import-export/:target`,
  }
}

/** Майстер імпорту цілі: посилання зі своїх сторінок проекту теж ведуть сюди. */
export const importRunPath = (
  paths: Pick<ImportExportPaths, "run">,
  target: string,
) => paths.run.replace(":target", encodeURIComponent(target))

export type ImportExportModuleContextValue = ModuleContextValue<
  ImportExportExtension,
  ImportExportPaths
>

/** Розширення й адреси для сторінок модуля: їх дає фабрика в маршрутах. */
export const [ImportExportModuleContext, useImportExportModule] =
  createModuleContext<ImportExportModuleContextValue>(
    "A4-import-export",
    "createImportExportModule",
  )
