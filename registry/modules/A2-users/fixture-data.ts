/**
 * Довідник фікстур A2 (`fixtures.ts`): колеги з іменами й посадами українською й англійською,
 * локальна частина email латиницею. Імена — дані, а не рядки інтерфейсу (SPEC §11).
 */
import type { LocalizedText } from "@/lib/auth"

export interface ColleagueData {
  readonly name: LocalizedText & { readonly uk: string; readonly en: string }
  readonly email: string
  readonly position: LocalizedText & {
    readonly uk: string
    readonly en: string
  }
}

const person = (
  uk: string,
  en: string,
  email: string,
  positionUk: string,
  positionEn: string,
): ColleagueData => ({
  name: { uk, en },
  email,
  position: { uk: positionUk, en: positionEn },
})

export const COLLEAGUES: readonly ColleagueData[] = [
  person(
    "Андрій Бондар",
    "Andrii Bondar",
    "andrii.bondar",
    "Менеджер з продажу",
    "Sales manager",
  ),
  person(
    "Богдана Литвин",
    "Bohdana Lytvyn",
    "bohdana.lytvyn",
    "Бухгалтерка",
    "Accountant",
  ),
  person(
    "Віктор Савчук",
    "Viktor Savchuk",
    "viktor.savchuk",
    "Логіст",
    "Logistics coordinator",
  ),
  person(
    "Галина Кравець",
    "Halyna Kravets",
    "halyna.kravets",
    "Головна бухгалтерка",
    "Chief accountant",
  ),
  person(
    "Дмитро Ткаченко",
    "Dmytro Tkachenko",
    "dmytro.tkachenko",
    "Менеджер з продажу",
    "Sales manager",
  ),
  person("Ірина Мороз", "Iryna Moroz", "iryna.moroz", "Аудиторка", "Auditor"),
  person(
    "Катерина Олійник",
    "Kateryna Oliinyk",
    "kateryna.oliinyk",
    "Керівниця відділу продажу",
    "Head of sales",
  ),
  person(
    "Максим Гончар",
    "Maksym Honchar",
    "maksym.honchar",
    "Менеджер з продажу",
    "Sales manager",
  ),
  person(
    "Наталія Руденко",
    "Nataliia Rudenko",
    "nataliia.rudenko",
    "Бухгалтерка",
    "Accountant",
  ),
  person(
    "Олег Захарченко",
    "Oleh Zakharchenko",
    "oleh.zakharchenko",
    "Водій-експедитор",
    "Driver",
  ),
  person(
    "Павло Ковальчук",
    "Pavlo Kovalchuk",
    "pavlo.kovalchuk",
    "Менеджер з продажу",
    "Sales manager",
  ),
  person("Роман Сидоренко", "Roman Sydorenko", "roman.sydorenko", "", ""),
  person(
    "Світлана Павленко",
    "Svitlana Pavlenko",
    "svitlana.pavlenko",
    "Офіс-менеджерка",
    "Office manager",
  ),
  person(
    "Тарас Мельничук",
    "Taras Melnychuk",
    "taras.melnychuk",
    "Менеджер з продажу",
    "Sales manager",
  ),
  person(
    "Юлія Остапенко",
    "Yuliia Ostapenko",
    "yuliia.ostapenko",
    "Бухгалтерка",
    "Accountant",
  ),
  person(
    "Ярослав Дячук",
    "Yaroslav Diachuk",
    "yaroslav.diachuk",
    "Складський облік",
    "Warehouse clerk",
  ),
]

/** Хто заблокував колег у фікстурах — дані, а не рядок інтерфейсу. */
export const BLOCKED_BY: LocalizedText & {
  readonly uk: string
  readonly en: string
} = {
  uk: "Олена Коваль",
  en: "Olena Koval",
}

export const BLOCK_REASONS: readonly (LocalizedText & {
  readonly uk: string
  readonly en: string
})[] = [
  { uk: "Звільнився 30.09.2026", en: "Left the company on 30.09.2026" },
  { uk: "Підозрілі входи з-за кордону", en: "Suspicious sign-ins from abroad" },
]
