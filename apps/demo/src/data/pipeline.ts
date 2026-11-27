import { z } from "zod"

import { recordBaseSchema } from "@/registry/lib/api"

import { COMPANIES } from "@/fixtures"

/**
 * Угоди демо для сторінки «Дошка» (UI07, ADR-0100): воронка з шести етапів, відповідальні — доріжки,
 * сума — колонки. Не модуль угод (B2): лише записи, на яких видно всі стани дошки.
 */
export const PIPELINE = "pipeline"

export const PIPELINE_STAGES = [
  "new",
  "qualified",
  "proposal",
  "negotiation",
  "won",
  "lost",
] as const
export type PipelineStage = (typeof PIPELINE_STAGES)[number]

/** Виграну угоду не повертають в інший етап: позначка сервера на записі (ADR-0037). */
export const PIPELINE_CLOSED_DENIAL = "closed"

export const pipelineDealSchema = recordBaseSchema.extend({
  companyId: z.string().nullable().optional(),
  title: z.string().trim().min(1).max(120),
  client: z.string().optional(),
  stage: z.enum(PIPELINE_STAGES),
  /** Сума в копійках (ADR-0056). */
  amount: z.number().int().min(0).optional(),
  /** Відповідальний: `id` людини з команди демо; без нього — «Без відповідального». */
  owner: z.string().nullable().optional(),
  /** Хто зараз редагує угоду (SPEC §8.1, стан 15). */
  editedBy: z.string().nullable().optional(),
})
export type PipelineDeal = z.infer<typeof pipelineDealSchema>

/** Відповідальні — доріжки дошки; порожній ключ — «Без відповідального». */
export const PIPELINE_OWNERS = ["u-olena", "u-ivan", "u-marta"] as const

/**
 * Перевірка швидкості (`pnpm perf`, ADR-0103): сторінка, відкрита з `#/board?cards=500`, бере колонку «Нові» на
 * 500 угод основної компанії, і дошка показує її одразу. Мок читає адресу один раз, коли вперше дає угоди.
 */
export const PIPELINE_STRESS_PARAM = "cards"
export const PIPELINE_STRESS_CARDS = 500

export function isPipelineStress(hash = globalThis.location.hash): boolean {
  const query = hash.split("?")[1] ?? ""
  return (
    new URLSearchParams(query).get(PIPELINE_STRESS_PARAM) ===
    String(PIPELINE_STRESS_CARDS)
  )
}

/** Скільки угод у кожному етапі: «Нові» довші за сторінку колонки, щоб було «Показати ще». */
const STAGE_SIZES: Record<PipelineStage, number> = {
  new: 26,
  qualified: 9,
  proposal: 7,
  negotiation: 5,
  won: 6,
  lost: 4,
}

const CLIENTS = [
  "ТОВ «Альфа Трейд»",
  "ПП «Березень»",
  "ТОВ «Вітрило»",
  "ФОП Гнатюк І. П.",
  "ТОВ «Дніпро Пак»",
  "ТОВ «Едельвейс»",
  "ПрАТ «Жайвір»",
  "ТОВ «Зелений світ»",
]

const SUBJECTS = [
  "Поставка палет",
  "Складське зберігання",
  "Доставка по Україні",
  "Річний договір перевезень",
  "Митне оформлення",
  "Пакування товару",
]

export function makePipelineDeals(): PipelineDeal[] {
  const isStress = isPipelineStress()
  const sizes = isStress
    ? { ...STAGE_SIZES, new: PIPELINE_STRESS_CARDS }
    : STAGE_SIZES
  let index = 0
  return PIPELINE_STAGES.flatMap((stage) =>
    Array.from({ length: sizes[stage] }, () => {
      index += 1
      const client = CLIENTS[index % CLIENTS.length] ?? ""
      return pipelineDealSchema.parse({
        id: `deal-${String(index)}`,
        version: 1,
        // Кожна сьома угода — другої компанії: перемикач компанії міняє дошку.
        companyId: (index % 7 === 0 && !isStress ? COMPANIES[1] : COMPANIES[0])
          .id,
        title: `${SUBJECTS[index % SUBJECTS.length] ?? ""}: ${client}`,
        client,
        stage,
        amount: ((index * 37_000) % 480_000) * 100 + 1_500_000,
        // Кожна п'ята — без відповідального: доріжка «Без відповідального».
        owner:
          index % 5 === 0
            ? null
            : PIPELINE_OWNERS[index % PIPELINE_OWNERS.length],
        // Одну угоду в переговорах зараз редагує колега.
        editedBy:
          stage === "negotiation" && index === 44 ? "Тарас Мельник" : null,
      })
    }),
  )
}
