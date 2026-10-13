/**
 * Вподобання користувача на сервері (PF11, SPEC §6.2): палітра, тема, щільність, сайдбар, мова.
 *
 * - `GET /me/preferences` → вподобання; `PUT /me/preferences` — зберегти.
 * - Сервер — джерело правди; localStorage (lib/appearance) — лише кеш, щоб не блимало до відповіді.
 * - `syncPreferences` після входу застосовує серверні вподобання й далі надсилає кожну зміну
 *   (з паузою, щоб серія перемикань стала одним запитом).
 */
import { z } from "zod"

import type { ApiClient } from "@/registry/lib/api"
import {
  DENSITIES,
  getAppearance,
  PALETTES,
  pickAppearance,
  setAppearance,
  SIDEBARS,
  subscribeAppearance,
  THEME_MODES,
  type Appearance,
} from "@/registry/lib/appearance"
import { LANGUAGES } from "@/registry/lib/i18n"

export const preferencesSchema = z.object({
  palette: z.enum(PALETTES),
  theme: z.enum(THEME_MODES),
  density: z.enum(DENSITIES),
  sidebar: z.enum(SIDEBARS),
  language: z.enum(LANGUAGES),
})
export type Preferences = z.infer<typeof preferencesSchema>

const same = (a: Appearance, b: Appearance) =>
  (Object.keys(a) as (keyof Appearance)[]).every((key) => a[key] === b[key])

/**
 * Застосовує вподобання з сервера й стежить за змінами. Повертає функцію зупинки
 * (викликати при виході). Помилка завантаження не ламає застосунок: лишається кеш.
 */
export async function syncPreferences(
  client: ApiClient,
  { debounceMs = 500 }: { debounceMs?: number } = {},
): Promise<() => void> {
  let saved: Appearance = getAppearance()
  try {
    const remote = await client.get("/me/preferences", {
      schema: preferencesSchema.partial(),
    })
    // Лише те, що сервер знає: решта лишається типовою (компанії, бренду).
    const patch = pickAppearance(remote)
    saved = { ...getAppearance(), ...patch }
    if (Object.keys(patch).length) setAppearance(patch)
  } catch {
    // Офлайн чи сервер недоступний — працюємо з кешем, збережемо при наступній зміні.
  }

  let timer: ReturnType<typeof setTimeout> | undefined
  const unsubscribe = subscribeAppearance(() => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      const next = getAppearance()
      if (same(next, saved)) return
      saved = next
      client
        .put("/me/preferences", next, { schema: preferencesSchema })
        .catch(() => {
          // Не вдалося — спробуємо з наступною зміною; кеш уже оновлено.
        })
    }, debounceMs)
  })
  return () => {
    clearTimeout(timer)
    unsubscribe()
  }
}
