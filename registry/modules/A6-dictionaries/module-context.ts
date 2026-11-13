import { createModuleContext, type ModuleContextValue } from "@/lib/module"

import type { DictionariesExtension } from "./extension"

/** Адреси сторінок модуля від `basePath` фабрики. */
export interface DictionariesPaths {
  readonly taxes: string
  readonly units: string
  readonly paymentTerms: string
  readonly tags: string
  readonly reasons: string
  readonly defaults: string
}

export function dictionariesPaths(basePath: string): DictionariesPaths {
  const base = basePath.replace(/\/+$/, "")
  return {
    taxes: `${base}/taxes`,
    units: `${base}/units`,
    paymentTerms: `${base}/payment-terms`,
    tags: `${base}/tags`,
    reasons: `${base}/reasons`,
    defaults: `${base}/defaults`,
  }
}

export type DictionariesModuleContextValue = ModuleContextValue<
  DictionariesExtension,
  DictionariesPaths
>

/** Розширення й адреси для сторінок модуля: їх дає фабрика в маршрутах. */
export const [DictionariesModuleContext, useDictionariesModule] =
  createModuleContext<DictionariesModuleContextValue>(
    "A6-dictionaries",
    "createDictionariesModule",
  )
