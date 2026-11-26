/**
 * Запис `registry.json` (ADR-0004). CLI shadcn читає реєстр із GitHub лише до 5 МіБ, а кожен елемент перелічує всі
 * свої файли разом із залежностями: з відступами файл переріс межу. Тож елемент — один рядок: вміст той самий,
 * `git diff` показує, які елементи змінились, а файл на третину коротший, ніж з відступами в два пробіли.
 */

/** Найбільший `registry.json`, який CLI shadcn читає з GitHub-джерела, байт. */
export const GITHUB_SOURCE_LIMIT_BYTES = 5 * 1024 * 1024
/** Частка межі, з якої перевірка попереджає: час ділити реєстр, поки доставка не зупинилась. */
export const SIZE_WARN_SHARE = 0.85

/** `registry.json`: шапка й `items`, кожен елемент — окремий рядок. */
export function serializeRegistry(registry) {
  const { items, ...head } = registry
  const fields = Object.entries(head).map(
    ([key, value]) => `${JSON.stringify(key)}:${JSON.stringify(value)}`,
  )
  const lines = items.map((item) => JSON.stringify(item)).join(",\n")
  return `{${[...fields, `"items":[\n${lines}\n]`].join(",")}}\n`
}

/** Помилка, коли файл не пройде в CLI; попередження, коли до межі лишилось мало. */
export function registrySizeProblems(json) {
  const bytes = Buffer.byteLength(json)
  const size = `${(bytes / 1024 / 1024).toFixed(2)} МіБ із ${String(GITHUB_SOURCE_LIMIT_BYTES / 1024 / 1024)} МіБ`
  if (bytes > GITHUB_SOURCE_LIMIT_BYTES)
    return {
      error: `registry.json — ${size}: CLI shadcn не прочитає його з GitHub. Зменште перелік файлів елементів чи поділіть реєстр.`,
      warning: null,
    }
  if (bytes > GITHUB_SOURCE_LIMIT_BYTES * SIZE_WARN_SHARE)
    return {
      error: null,
      warning: `registry.json — ${size}: до межі CLI shadcn лишилось мало, час ділити реєстр.`,
    }
  return { error: null, warning: null }
}
