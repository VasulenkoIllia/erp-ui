/**
 * Легкий набір (ADR-0099): елементи для проекту зі своїм сервером і своїм входом. Жоден не тягне бібліотеку даних
 * ra-core і її роутер — інакше проект без контракту кіта отримав би їх у залежності. Перелік — `LIGHT_SET` у
 * registry/registry.config.mjs, плюс усі `ui/*`; перевіряє `pnpm check:registry` за готовими елементами реєстру.
 */

/** Пакети, яких не тягне жоден елемент легкого набору. */
export const LIGHT_FORBIDDEN = ["ra-core", "react-router", "react-router-dom"]

/** Ім'я пакета із запису залежності реєстру: `@base-ui/react@^1.9.0` → `@base-ui/react`. */
function dependencyName(entry) {
  const at = entry.lastIndexOf("@")
  return at > 0 ? entry.slice(0, at) : entry
}

/** Елементи легкого набору: перелік і всі `ui/*`, без повторів, у порядку переліку. */
export function lightSetNames(items, lightSet) {
  const ui = items
    .map((item) => item.name)
    .filter((name) => name.startsWith("ui/"))
  return [...new Set([...lightSet, ...ui])]
}

/** Порушення: елемента з переліку немає в реєстрі чи він тягне заборонений пакет (з тим, що йде разом). */
export function lightSetProblems(items, lightSet) {
  const byName = new Map(items.map((item) => [item.name, item]))
  const problems = []
  for (const name of lightSetNames(items, lightSet)) {
    const item = byName.get(name)
    if (!item) {
      problems.push(
        `${name}: елемента легкого набору (LIGHT_SET) немає в реєстрі`,
      )
      continue
    }
    const packages = (item.dependencies ?? []).map(dependencyName)
    for (const forbidden of LIGHT_FORBIDDEN.filter((pkg) =>
      packages.includes(pkg),
    ))
      problems.push(
        `${name}: легкий набір (ADR-0099) не тягне «${forbidden}» — винесіть легку частину в окремий файл, а старий шлях хай її реекспортує`,
      )
  }
  return problems
}

/** Розділ каталогу: що з кіта бере проект зі своїм сервером. */
export function lightSetSection(lightSet) {
  const list = lightSet.map((name) => `\`${name}\``).join(", ")
  return [
    "## Легкий набір",
    "",
    "Для проекту зі своїм сервером і своїм входом, без контракту кіта (ADR-0099): ці елементи й усі `ui/*` не тягнуть ra-core і react-router. Як підключити — `docs/using-erp-ui.md`, «Легкий набір: свій сервер і свій вхід».",
    "",
    `- Елементи: ${list}.`,
    "",
  ].join("\n")
}
