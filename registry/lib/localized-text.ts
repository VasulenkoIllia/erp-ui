/**
 * Текст однією мовою або за мовами: назва статусу, бренд сторінки входу, підпис з розширення.
 * Окремий файл без залежностей кіта: компонент, якому потрібен лише переклад рядка (`erp/status-badge`),
 * не тягне за собою `lib/auth` із його API (ADR-0092). `lib/auth` реекспортує ці імена.
 */
import { z } from "zod"

/** Текст однією мовою або за мовами: «Вхід» чи { uk: "Вхід", en: "Sign in" }. */
export const localizedTextSchema = z.union([
  z.string(),
  z.record(z.string(), z.string()),
])
export type LocalizedText = z.infer<typeof localizedTextSchema>

/** Текст мовою інтерфейсу; немає перекладу — перший наявний. */
export function localizedText(
  value: LocalizedText | undefined,
  language: string,
): string | undefined {
  if (value === undefined || typeof value === "string") return value
  return value[language] ?? Object.values(value)[0]
}
